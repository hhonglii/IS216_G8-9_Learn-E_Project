/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — project group handlers
 *  createGroup, joinGroup, leaveGroup, replaceTasks and updateStageEvidence, then
 *  attachRepository and refreshGroupGitHub, then submitGroup and reviewGroup.
 *  Group capacity is a concurrency problem like the mentor award, so
 *  joinGroup checks it in the same conditional update that adds the member.
 * ══════════════════════════════════════════════════════════════════
 */
import MiniProject from "../models/MiniProject.js";
import Membership from "../models/Membership.js";
import ProjectGroup from "../models/ProjectGroup.js";
import Classroom from "../models/Classroom.js";
import { validateTasks } from "../utils/taskValidation.js";
import {
  parsePublicGitHubRepositoryUrl,
  fetchRepositorySnapshot,
} from "../services/githubService.js";
import { sendError } from "../utils/httpError.js";

// The founder joins the group they create, so the one-group-per-project rule applies here too (E-7).
export async function createGroup(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
  }
  const miniProjectId = req.params.id;
  if (
    typeof miniProjectId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(miniProjectId)
  ) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "That mini-project link isn't valid.",
      { field: "id" },
    );
  }
  const miniProject = await MiniProject.findById(miniProjectId);
  if (!miniProject || miniProject.status !== "published") {
    return sendError(
      res,
      404,
      "MINIPROJECT_NOT_FOUND",
      "That mini-project doesn't exist.",
      { field: "id" },
    );
  }
  const membership =
    user.role === "student"
      ? await Membership.findOne({
          classroomId: miniProject.classroomId,
          userId: user._id,
        })
      : null;
  if (!membership) {
    return sendError(res, 403, "FORBIDDEN", "Only students in this classroom can create a group.");
  }
  const name = req.body?.name;
  if (typeof name !== "string" || !name.trim()) {
    return sendError(res, 400, "VALIDATION_FAILED", "Enter a group name.", [
      { field: "name", message: "Enter a group name." },
    ]);
  }
  const existingGroup = await ProjectGroup.findOne({
    miniProjectId: miniProject._id,
    memberIds: user._id,
  });
  if (existingGroup) {
    return sendError(res, 409, "ALREADY_IN", "You're already in a group for this mini-project.");
  }
  let group;
  try {
    group = await ProjectGroup.create({
      miniProjectId: miniProject._id,
      name: name.trim(),
      memberIds: [user._id],
    });
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, 409, "ALREADY_IN", "You're already in a group for this mini-project.");
    }
    throw error;
  }
  return res.status(201).json({
    data: {
      id: String(group._id),
      name: group.name,
      memberIds: group.memberIds.map((memberId) => String(memberId)),
    },
  });
}

// Capacity and "not already a member" sit in the update's filter, so two students racing for the
// last place get one 200 and one 409. A second group in the same project hits the unique index (E-7).
export async function joinGroup(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
  }
  const groupId = req.params.id;
  if (typeof groupId !== "string" || !/^[a-fA-F0-9]{24}$/.test(groupId)) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "That group link isn't valid.",
      { field: "id" },
    );
  }

  const group = await ProjectGroup.findById(groupId);
  if (!group) {
    return sendError(res, 404, "GROUP_NOT_FOUND", "That group doesn't exist any more.", { field: "id" });
  }
  const miniProject = await MiniProject.findById(group.miniProjectId);
  if (!miniProject || miniProject.status !== "published") {
    return sendError(res, 404, "MINIPROJECT_NOT_FOUND", "That mini-project doesn't exist.");
  }
  const membership =
    user.role === "student"
      ? await Membership.findOne({
          classroomId: miniProject.classroomId,
          userId: user._id,
        })
      : null;
  if (!membership) {
    return sendError(res, 403, "FORBIDDEN", "Only students in this classroom can join a group.");
  }
  if (
    group.memberIds.some((memberId) => String(memberId) === String(user._id))
  ) {
    return res.status(200).json({
      data: {
        id: String(group._id),
        name: group.name,
        memberIds: group.memberIds.map((memberId) => String(memberId)),
      },
    });
  }
  let updated;
  try {
    updated = await ProjectGroup.findOneAndUpdate(
      {
        _id: group._id,
        // only if caller is not a member
        memberIds: { $ne: user._id },
        // only if there is still space to add member
        [`memberIds.${miniProject.maxGroupSize - 1}`]: { $exists: false },
      },
      { $push: { memberIds: user._id } },
      { new: true },
    );
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, 409, "ALREADY_IN", "You're already in a group for this mini-project.");
    }
    throw error;
  }
  if (!updated) {
    const latest = await ProjectGroup.findById(group._id);
    if (
      latest &&
      latest.memberIds.some((memberId) => String(memberId) === String(user._id))
    ) {
      return res.status(200).json({
        data: {
          id: String(latest._id),
          name: latest.name,
          memberIds: latest.memberIds.map((memberId) => String(memberId)),
        },
      });
    }
    return sendError(res, 409, "GROUP_FULL", "This group is full. Join another group or create your own.");
  }
  return res.status(200).json({
    data: {
      id: String(updated._id),
      name: updated.name,
      memberIds: updated.memberIds.map((memberId) => String(memberId)),
    },
  });
}

// UX audit A4: a member leaves while the group's work is still theirs to
// change (draft or returned). Their tasks stay but lose their owner. The
// update is conditional on the updatedAt just read, so a submit or task save
// that lands in between makes this a 409 instead of being overwritten. The
// last member out deletes the empty group, and $size: 0 in that filter means a
// classmate who joined in the meantime keeps it.
export async function leaveGroup(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to leave a group.");
  }
  const groupId = req.params.id;
  if (typeof groupId !== "string" || !/^[a-fA-F0-9]{24}$/.test(groupId)) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "That group link does not look right.",
      { field: "id" },
    );
  }
  const group = await ProjectGroup.findById(groupId);
  if (!group) {
    return sendError(res, 404, "GROUP_NOT_FOUND", "We couldn't find that group.");
  }
  if (!group.memberIds.some((memberId) => String(memberId) === String(user._id))) {
    return sendError(res, 403, "FORBIDDEN", "You are not in this group.");
  }
  if (!["draft", "returned"].includes(group.submissionStatus)) {
    return sendError(
      res,
      409,
      "INVALID_STATE",
      "Your group's work is with the professor, so you can't leave it now.",
    );
  }

  const tasks = group.tasks.map((task) => ({
    _id: task._id,
    title: task.title,
    ownerId: String(task.ownerId) === String(user._id) ? undefined : task.ownerId,
    status: task.status,
    evidenceUrl: task.evidenceUrl,
  }));
  const updated = await ProjectGroup.findOneAndUpdate(
    { _id: group._id, updatedAt: group.updatedAt, memberIds: user._id },
    { $pull: { memberIds: user._id }, $set: { tasks } },
    { new: true },
  );
  if (!updated) {
    return sendError(
      res,
      409,
      "GROUP_CHANGED",
      "Your group just changed. Reload and try again.",
    );
  }

  let groupDeleted = false;
  if (updated.memberIds.length === 0) {
    const result = await ProjectGroup.deleteOne({ _id: group._id, memberIds: { $size: 0 } });
    groupDeleted = result.deletedCount === 1;
  }
  return res.status(200).json({ data: { id: String(group._id), left: true, groupDeleted } });
}

// Replaces the whole task list, so a task left out is deleted. Existing tasks keep their ids, and a
// save based on an old updatedAt gets 409 (E-8).
export async function replaceTasks(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
  }
  const groupId = req.params.id;
  if (typeof groupId !== "string" || !/^[a-fA-F0-9]{24}$/.test(groupId)) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "That group link isn't valid.",
      { field: "id" },
    );
  }
  const group = await ProjectGroup.findById(groupId);
  if (!group) {
    return sendError(res, 404, "GROUP_NOT_FOUND", "That group doesn't exist any more.", { field: "id" });
  }
  const isMember = group.memberIds.some(
    (memberId) => String(memberId) === String(user._id),
  );
  if (!isMember) {
    return sendError(res, 403, "FORBIDDEN", "Only members of this group can change its tasks.");
  }

  const details = validateTasks(req.body?.tasks, group);
  if (details.length) {
    return sendError(res, 400, "VALIDATION_FAILED", "Some tasks need fixing.", details);
  }

  const sentUpdatedAt = new Date(req.body?.updatedAt);
  if (!req.body?.updatedAt || Number.isNaN(sentUpdatedAt.getTime())) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "Reload the page, then try again.",
      [{ field: "updatedAt", message: "Reload the page, then try again." }],
    );
  }

  // Named fields only. An existing task keeps its _id (E2b); a new task has
  // no id and Mongoose creates one.
  const newTasks = req.body.tasks.map((task) => ({
    ...(task.id ? { _id: task.id } : {}),
    title: task.title.trim(),
    ownerId: task.ownerId || undefined,
    status: task.status,
    evidenceUrl: task.evidenceUrl || undefined,
  }));

  // The stale check AND the save are ONE database operation (decision E-8).
  // The filter only matches if updatedAt is still what the page loaded, so
  // two simultaneous saves cannot both succeed.
  const saved = await ProjectGroup.findOneAndUpdate(
    { _id: group._id, updatedAt: sentUpdatedAt, memberIds: user._id },
    { $set: { tasks: newTasks } }, // Mongoose also bumps updatedAt
    { new: true },
  );
  if (!saved) {
    return sendError(
      res,
      409,
      "GROUP_CHANGED",
      "Someone in your group changed this at the same time. Reload the page, then try again.",
    );
  }

  return res.status(200).json({
    data: {
      tasks: saved.tasks.map((task) => ({
        id: String(task._id),
        title: task.title,
        ownerId: task.ownerId ? String(task.ownerId) : null,
        status: task.status,
        evidenceUrl: task.evidenceUrl ?? "",
      })),
      updatedAt: saved.updatedAt,
    },
  });
}

export async function updateStageEvidence(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
  }
  const groupId = req.params.id;
  if (typeof groupId !== "string" || !/^[a-fA-F0-9]{24}$/.test(groupId)) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "That group link isn't valid.",
      { field: "id" },
    );
  }
  const group = await ProjectGroup.findById(groupId);
  if (!group) {
    return sendError(res, 404, "GROUP_NOT_FOUND", "That group doesn't exist any more.", { field: "id" });
  }
  const isMember = group.memberIds.some(
    (memberId) => String(memberId) === String(user._id),
  );
  if (!isMember) {
    return sendError(res, 403, "FORBIDDEN", "Only members of this group can change its stage evidence.");
  }

  // Only the five stage names, each a string. Unknown keys are rejected.
  const stages = ["Diagnose", "Repair", "Extend", "Verify", "Reflect"];
  const sent = req.body?.stageEvidence;
  const details = [];
  if (sent === null || typeof sent !== "object" || Array.isArray(sent)) {
    details.push({
      field: "stageEvidence",
      message: "Stage evidence must be an object.",
    });
  } else {
    if (Object.keys(sent).length === 0) {
      details.push({
        field: "stageEvidence",
        message: "Send at least one stage.",
      });
    }
    for (const key of Object.keys(sent)) {
      if (!stages.includes(key)) {
        details.push({
          field: `stageEvidence.${key}`,
          message: "Stage must be Diagnose, Repair, Extend, Verify or Reflect.",
        });
      } else if (typeof sent[key] !== "string") {
        details.push({
          field: `stageEvidence.${key}`,
          message: "Stage evidence must be a string.",
        });
      }
    }
  }
  if (details.length) {
    return sendError(res, 400, "VALIDATION_FAILED", "Some stage evidence needs fixing.", details);
  }

  // $set touches ONLY the stages that were sent, in ONE operation, so two
  // members saving different stages at the same moment cannot overwrite
  // each other. The keys are safe: they passed the five-name check above.
  const set = {};
  for (const key of Object.keys(sent)) set[`stageEvidence.${key}`] = sent[key];

  const updated = await ProjectGroup.findOneAndUpdate(
    { _id: group._id, memberIds: user._id },
    { $set: set },
    { new: true },
  );
  if (!updated) {
    return sendError(res, 404, "GROUP_NOT_FOUND", "That group doesn't exist any more.", { field: "id" });
  }

  return res.status(200).json({
    data: {
      stageEvidence: {
        Diagnose: updated.stageEvidence?.Diagnose ?? "",
        Repair: updated.stageEvidence?.Repair ?? "",
        Extend: updated.stageEvidence?.Extend ?? "",
        Verify: updated.stageEvidence?.Verify ?? "",
        Reflect: updated.stageEvidence?.Reflect ?? "",
      },
      updatedAt: updated.updatedAt,
    },
  });
}

export async function attachRepository(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
  }
  const groupId = req.params.id;
  if (typeof groupId !== "string" || !/^[a-fA-F0-9]{24}$/.test(groupId)) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "That group link isn't valid.",
      { field: "id" },
    );
  }
  const group = await ProjectGroup.findById(groupId);
  if (!group) {
    return sendError(res, 404, "GROUP_NOT_FOUND", "That group doesn't exist any more.", { field: "id" });
  }
  const isMember = group.memberIds.some(
    (memberId) => String(memberId) === String(user._id),
  );
  if (!isMember) {
    return sendError(res, 403, "FORBIDDEN", "Only group members can attach a repository");
  }

  if (
    typeof req.body?.repositoryUrl !== "string" ||
    !req.body?.repositoryUrl.trim()
  ) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "Enter a GitHub repository link.",
      { field: "repositoryUrl" },
    );
  }
  const { owner, repo } = parsePublicGitHubRepositoryUrl(
    req.body?.repositoryUrl.trim(),
  );
  const gitRepoLink = `https://github.com/${owner}/${repo}`;
  let update;
  if (gitRepoLink === group.repositoryUrl) {
    return res.status(200).json({
      data: {
        id: String(group._id),
        repositoryUrl: group.repositoryUrl,
        updatedAt: group.updatedAt,
      },
    });
  } else {
    update = await ProjectGroup.findOneAndUpdate(
      { _id: group._id, memberIds: user._id },
      { $set: { repositoryUrl: gitRepoLink }, $unset: { githubCache: 1 } },
      { new: true },
    );
    if (!update) {
      return sendError(res, 404, "GROUP_NOT_FOUND", "That group doesn't exist any more.", { field: "id" });
    } else {
      return res.status(200).json({
        data: {
          id: String(update._id),
          repositoryUrl: update.repositoryUrl,
          updatedAt: update.updatedAt,
        },
      });
    }
  }
}

export async function refreshGroupGitHub(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
  }
  const groupId = req.params.id;
  if (typeof groupId !== "string" || !/^[a-fA-F0-9]{24}$/.test(groupId)) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "That group link isn't valid.",
      { field: "id" },
    );
  }
  const group = await ProjectGroup.findById(groupId);
  if (!group) {
    return sendError(res, 404, "GROUP_NOT_FOUND", "That group doesn't exist any more.", { field: "id" });
  }
  const isMember = group.memberIds.some(
    (memberId) => String(memberId) === String(user._id),
  );
  if (!isMember) {
    const miniProject = await MiniProject.findById(group.miniProjectId);
    const classroom = miniProject
      ? await Classroom.findById(miniProject.classroomId)
      : null;
    if (
      !classroom ||
      user.role !== "professor" ||
      String(user._id) !== String(classroom.professorId)
    ) {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Only this group's members and the professor can open this group.",
      );
    }
  }
  if (!group.repositoryUrl) {
    return sendError(
      res,
      409,
      "REPOSITORY_NOT_ATTACHED",
      "Attach a repository before refreshing.",
    );
  }

  const { owner, repo } = parsePublicGitHubRepositoryUrl(group.repositoryUrl);
  const result = await fetchRepositorySnapshot(owner, repo);
  const snapshot = { ...result, lastRefreshedAt: new Date().toISOString() };

  const saveNew = await ProjectGroup.findOneAndUpdate(
    { _id: group._id, repositoryUrl: group.repositoryUrl },
    { $set: { githubCache: snapshot } },
    { new: true },
  );

  if (!saveNew) {
    return sendError(
      res,
      409,
      "REPOSITORY_CHANGED",
      "The repository link changed during the refresh. Refresh again.",
    );
  } else {
    return res.status(200).json({
      data: {
        repositoryUrl: saveNew.repositoryUrl,
        ...snapshot,
      },
    });
  }
}

export async function submitGroup(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
  }
  const groupId = req.params.id;
  if (typeof groupId !== "string" || !/^[a-fA-F0-9]{24}$/.test(groupId)) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "That group link isn't valid.",
      { field: "id" },
    );
  }
  const group = await ProjectGroup.findById(groupId);
  if (!group) {
    return sendError(res, 404, "GROUP_NOT_FOUND", "That group doesn't exist any more.", { field: "id" });
  }
  const isMember = group.memberIds.some(
    (memberId) => String(memberId) === String(user._id),
  );
  if (!isMember) {
    return sendError(
      res,
      403,
      "FORBIDDEN",
      "Only group members can submit this group's work.",
    );
  }
  if (group.submissionStatus === "submitted") {
    return sendError(
      res,
      409,
      "INVALID_SUBMISSION_STATUS",
      "This group's work is already waiting for review.",
    );
  } else if (group.submissionStatus === "approved") {
    return sendError(
      res,
      409,
      "INVALID_SUBMISSION_STATUS",
      "This group's work is already approved.",
    );
  }
  const details = [];
  if (!group.stageEvidence?.Diagnose?.trim()) {
    details.push({
      field: "stageEvidence.Diagnose",
      message: "Add Diagnose evidence before submitting.",
    });
  }
  if (!group.stageEvidence?.Repair?.trim()) {
    details.push({
      field: "stageEvidence.Repair",
      message: "Add Repair evidence before submitting.",
    });
  }
  if (!group.stageEvidence?.Verify?.trim()) {
    details.push({
      field: "stageEvidence.Verify",
      message: "Add Verify evidence before submitting.",
    });
  }
  let reflection = req.body?.reflection;
  if (typeof reflection === "string") {
    reflection = reflection.trim();
  } else {
    reflection = "";
  }
  if (!reflection) {
    details.push({
      field: "reflection",
      message: "Write a reflection before submitting.",
    });
  }
  if (reflection.length > 5000) {
    details.push({
      field: "reflection",
      message: "The reflection can be at most 5000 characters.",
    });
  }
  if (details.length > 0) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "There is something wrong with your evidences and reflection",
      details,
    );
  }
  const submit = await ProjectGroup.findOneAndUpdate(
    {
      _id: group._id,
      memberIds: user._id,
      submissionStatus: { $in: ["draft", "returned"] },
    },
    { $set: { submissionStatus: "submitted", reflection: reflection } },
    { new: true },
  );
  if (!submit) {
    return sendError(
      res,
      409,
      "INVALID_SUBMISSION_STATUS",
      "This group's work was just submitted by someone else.",
    );
  } else {
    return res.status(200).json({
      data: {
        id: submit._id,
        submissionStatus: submit.submissionStatus,
        reflection: submit.reflection ?? "",
        professorFeedback: submit.professorFeedback ?? "",
        updatedAt: submit.updatedAt,
      },
    });
  }
}

export async function reviewGroup(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
  }
  const groupId = req.params.id;
  if (typeof groupId !== "string" || !/^[a-fA-F0-9]{24}$/.test(groupId)) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "That group link isn't valid.",
      { field: "id" },
    );
  }
  const group = await ProjectGroup.findById(groupId);
  if (!group) {
    return sendError(res, 404, "GROUP_NOT_FOUND", "That group doesn't exist any more.", { field: "id" });
  }
  const miniProject = await MiniProject.findById(group.miniProjectId);
  const classroom = miniProject
    ? await Classroom.findById(miniProject.classroomId)
    : null;
  if (
    !classroom ||
    user.role !== "professor" ||
    String(user._id) !== String(classroom.professorId)
  ) {
    return sendError(
      res,
      403,
      "FORBIDDEN",
      "Only the owning professor can review this group",
    );
  }

  const { decision, feedback } = req.body ?? {};

  if (!["approve", "return"].includes(decision)) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "Decision must be either approve or return.",
    );
  }

  if (feedback !== undefined && typeof feedback !== "string") {
    return sendError(res, 400, "VALIDATION_FAILED", "Feedback must be a string.");
  }

  const trimmedFeedback = (feedback ?? "").trim();

  if (decision === "return" && !trimmedFeedback) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "Feedback is required when returning a review.",
    );
  }

  if (group.submissionStatus !== "submitted") {
    return sendError(
      res,
      409,
      "INVALID_REVIEW_STATUS",
      "Only submitted work can be reviewed.",
    );
  }
  let newStatus = "";
  if (decision === "approve") {
    newStatus = "approved";
  } else if (decision === "return") {
    newStatus = "returned";
  }
  const sendReview = await ProjectGroup.findOneAndUpdate(
    { _id: group._id, submissionStatus: "submitted" },
    {
      $set: { submissionStatus: newStatus, professorFeedback: trimmedFeedback },
    },
    { new: true },
  );
  if (!sendReview) {
    return sendError(
      res,
      409,
      "INVALID_REVIEW_STATUS",
      "This group's work has been reviewed",
    );
  } else {
    return res.status(200).json({
      data: {
        id: sendReview._id,
        submissionStatus: sendReview.submissionStatus,
        professorFeedback: sendReview.professorFeedback,
        updatedAt: sendReview.updatedAt,
      },
    });
  }
}
