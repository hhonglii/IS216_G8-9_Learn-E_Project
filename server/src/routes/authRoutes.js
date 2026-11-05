// Account routes under /api: register, log in, log out and "who am I" (/auth/me).
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { loadSessionUser } from "../middleware/sessionUser.js";
import * as controller from "../controllers/authController.js";

const router = Router();
router.post("/auth/register", asyncHandler(controller.register));
router.post("/auth/login", asyncHandler(controller.login));
router.post(
  "/auth/logout",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.logout),
);
router.get(
  "/auth/me",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.me),
);

export default router;
