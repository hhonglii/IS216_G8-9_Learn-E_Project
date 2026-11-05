// Help queue routes under /api: ask for help, list a classroom's requests,
// claim, answer, resolve and unclaim a request, and withdraw your own.
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { loadSessionUser } from "../middleware/sessionUser.js";
import * as controller from "../controllers/helpRequestsController.js";

const router = Router();
router.post(
  "/help-requests",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.createHelpRequest),
);
router.get(
  "/classrooms/:id/help-requests",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.listHelpRequests),
);
router.put(
  "/help-requests/:id/claim",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.claimHelpRequest),
);
router.put(
  "/help-requests/:id/respond",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.respondToHelpRequest),
);
router.put(
  "/help-requests/:id/resolve",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.resolveHelpRequest),
);
router.put(
  "/help-requests/:id/unclaim",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.unclaimHelpRequest),
);
router.delete(
  "/help-requests/:id",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.withdrawHelpRequest),
);

export default router;
