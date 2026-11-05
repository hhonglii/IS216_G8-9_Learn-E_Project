/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — mini-project handlers
 *  A professor creates a draft, edits it as often as they like, then
 *  publishes it. Students only ever see published briefs, and a published
 *  brief can no longer be edited (H-8, which replaced E-1's single create call
 *  that published at once). Files for students (H-10) follow the same rule:
 *  added and removed only while the brief is a draft.
 * ══════════════════════════════════════════════════════════════════
 */
import mongoose from "mongoose";
import Classroom from "../models/Classroom.js";
import MiniProject from "../models/MiniProject.js";
import Challenge from "../models/Challenge.js";
import {
  validateMiniProjectDraft,
  publicationProblems,
  draftMiniProjectFields,
} from "../utils/miniProjectDraft.js";
import Membership from "../models/Membership.js";
import ProjectGroup from "../models/ProjectGroup.js";
import User from "../models/User.js";
import {
  MATERIAL_MAX_FILES,
  attachmentHeader,
  checkMaterial,
  cleanFileName,
} from "../utils/materialFile.js";
import {
  deleteMaterialFile,
  readMaterialFile,
  saveMaterialFile,
} from "../services/materialStore.js";
import { sendError } from "../utils/httpError.js";

const objectIdPattern = /^[a-fA-F0-9]{24}$/;


function sendValidation(res, details) {
  return sendError(
    res,
    400,
    "VALIDATION_FAILED",
    "Some fields need fixing.",
    details,
  );
}

// What the page needs to list a file. The GridFS id stays on the server.
function materialDto(material) {
  return {
    id: String(material._id),
    name: material.name,
    size: material.size,
    contentType: material.contentType,
    uploadedAt: material.uploadedAt,
  };
}

// The brief's own fields, with string ids. Every handler answers with these.
function briefDto(miniProject) {
  return {
    id: String(miniProject._id),
    classroomId: String(miniProject.classroomId),
    title: miniProject.title,
    brief: miniProject.brief ?? "",
    starterRepoUrl: miniProject.starterRepoUrl,
    maxGroupSize: miniProject.maxGroupSize,
    stageInstructions: miniProject.stageInstructions,
    acceptanceCriteria: [...(miniProject.acceptanceCriteria ?? [])],
    rubric: miniProject.rubric ?? "",
    materials: (miniProject.materials ?? []).map(materialDto),
    status: miniProject.status,
    ...(miniProject.qualifyingChallengeId
      ? { qualifyingChallengeId: String(miniProject.qualifyingChallengeId) }
      : {}),
    createdBy: String(miniProject.createdBy),
  };
}

// A qualifying challenge must be published and in the same classroom (E-2).
// Answers 400 and returns false when it is not.
async function qualifyingChallengeOk(res, classroomId, challengeId) {
  if (!challengeId) return true;
  const qualifying = await Challenge.findOne({
    _id: String(challengeId),
    classroomId,
    status: "published",
  });
  if (qualifying) return true;
  sendValidation(res, [
    {
      field: "qualifyingChallengeId",
      message: "Qualifying challenge must be a published challenge",
    },
  ]);
  return false;
}

function validationDetails(error) {
  return Object.keys(error.errors).map((field) => ({
    field,
    message: "This field isn't valid.",
  }));
}

// A published brief stays fixed (H-8), its files included (H-10).
function refusePublished(res) {
  return sendError(
    res,
    409,
    "MINIPROJECT_PUBLISHED",
    "A published mini-project can no longer be edited.",
  );
}

// Loads the brief for its owning professor, or answers the error and returns null.
async function ownedMiniProject(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
    return null;
  }
  const id = req.params.id;
  if (typeof id !== "string" || !objectIdPattern.test(id)) {
    sendError(res, 400, "VALIDATION_FAILED", "That mini-project link isn't valid.", {
      field: "id",
    });
    return null;
  }
  const miniProject = await MiniProject.findById(id);
  const classroom =
    miniProject && (await Classroom.findById(miniProject.classroomId));
  if (!miniProject || !classroom) {
    sendError(res, 404, "MINIPROJECT_NOT_FOUND", "That mini-project doesn't exist.", {
      field: "id",
    });
    return null;
  }
  if (
    user.role !== "professor" ||
    String(user._id) !== String(classroom.professorId)
  ) {
    sendError(res, 403, "FORBIDDEN", "Only the professor who owns this classroom can change its mini-projects.");
    return null;
  }
  return miniProject;
}

export async function createMiniProject(req, res) {
  const user = req.prototypeUser;
  if (!user) return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");

  const classroomId = req.params.id;
  if (typeof classroomId !== "string" || !objectIdPattern.test(classroomId)) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "That classroom link isn't valid.",
      { field: "id" },
    );
  }

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) {
    return sendError(
      res,
      404,
      "CLASSROOM_NOT_FOUND",
      "That classroom doesn't exist.",
      { field: "id" },
    );
  }

  if (
    user.role !== "professor" ||
    String(user._id) !== String(classroom.professorId)
  ) {
    return sendError(
      res,
      403,
      "FORBIDDEN",
      "Only the professor who owns this classroom can create a mini-project.",
    );
  }

  const details = validateMiniProjectDraft(req.body);
  if (details.length) return sendValidation(res, details);
  const fields = draftMiniProjectFields(req.body);
  if (
    !(await qualifyingChallengeOk(res, classroom._id, fields.qualifyingChallengeId))
  )
    return;

  let miniProject;
  try {
    miniProject = await MiniProject.create({
      ...fields,
      classroomId: classroom._id,
      createdBy: user._id,
      status: "draft",
    });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError)
      return sendValidation(res, validationDetails(error));
    throw error;
  }
  return res.status(201).json({ data: briefDto(miniProject) });
}

// PUT /mini-projects/:id saves changes to a draft. Fields left out of the body
// keep their saved values. A published brief answers 409 (H-8).
export async function updateMiniProject(req, res) {
  const miniProject = await ownedMiniProject(req, res);
  if (!miniProject) return;
  if (miniProject.status === "published") return refusePublished(res);
  const details = validateMiniProjectDraft(req.body);
  if (details.length) return sendValidation(res, details);
  const fields = draftMiniProjectFields(req.body);
  if (
    !(await qualifyingChallengeOk(
      res,
      miniProject.classroomId,
      fields.qualifyingChallengeId,
    ))
  )
    return;

  miniProject.set(fields);
  try {
    await miniProject.save();
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError)
      return sendValidation(res, validationDetails(error));
    throw error;
  }
  return res.status(200).json({ data: briefDto(miniProject) });
}

// POST /mini-projects/:id/publish checks the saved draft is complete, then
// makes it visible to students. Publishing again answers the same brief.
export async function publishMiniProject(req, res) {
  const miniProject = await ownedMiniProject(req, res);
  if (!miniProject) return;
  if (miniProject.status === "published")
    return res.status(200).json({ data: briefDto(miniProject) });

  const saved = briefDto(miniProject);
  const details = publicationProblems({
    ...saved,
    starterRepoUrl: saved.starterRepoUrl ?? "",
  });
  if (details.length) return sendValidation(res, details);
  if (
    !(await qualifyingChallengeOk(
      res,
      miniProject.classroomId,
      miniProject.qualifyingChallengeId,
    ))
  )
    return;

  miniProject.status = "published";
  await miniProject.save();
  return res.status(200).json({ data: briefDto(miniProject) });
}

// Loads the brief for anyone allowed to read it: the owning professor, or a
// student in the classroom once it is published. Answers the error and returns
// null otherwise. getMiniProject and material downloads share these rules.
async function viewableMiniProject(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
    return null;
  }
  const miniProjectId = req.params.id;
  if (
    typeof miniProjectId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(miniProjectId)
  ) {
    sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "That mini-project link isn't valid.",
      { field: "id" },
    );
    return null;
  }
  const miniProject = await MiniProject.findById(miniProjectId);
  if (!miniProject) {
    sendError(res, 404, "MINIPROJECT_NOT_FOUND", "That mini-project doesn't exist.", { field: "id" });
    return null;
  }
  const classroom = await Classroom.findById(miniProject.classroomId);
  if (!classroom) {
    sendError(res, 404, "CLASSROOM_NOT_FOUND", "That classroom doesn't exist.");
    return null;
  }
  // member refers to student joining
  const isOwner =
    user.role === "professor" &&
    String(user._id) === String(classroom.professorId);
  let isMember = false;
  if (user.role === "student") {
    const membership = await Membership.findOne({
      classroomId: classroom._id,
      userId: user._id,
    });
    isMember = !!membership;
  }
  // not owner or member, reject
  if (!isOwner && !isMember) {
    sendError(res, 403, "FORBIDDEN", "You're not in this classroom.");
    return null;
  }
  if (!isOwner && miniProject.status !== "published") {
    sendError(res, 404, "MINIPROJECT_NOT_FOUND", "That mini-project doesn't exist.", { field: "id" });
    return null;
  }
  return { miniProject, isOwner };
}

// The material named in the URL, or null after answering 404.
function materialIn(miniProject, req, res) {
  const { materialId } = req.params;
  const material = objectIdPattern.test(materialId)
    ? miniProject.materials.id(materialId)
    : null;
  if (!material)
    sendError(res, 404, "MATERIAL_NOT_FOUND", "No file found with that id.", {
      field: "materialId",
    });
  return material;
}

// POST /mini-projects/:id/materials adds one file to a draft. The body is the
// raw file and the X-File-Name header carries its URI-encoded name, so no
// multipart parser is needed (H-10). Answers 201 with the new file's entry.
export async function uploadMaterial(req, res) {
  const miniProject = await ownedMiniProject(req, res);
  if (!miniProject) return;
  if (miniProject.status === "published") return refusePublished(res);
  if (miniProject.materials.length >= MATERIAL_MAX_FILES) {
    return sendValidation(res, [
      {
        field: "file",
        message: `A mini-project can have at most ${MATERIAL_MAX_FILES} files. Remove one first.`,
      },
    ]);
  }
  const name = cleanFileName(req.get("X-File-Name"));
  const checked = checkMaterial(name, req.body);
  if (checked.problem)
    return sendValidation(res, [{ field: "file", message: checked.problem }]);

  const fileId = await saveMaterialFile(req.body, name, checked.contentType);
  miniProject.materials.push({
    fileId,
    name,
    size: req.body.length,
    contentType: checked.contentType,
  });
  try {
    await miniProject.save();
  } catch (error) {
    // Without its list entry nobody could reach the file, so remove it.
    await deleteMaterialFile(fileId);
    throw error;
  }
  return res
    .status(201)
    .json({ data: materialDto(miniProject.materials.at(-1)) });
}

// GET /mini-projects/:id/materials/:materialId sends the file to anyone who
// can read the brief. It is always a download, never shown inline, and
// nosniff stops the browser guessing a different type.
export async function downloadMaterial(req, res) {
  const viewable = await viewableMiniProject(req, res);
  if (!viewable) return;
  const material = materialIn(viewable.miniProject, req, res);
  if (!material) return;
  const file = await readMaterialFile(material.fileId);
  if (!file)
    return sendError(res, 404, "MATERIAL_NOT_FOUND", "No file found with that id.", {
      field: "materialId",
    });
  res.set({
    "Content-Type": material.contentType,
    "Content-Disposition": attachmentHeader(material.name),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  });
  return res.status(200).send(file);
}

// DELETE /mini-projects/:id removes a draft and its uploaded files. Students
// never see a draft, so it has no groups. A published brief answers 409.
export async function deleteMiniProject(req, res) {
  const miniProject = await ownedMiniProject(req, res);
  if (!miniProject) return;
  if (miniProject.status === "published") return refusePublished(res);
  const result = await MiniProject.deleteOne({ _id: miniProject._id, status: "draft" });
  if (result.deletedCount === 0) return refusePublished(res);
  for (const material of miniProject.materials ?? []) {
    await deleteMaterialFile(material.fileId);
  }
  return res.status(204).end();
}

// DELETE /mini-projects/:id/materials/:materialId removes a file from a draft.
export async function deleteMaterial(req, res) {
  const miniProject = await ownedMiniProject(req, res);
  if (!miniProject) return;
  if (miniProject.status === "published") return refusePublished(res);
  const material = materialIn(miniProject, req, res);
  if (!material) return;
  const { fileId } = material;
  miniProject.materials.pull(material._id);
  await miniProject.save();
  await deleteMaterialFile(fileId);
  return res.status(204).end();
}

export async function getMiniProject(req, res) {
  const user = req.prototypeUser;
  const viewable = await viewableMiniProject(req, res);
  if (!viewable) return;
  const { miniProject, isOwner } = viewable;
  const groups = await ProjectGroup.find({ miniProjectId: miniProject._id });

  const myGroup = isOwner
    ? null
    : groups.find((group) =>
        group.memberIds.some(
          (memberId) => String(memberId) === String(user._id),
        ),
      );
  const visibleGroups = isOwner ? groups : myGroup ? [myGroup] : [];
  const members = await User.find(
    { _id: { $in: visibleGroups.flatMap((group) => group.memberIds) } },
    { displayName: 1 },
  );
  const nameById = new Map(
    members.map((member) => [String(member._id), member.displayName]),
  );

  const toWorkspace = (group) => ({
    id: String(group._id),
    name: group.name,
    members: group.memberIds.map((memberId) => ({
      id: String(memberId),
      displayName: nameById.get(String(memberId)) || "Unknown student",
    })),
    tasks: group.tasks.map((task) => ({
      id: String(task._id),
      title: task.title,
      ownerId: task.ownerId ? String(task.ownerId) : null,
      status: task.status,
      evidenceUrl: task.evidenceUrl ?? "",
    })),
    stageEvidence: {
      Diagnose: group.stageEvidence?.Diagnose ?? "",
      Repair: group.stageEvidence?.Repair ?? "",
      Extend: group.stageEvidence?.Extend ?? "",
      Verify: group.stageEvidence?.Verify ?? "",
      Reflect: group.stageEvidence?.Reflect ?? "",
    },
    updatedAt: group.updatedAt,
    repositoryUrl: group.repositoryUrl ?? "",
    github: group.githubCache
      ? {
          repository: group.githubCache.repository,
          commits: group.githubCache.commits,
          contributors: group.githubCache.contributors ?? null,
        }
      : null,
    lastRefreshedAt: group.githubCache?.lastRefreshedAt ?? null,
    submissionStatus: group.submissionStatus,
    reflection: group.reflection ?? "",
    professorFeedback: group.professorFeedback ?? "",
  });

  return res.status(200).json({
    data: {
      ...briefDto(miniProject),
      isOwningProfessor: isOwner,
      // Public list: only id, name and memberIds, so students never see
      // other groups' tasks or evidence.
      groups: groups.map((group) => ({
        id: String(group._id),
        name: group.name,
        memberIds: group.memberIds.map((memberId) => String(memberId)),
      })),
      myGroup: myGroup ? toWorkspace(myGroup) : null,
      // Owning professor only; always empty for students.
      workspaces: isOwner ? groups.map(toWorkspace) : [],
    },
  });
}
