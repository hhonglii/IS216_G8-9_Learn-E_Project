// Mini-project routes under /api: create, read, edit, delete and publish a
// brief, and upload, download and remove its files (decision H-10).
import express, { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { loadSessionUser } from "../middleware/sessionUser.js";
import * as controller from "../controllers/miniProjectsController.js";
import { MATERIAL_MAX_BYTES } from "../utils/materialFile.js";

const router = Router();
router.post(
  "/classrooms/:id/mini-projects",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.createMiniProject),
);
router.get(
  "/mini-projects/:id",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.getMiniProject),
);
// Drafts (H-8): the owning professor edits a draft, then publishes it.
router.put(
  "/mini-projects/:id",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.updateMiniProject),
);
router.delete(
  "/mini-projects/:id",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.deleteMiniProject),
);
router.post(
  "/mini-projects/:id/publish",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.publishMiniProject),
);
// Files for students (H-10). The upload body is the raw file of any type, up
// to 4 MB; anything larger is refused with 413 before the handler runs, and
// the handler checks the file really is a PDF or zip.
router.post(
  "/mini-projects/:id/materials",
  asyncHandler(loadSessionUser),
  express.raw({ type: () => true, limit: MATERIAL_MAX_BYTES }),
  asyncHandler(controller.uploadMaterial),
);
router.get(
  "/mini-projects/:id/materials/:materialId",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.downloadMaterial),
);
router.delete(
  "/mini-projects/:id/materials/:materialId",
  asyncHandler(loadSessionUser),
  asyncHandler(controller.deleteMaterial),
);

export default router;
