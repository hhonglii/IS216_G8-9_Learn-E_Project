// Mini-project group routes under /api: create, join and leave a group, its
// tasks, stage evidence and repository link, the GitHub refresh, submitting
// the work and the professor's review.
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { loadSessionUser } from "../middleware/sessionUser.js";
import * as controller from "../controllers/groupsController.js";

const router = Router();
router.post(
  "/mini-projects/:id/groups",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.createGroup),
);
router.put(
  "/groups/:id/join",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.joinGroup),
);
router.put(
  "/groups/:id/leave",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.leaveGroup),
);
router.put(
  "/groups/:id/tasks",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.replaceTasks),
);
router.put(
  "/groups/:id/stages",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.updateStageEvidence),
);
router.put(
  "/groups/:id/repository",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.attachRepository),
);
router.post(
  "/groups/:id/github/refresh",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.refreshGroupGitHub),
);
router.put(
  "/groups/:id/submit",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.submitGroup),
);
router.put(
  "/groups/:id/review",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.reviewGroup),
);

export default router;
