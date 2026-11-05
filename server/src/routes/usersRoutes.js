// User routes under /api: change your display name or password, and read a
// profile.
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { loadSessionUser } from "../middleware/sessionUser.js";
import * as controller from "../controllers/usersController.js";

const router = Router();
router.put(
  "/users/me",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.updateMe),
);
router.put(
  "/users/me/password",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.changePassword),
);
router.get(
  "/users/:id/profile",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.getProfile),
);

export default router;
