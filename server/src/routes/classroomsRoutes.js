// Classroom routes under /api: create, join, leave, delete, read one, the
// leaderboard, the professor's insights and what is waiting on the caller.
// /classrooms/waiting sits above /classrooms/:id, or Express would read
// "waiting" as a classroom id.
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { loadSessionUser } from "../middleware/sessionUser.js";
import * as controller from "../controllers/classroomsController.js";

const router = Router();
router.post(
  "/classrooms",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.createClassroom),
);
router.post(
  "/classrooms/join",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.joinClassroom),
);
router.put(
  "/classrooms/:id/leave",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.leaveClassroom),
);
router.get(
  "/classrooms/waiting",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.getWaitingOnMe),
);
router.get(
  "/classrooms/:id",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.getClassroom),
);
router.delete(
  "/classrooms/:id",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.deleteClassroom),
);
router.get(
  "/classrooms/:id/leaderboard",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.getLeaderboard),
);
router.get(
  "/classrooms/:id/insights",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.getInsights),
);


export default router;
