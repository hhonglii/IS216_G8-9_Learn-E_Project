/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — Classroom Games handlers
 *  The owning professor edits, publishes and reads class results. A member
 *  student plays the published battle. Answers are marked here, one at a time,
 *  so correct answers and hearts never depend on the browser.
 * ══════════════════════════════════════════════════════════════════
 */
import mongoose from "mongoose";
import Classroom from "../models/Classroom.js";
import ClassroomGame from "../models/ClassroomGame.js";
import GamePlay from "../models/GamePlay.js";
import Membership from "../models/Membership.js";
import { HttpError } from "../utils/httpError.js";
import {
  BOSS_IDS,
  filledOptions,
  validateGameDraft,
  validateGameDraftRequest,
  validateGamePublication,
} from "../utils/classroomGameDraft.js";
import {
  toPlayDto,
  toProfessorGameDto,
  toStudentGameDto,
} from "../utils/classroomGameDto.js";
import {
  nextPlayState,
  summariseResults,
} from "../services/classroomGameService.js";
import { requestGameQuestionDrafts } from "../services/geminiService.js";

const OBJECT_ID = /^[a-fA-F0-9]{24}$/;
const isOwner = (user, classroom) =>
  user.role === "professor" && String(user._id) === String(classroom.professorId);

function requireUser(req, action) {
  if (!req.prototypeUser)
    throw new HttpError(401, "UNAUTHENTICATED", `Log in to ${action}.`);
  return req.prototypeUser;
}

function requireObjectId(value, label) {
  if (typeof value !== "string" || !OBJECT_ID.test(value))
    throw new HttpError(400, "VALIDATION_FAILED", `${label} id must be a MongoDB ObjectId.`, [
      { field: "id", message: `${label} id must be a MongoDB ObjectId.` },
    ]);
}

async function loadClassroom(req) {
  requireObjectId(req.params.id, "Classroom");
  const classroom = await Classroom.findById(req.params.id);
  if (!classroom)
    throw new HttpError(404, "CLASSROOM_NOT_FOUND", "Classroom was not found.");
  return classroom;
}

async function requireOwner(req, action) {
  const user = requireUser(req, action);
  const classroom = await loadClassroom(req);
  if (!isOwner(user, classroom))
    throw new HttpError(403, "FORBIDDEN", "Only the owning professor may do this.");
  return { user, classroom };
}

async function isMemberStudent(user, classroomId) {
  if (user.role !== "student") return false;
  const membership = await Membership.findOne({ classroomId, userId: user._id });
  return Boolean(membership);
}

const notFound = () =>
  new HttpError(404, "GAME_NOT_FOUND", "This classroom has no game yet.");

const invalidGame = (message, details) =>
  new HttpError(400, "VALIDATION_FAILED", message, details);

async function saveGame(game) {
  try {
    await game.save();
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError)
      throw invalidGame(
        "The game input is invalid.",
        Object.keys(error.errors).map((field) => ({
          field,
          message: "Field failed validation.",
        })),
      );
    // Two tabs, or two people, creating or saving the same game at once.
    if (error instanceof mongoose.Error.VersionError || error.code === 11000)
      throw new HttpError(
        409,
        "GAME_CONFLICT",
        "This game changed somewhere else. Reload the page before trying again.",
      );
    throw error;
  }
}

// One address, two views: the owner gets the editable game, a member student
// gets the published battle or null, which the page shows as "no game created".
export async function getClassroomGame(req, res) {
  const user = requireUser(req, "open classroom games");
  const classroom = await loadClassroom(req);
  const game = await ClassroomGame.findOne({ classroomId: classroom._id });

  if (isOwner(user, classroom))
    return res.status(200).json({
      data: { viewer: "professor", game: game ? toProfessorGameDto(game) : null },
    });

  if (!(await isMemberStudent(user, classroom._id)))
    throw new HttpError(403, "FORBIDDEN", "Join this classroom to open its games.");

  if (!game || game.status !== "published")
    return res.status(200).json({
      data: { viewer: "student", game: null, play: null, defeated: false },
    });

  const [play, won] = await Promise.all([
    GamePlay.findOne({
      gameId: game._id,
      gameVersion: game.version,
      studentId: user._id,
      status: "in-progress",
    }),
    GamePlay.exists({
      gameId: game._id,
      gameVersion: game.version,
      studentId: user._id,
      status: "won",
    }),
  ]);
  return res.status(200).json({
    data: {
      viewer: "student",
      game: toStudentGameDto(game),
      play: play ? toPlayDto(play, game) : null,
      defeated: Boolean(won),
    },
  });
}

// Autosave target: creates the draft on the first save, then updates it.
export async function saveClassroomGame(req, res) {
  const { user, classroom } = await requireOwner(req, "edit this game");
  const { details, fields } = validateGameDraft(req.body);
  if (details.length) throw invalidGame("The game input is invalid.", details);

  let game = await ClassroomGame.findOne({ classroomId: classroom._id });
  if (game?.status === "published")
    throw new HttpError(
      409,
      "GAME_PUBLISHED",
      "Unpublish this game before editing it.",
    );
  const created = !game;
  if (!game)
    game = new ClassroomGame({
      classroomId: classroom._id,
      createdBy: user._id,
      bossId: BOSS_IDS[0],
    });
  game.set(fields);
  await saveGame(game);
  return res.status(created ? 201 : 200).json({ data: toProfessorGameDto(game) });
}

// Checks stored content, never the request. Each publication starts fresh
// results, because the questions may have changed. Repeats change nothing.
export async function publishClassroomGame(req, res) {
  const { classroom } = await requireOwner(req, "publish this game");
  const game = await ClassroomGame.findOne({ classroomId: classroom._id });
  if (!game) throw notFound();
  if (game.status === "published")
    return res.status(200).json({ data: toProfessorGameDto(game) });
  const details = validateGamePublication(game);
  if (details.length)
    throw invalidGame("This game is not ready to publish yet.", details);
  game.status = "published";
  game.version += 1;
  await saveGame(game);
  return res.status(200).json({ data: toProfessorGameDto(game) });
}

// Runs in progress end here, because their questions may be about to change. This
// always runs, so retrying after a failure halfway finishes the job.
export async function unpublishClassroomGame(req, res) {
  const { classroom } = await requireOwner(req, "unpublish this game");
  const game = await ClassroomGame.findOne({ classroomId: classroom._id });
  if (!game) throw notFound();
  if (game.status === "published") {
    game.status = "draft";
    await saveGame(game);
  }
  await GamePlay.updateMany(
    { gameId: game._id, status: "in-progress" },
    { $set: { status: "abandoned", completedAt: new Date() } },
  );
  return res.status(200).json({ data: toProfessorGameDto(game) });
}

export async function getClassroomGameResults(req, res) {
  const { classroom } = await requireOwner(req, "read these results");
  const game = await ClassroomGame.findOne({ classroomId: classroom._id });
  if (!game) throw notFound();
  const plays = await GamePlay.find({
    gameId: game._id,
    gameVersion: game.version,
  })
    .sort({ createdAt: 1 })
    .select("studentId status answers");
  // Only students have memberships; the professor owns the classroom instead.
  const memberships = await Membership.find({ classroomId: classroom._id }).populate(
    "userId",
    "displayName",
  );
  const students = memberships
    .filter((membership) => membership.userId)
    .map((membership) => ({
      id: String(membership.userId._id),
      name: membership.userId.displayName,
    }));
  return res.status(200).json({ data: summariseResults(game, plays, students) });
}

// Suggestions are only returned, never saved: the editor adds them as drafts
// that the professor must approve before the game can be published.
export async function draftGameQuestions(req, res) {
  await requireOwner(req, "generate questions");
  const { details, request } = validateGameDraftRequest(req.body);
  if (details.length)
    throw new HttpError(
      400,
      "GAME_DRAFT_INVALID",
      "Check the generation request and try again.",
      details,
    );
  const questions = await requestGameQuestionDrafts(request);
  return res.status(200).json({ data: { questions } });
}

// Starts a run, or resumes the one already in progress.
export async function startGamePlay(req, res) {
  const user = requireUser(req, "play this game");
  const classroom = await loadClassroom(req);
  if (!(await isMemberStudent(user, classroom._id)))
    throw new HttpError(403, "FORBIDDEN", "Only students in this classroom can play.");
  const game = await ClassroomGame.findOne({
    classroomId: classroom._id,
    status: "published",
  });
  if (!game) throw notFound();
  const inProgress = { gameId: game._id, studentId: user._id, status: "in-progress" };
  const filter = { ...inProgress, gameVersion: game.version };
  const existing = await GamePlay.findOne(filter);
  if (existing)
    return res.status(200).json({ data: { play: toPlayDto(existing, game) } });
  // A run from an older version can never be answered, and would block the new one.
  await GamePlay.updateMany(
    { ...inProgress, gameVersion: { $ne: game.version } },
    { $set: { status: "abandoned", completedAt: new Date() } },
  );
  try {
    const play = await GamePlay.create({
      gameId: game._id,
      gameVersion: game.version,
      studentId: user._id,
      maxHearts: game.hearts,
      heartsLeft: game.hearts,
      questionQueue: game.questions.map((question) => question.id),
    });
    return res.status(201).json({ data: { play: toPlayDto(play, game) } });
  } catch (error) {
    // Another tab started the run first, so join that one.
    if (error.code !== 11000) throw error;
    const raced = await GamePlay.findOne(filter);
    if (!raced) throw error;
    return res.status(200).json({ data: { play: toPlayDto(raced, game) } });
  }
}

export async function answerGamePlay(req, res) {
  const user = requireUser(req, "play this game");
  requireObjectId(req.params.id, "Run");
  const play = await GamePlay.findById(req.params.id);
  if (!play) throw new HttpError(404, "PLAY_NOT_FOUND", "This run was not found.");
  if (String(play.studentId) !== String(user._id))
    throw new HttpError(403, "FORBIDDEN", "This run belongs to someone else.");
  const changed = () =>
    new HttpError(409, "PLAY_CHANGED", "This battle changed. Reload it to continue.");
  if (play.status !== "in-progress") throw changed();

  const game = await ClassroomGame.findById(play.gameId);
  if (
    !game ||
    game.status !== "published" ||
    game.version !== play.gameVersion ||
    !(await isMemberStudent(user, game.classroomId))
  )
    throw changed();

  const { questionId, optionId, answerCount } = req.body ?? {};
  // Only the current question counts, so a stale tab cannot spend a heart. A missed
  // last question comes straight back and still looks current, so the browser also
  // says how many answers it has seen.
  if (questionId !== play.questionQueue[0]) throw changed();
  if (answerCount !== undefined && answerCount !== play.answers.length) throw changed();
  const question = game.questions.find((item) => item.id === questionId);
  if (!question) throw changed();
  if (!filledOptions(question).some((option) => option.id === optionId))
    throw invalidGame("Choose one of the answers.", [
      { field: "optionId", message: "Choose one of the answers." },
    ]);

  const correct = optionId === question.correctOptionId;
  const next = nextPlayState(play, correct);
  play.heartsLeft = next.heartsLeft;
  play.questionQueue = next.questionQueue;
  play.status = next.status;
  if (next.status !== "in-progress") play.completedAt = new Date();
  play.answers.push({ questionId, optionId, correct, submittedAt: new Date() });
  try {
    await play.save();
  } catch (error) {
    // A double click: the first save won, and this one must not cost a heart.
    if (error instanceof mongoose.Error.VersionError) throw changed();
    throw error;
  }
  // A wrong answer's question comes back later, so its explanation would give the
  // answer away. "What to review" in toPlayDto still shows it at the end.
  return res.status(200).json({
    data: {
      correct,
      explanation: correct ? question.explanation : "",
      play: toPlayDto(play, game),
    },
  });
}
