/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — account handlers
 *  register and login both answer with a new session token and the user.
 *  The server keeps only a hash of the token (sessionService), passwords are
 *  stored as scrypt hashes (passwordService), and a professor account needs
 *  PROFESSOR_SIGNUP_CODE from the server's environment. me says who the token
 *  belongs to; logout deletes that one session.
 * ══════════════════════════════════════════════════════════════════ */
import {
  passwordProblem,
  hashPassword,
  verifyPassword,
} from "../services/passwordService.js";
import User from "../models/User.js";
import { startSession } from "../services/sessionService.js";
import { toUserResponse } from "../utils/userDto.js";
import Session from "../models/Session.js";
import { environment } from "../config/environment.js";
import { sendError } from "../utils/httpError.js";


export async function register(req, res) {
  let username = req.body?.username;
  let displayName = req.body?.displayName;
  const role = req.body?.role;
  const password = req.body?.password;
  const details = [];
  if (
    typeof username !== "string" ||
    !/^[a-z0-9._-]{3,30}$/.test(username.trim().toLowerCase())
  ) {
    details.push({
      field: "username",
      message:
        "Username must be 3 to 30 letters, numbers, dots, dashes or underscores.",
    });
  }
  if (
    typeof displayName !== "string" ||
    displayName.trim().length < 1 ||
    displayName.trim().length > 60 
  ) {
    details.push({
      field: "displayName",
      message: "Enter a display name of 1 to 60 characters.",
    });
  }
  if (role !== "student" && role !== "professor") {
    details.push({
      field: "role",
      message: "Role must be either student or professor.",
    });
  }
  if (
    role === "professor" &&
    (environment.professorSignupCode === "" ||
      req.body?.professorCode !== environment.professorSignupCode)
  ) {
    details.push({
      field: "professorCode",
      message: "Professor accounts need the professor sign-up code.",
    });
  }
  const passwordIssue = passwordProblem(password);
  if (passwordIssue) {
    details.push({
      field: "password",
      message: passwordIssue,
    });
  }
  if (details.length > 0) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "Check the highlighted fields.",
      details,
    );
  }
  displayName = displayName.trim();
  username = username.trim().toLowerCase();
  try {
    const user = await User.create({
      username,
      displayName,
      role,
      passwordHash: await hashPassword(password),
    });
    const token = await startSession(user._id);
    return res
      .status(201)
      .json({ data: { token, user: toUserResponse(user) } });
  } catch (err) {
    if (err.code === 11000) {
      return sendError(res, 409, "USERNAME_TAKEN", "That username is taken");
    } else {
      throw err;
    }
  }
}

export async function login(req, res) {
  const username = req.body?.username;
  const password = req.body?.password;
  let user;
  if (
    typeof username !== "string" ||
    username.length === 0 ||
    typeof password !== "string" ||
    password.length === 0
  ) {
    return sendError(
      res,
      401,
      "INVALID_CREDENTIALS",
      "Username or password is incorrect.",
    );
  }
  user = await User.findOne({
    username: username.trim().toLowerCase(),
  }).select("+passwordHash");
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return sendError(
      res,
      401,
      "INVALID_CREDENTIALS",
      "Username or password is incorrect.",
    );
  }
  const token = await startSession(user._id);
  return res.status(200).json({ data: { token, user: toUserResponse(user) } });
}

export function me(req, res){
    if (!req.prototypeUser){
        return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
    } else {
        return res.status(200).json({ data: toUserResponse(req.prototypeUser) });
    }
}

export async function logout(req, res){
    if (!req.prototypeUser) {
      return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
    }
    await Session.deleteOne({ _id: req.sessionId });
    return res.status(204).end();
}
