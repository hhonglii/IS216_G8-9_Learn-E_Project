// Runs before every route that cares who is asking. It reads the
// "Authorization: Bearer <token>" header, finds the unexpired session by the
// token's hash, and puts the user on req.prototypeUser. No header means a
// logged-out request (req.prototypeUser stays null, and each handler decides);
// a token that matches no session or user answers 401.
import mongoose from "mongoose";
import User from "../models/User.js";
import { HttpError } from "../utils/httpError.js";
import { hashToken } from "../services/sessionService.js";
import Session from "../models/Session.js";

export async function loadSessionUser(req, res, next) {
  req.prototypeUser = null;
  req.sessionId = null;
  const header = req.get("Authorization");
  if (!header) {
    return next();
  } else if (!header.startsWith("Bearer ") || header.slice(7).length === 0) {
    return next(
      new HttpError(
        401,
        "INVALID_SESSION",
        "Your session has ended. Please log in again.",
      ),
    );
  }
  if (mongoose.connection.readyState !== 1) return next();
  const session = await Session.findOne({
    tokenHash: hashToken(header.slice(7)),
    expiresAt: { $gt: new Date() },
  });
  if (!session) {
    return next(
      new HttpError(
        401,
        "INVALID_SESSION",
        "Your session has ended. Please log in again.",
      ),
    );
  }
  const user = await User.findById(session.userId);
  if (!user){
    return next(
      new HttpError(
        401,
        "INVALID_SESSION",
        "Your session has ended. Please log in again.",
      ),
    );
  }
  req.prototypeUser = user;
  req.sessionId = session._id;
  return next()
}
