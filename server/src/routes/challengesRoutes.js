// Challenge routes under /api: drafting with Gemini content and hint drafts,
// creating, editing, deleting and publishing challenges, reading one, and the
// attempts students send and professors review.
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { loadSessionUser } from "../middleware/sessionUser.js";
import * as controller from "../controllers/challengesController.js";

const router = Router();
router.post(
  "/classrooms/:id/challenge-content-drafts",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.draftChallengeContent),
);
router.post(
  "/classrooms/:id/challenges",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.createChallenge),
);
router.put(
  "/challenges/:id",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.updateChallenge),
);
router.delete(
  "/challenges/:id",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.deleteChallenge),
);
router.post(
  "/challenges/:id/publish",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.publishChallenge),
);
router.post(
  "/challenges/:id/hint-drafts",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.draftHints),
);
router.get(
  "/challenges/:id",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.getChallenge),
);
router.post(
  "/challenges/:id/attempts",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.createAttempt),
);
router.put(
  "/attempts/:id/applied",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.submitAppliedDiagnosis),
);
router.put(
  "/attempts/:id/review",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.reviewAttempt),
);

export default router;
