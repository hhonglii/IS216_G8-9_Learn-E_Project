// Classroom Games routes under /api: the professor's editor (save, publish,
// unpublish, class results, question drafts) and a student's runs (start a run,
// answer the current question). One game per classroom.
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { loadSessionUser } from "../middleware/sessionUser.js";
import * as controller from "../controllers/classroomGamesController.js";

const router = Router();
router.get(
  "/classrooms/:id/game",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.getClassroomGame),
);
router.put(
  "/classrooms/:id/game",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.saveClassroomGame),
);
router.post(
  "/classrooms/:id/game/publish",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.publishClassroomGame),
);
router.post(
  "/classrooms/:id/game/unpublish",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.unpublishClassroomGame),
);
router.get(
  "/classrooms/:id/game/results",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.getClassroomGameResults),
);
router.post(
  "/classrooms/:id/game/question-drafts",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.draftGameQuestions),
);
router.post(
  "/classrooms/:id/game/plays",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.startGamePlay),
);
router.post(
  "/game-plays/:id/answers",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.answerGamePlay),
);

export default router;
