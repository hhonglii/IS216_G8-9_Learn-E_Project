/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — classroom handlers
 *  createClassroom, joinClassroom, leaveClassroom, deleteClassroom and
 *  getClassroom (with the challenge and mini-project summaries the caller may
 *  see), then getLeaderboard, the
 *  owning professor's getInsights, and getWaitingOnMe, which gathers what is
 *  waiting on a professor across all of their classrooms.
 * ══════════════════════════════════════════════════════════════════
 */
import Classroom from "../models/Classroom.js";
import Membership from "../models/Membership.js";
import Challenge from "../models/Challenge.js";
import Attempt from "../models/Attempt.js";
import { HttpError, sendError } from "../utils/httpError.js";
import mongoose from "mongoose";
import MiniProject from "../models/MiniProject.js";
import ProjectGroup from "../models/ProjectGroup.js";
import User from "../models/User.js";
import HelpRequest from "../models/HelpRequest.js";
import ClassroomGame from "../models/ClassroomGame.js";
import GamePlay from "../models/GamePlay.js";
import { deleteMaterialFile } from "../services/materialStore.js";
import { coverIds } from "../config/covers.js";

function makeJoinCode() {
  let joinCode = "";
  const allowedCharacters = "23456789QWERTYUPASDFGHJKZXCVBNM";
  for (let i = 0; i < 6; i++) {
    const ranNum = Math.floor(Math.random() * allowedCharacters.length);
    joinCode = joinCode + allowedCharacters[ranNum];
  }
  return joinCode;
}


export async function createClassroom(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
  } else if (user.role !== "professor") {
    return sendError(
      res,
      403,
      "FORBIDDEN",
      "Only professors can create a classroom.",
    );
  } else {
    if (!req.body) {
      return sendError(
        res,
        400,
        "VALIDATION_FAILED",
        "Fill in the form, then try again.",
        { field: "name" },
      );
    }

    let name = req.body.name;
    if (typeof name !== "string" || !name.trim()) {
      return sendError(
        res,
        400,
        "VALIDATION_FAILED",
        "Enter a classroom name.",
        { field: "name" },
      );
    } else {
      name = name.trim();
      const description = req.body.description;
      if (
        typeof description !== "string" &&
        typeof description !== "undefined"
      ) {
        return sendError(
          res,
          400,
          "VALIDATION_FAILED",
          "The description must be text.",
          { field: "description" },
        );
      }
      // Decision G-10: the cover is optional, but if sent it must be one of the
      // known ids, so the client never gets a cover it can't show.
      const coverId = req.body.coverId;
      if (typeof coverId !== "undefined" && !coverIds.includes(coverId)) {
        return sendError(
          res,
          400,
          "VALIDATION_FAILED",
          "Choose one of the listed covers.",
          { field: "coverId" },
        );
      }
      const professorId = user._id;
      let joinCode = makeJoinCode();
      for (let j = 0; j < 5; j++) {
        try {
          let classroom = await Classroom.create({
            name: name,
            description: description,
            professorId: professorId,
            joinCode: joinCode,
            coverId: coverId,
          });
          return res.status(201).json({
            data: {
              id: String(classroom._id),
              name: classroom.name,
              description: classroom.description,
              joinCode: classroom.joinCode,
              coverId: classroom.coverId ?? "default",
              professorId: String(classroom.professorId),
            },
          });
        } catch (err) {
          if (err.code === 11000) {
            joinCode = makeJoinCode();
          } else {
            throw err;
          }
        }
      }
      return sendError(
        res,
        409,
        "JOIN_CODE_CONFLICT",
        "All attempts at creating classroom failed",
      );
    }
  }
}

export async function joinClassroom(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
  } else if (user.role !== "student") {
    return sendError(
      res,
      403,
      "FORBIDDEN",
      "Only students can join a classroom.",
    );
  }
  if (!req.body) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "Fill in the form, then try again.",
      { field: "joinCode" },
    );
  }

  let joinCode = req.body.joinCode;
  if (typeof joinCode !== "string" || !joinCode.trim()) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "Enter a join code.",
      { field: "joinCode" },
    );
  } else {
    joinCode = joinCode.trim().toUpperCase();
  }

  const classroom = await Classroom.findOne({
    joinCode: joinCode,
  });
  if (!classroom) {
    return sendError(
      res,
      404,
      "CLASSROOM_NOT_FOUND",
      "No classroom uses that join code. Check it with your professor.",
      { field: "joinCode" },
    );
  }

  try {
    let membership = await Membership.create({
      classroomId: classroom.id,
      userId: req.prototypeUser._id,
    });
    return res.status(201).json({
      data: {
        id: String(membership._id),
        classroomId: String(membership.classroomId),
        userId: String(membership.userId),
        classroom: {
          id: classroom.id,
          name: classroom.name,
          description: classroom.description,
          coverId: classroom.coverId ?? "default",
        },
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      let membership = await Membership.findOne({
        classroomId: classroom.id,
        userId: req.prototypeUser._id,
      });
      return res.status(200).json({
        data: {
          id: String(membership._id),
          classroomId: String(membership.classroomId),
          userId: String(membership.userId),
          classroom: {
            id: classroom.id,
            name: classroom.name,
            description: classroom.description,
            coverId: classroom.coverId ?? "default",
          },
        },
      });
    } else {
      throw err;
    }
  }
}

// UX audit A4: a student leaves a classroom. Only the Membership goes, so
// their contribution points go with it, while attempts, game runs and answered
// help requests stay for the professor's records and come back if they rejoin.
// They must leave any mini-project group first, since a group can't keep a
// member who can no longer open its page. Requests nobody has answered are
// tidied so no one waits on them: their own open requests are withdrawn, and
// requests they claimed without hinting go back to the queue.
export async function leaveClassroom(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to leave a classroom.");
  }
  if (user.role !== "student") {
    return sendError(res, 403, "FORBIDDEN", "Only students can leave a classroom.");
  }
  const classroomId = req.params.id;
  if (!mongoose.isValidObjectId(classroomId)) {
    return sendError(res, 400, "VALIDATION_FAILED", "The classroom link does not look right.", {
      field: "id",
    });
  }
  const membership = await Membership.findOne({ classroomId, userId: user._id });
  if (!membership) {
    return sendError(res, 404, "NOT_A_MEMBER", "You are not in this classroom.");
  }

  const miniProjects = await MiniProject.find({ classroomId }, "_id");
  const group = await ProjectGroup.findOne(
    { miniProjectId: { $in: miniProjects.map((project) => project._id) }, memberIds: user._id },
    "name",
  );
  if (group) {
    return sendError(res, 409, "IN_A_GROUP",
      `Leave your mini-project group "${group.name}" first, then leave the classroom.`);
  }

  await Membership.deleteOne({ _id: membership._id });
  await HelpRequest.deleteMany({ classroomId, requesterId: user._id, status: "open" });
  await HelpRequest.updateMany(
    { classroomId, claimedBy: user._id, status: "claimed" },
    { $set: { status: "open" }, $unset: { claimedBy: "" } },
  );
  return res.status(200).json({ data: { classroomId: String(classroomId), left: true } });
}

// UX audit A6: the owning professor deletes a classroom and everything in it.
// Children go first and the classroom last, so if any step fails the
// classroom is still there and pressing Delete again finishes the job. Every
// step is safe to repeat: deleteMany on nothing deletes nothing, and a
// material file that is already gone counts as deleted.
export async function deleteClassroom(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to delete a classroom.");
  }
  const classroomId = req.params.id;
  if (!mongoose.isValidObjectId(classroomId)) {
    return sendError(res, 400, "VALIDATION_FAILED", "The classroom link does not look right.", {
      field: "id",
    });
  }
  const classroom = await Classroom.findById(classroomId);
  if (!classroom) {
    return sendError(res, 404, "CLASSROOM_NOT_FOUND", "Classroom not found.");
  }
  if (user.role !== "professor" || String(classroom.professorId) !== String(user._id)) {
    return sendError(res, 403, "FORBIDDEN", "Only the professor who owns this classroom can delete it.");
  }

  const challenges = await Challenge.find({ classroomId: classroom._id }, "_id");
  const miniProjects = await MiniProject.find({ classroomId: classroom._id }, "_id materials");
  const games = await ClassroomGame.find({ classroomId: classroom._id }, "_id");
  await Attempt.deleteMany({ challengeId: { $in: challenges.map((challenge) => challenge._id) } });
  await HelpRequest.deleteMany({ classroomId: classroom._id });
  await ProjectGroup.deleteMany({ miniProjectId: { $in: miniProjects.map((project) => project._id) } });
  for (const miniProject of miniProjects) {
    for (const material of miniProject.materials ?? []) {
      await deleteMaterialFile(material.fileId);
    }
  }
  await MiniProject.deleteMany({ classroomId: classroom._id });
  await Challenge.deleteMany({ classroomId: classroom._id });
  await GamePlay.deleteMany({ gameId: { $in: games.map((game) => game._id) } });
  await ClassroomGame.deleteMany({ classroomId: classroom._id });
  await Membership.deleteMany({ classroomId: classroom._id });
  await Classroom.deleteOne({ _id: classroom._id });
  return res.status(204).end();
}

// Phase B challenge summaries.
// Query only visible records and select summary fields before building the DTO.
// UX audit item 11: given a studentId, each row also carries that student's own
// progress, the same numbers the challenge page's progress bar shows. Only the
// question ids are read, so no answer leaves the database.
async function classroomChallengeSummaries(
  classroomId,
  owningProfessor,
  studentId = null,
) {
  const challenges = await Challenge.find(
    { classroomId, ...(owningProfessor ? {} : { status: "published" }) },
    owningProfessor ? { title: 1, status: 1 } : { title: 1, "questions._id": 1 },
    { sort: { createdAt: 1, _id: 1 } },
  );
  const attempts = studentId
    ? await Attempt.find(
        {
          challengeId: { $in: challenges.map((challenge) => challenge._id) },
          studentId,
        },
        { challengeId: 1, structuredScore: 1, reviewStatus: 1 },
      )
    : [];
  return challenges.map((challenge) => {
    const attempt = attempts.find(
      (row) => String(row.challengeId) === String(challenge._id),
    );
    return {
      id: String(challenge._id),
      title: challenge.title,
      ...(owningProfessor ? { status: challenge.status } : {}),
      ...(studentId
        ? {
            progress: {
              answered: attempt?.structuredScore ?? 0,
              total: challenge.questions?.length ?? 0,
              reviewStatus: attempt?.reviewStatus ?? "not-submitted",
            },
          }
        : {}),
    };
  });
}

async function classroomMiniProjectSummaries(classroomId, owningProfessor) {
  const miniProjects = await MiniProject.find(
    {
      classroomId,
      ...(owningProfessor ? {} : { status: "published" }),
    },
    { title: 1, status: 1 },
    { sort: { createdAt: 1, _id: 1 } },
  );

  return miniProjects.map((project) => ({
    id: String(project._id),
    title: project.title,
    status: project.status,
  }));
}

export async function getClassroom(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
  }

  const classroomId = req.params.id;
  if (
    typeof classroomId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(classroomId)
  ) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "That classroom link isn't valid.",
      { field: "id" },
    );
  }
  const classroom = await Classroom.findOne({
    _id: classroomId,
  });
  if (!classroom) {
    return sendError(
      res,
      404,
      "CLASSROOM_NOT_FOUND",
      "That classroom doesn't exist.",
      { field: "id" },
    );
  }

  const membership = await Membership.findOne({
    userId: user.id,
    classroomId: classroom.id,
  });

  if (
    user.role === "professor" &&
    String(user.id) === String(classroom.professorId)
  ) {
    const challenges = await classroomChallengeSummaries(classroom._id, true);
    const miniProjects = await classroomMiniProjectSummaries(
      classroom._id,
      true,
    );
    return res.status(200).json({
      data: {
        id: String(classroom.id),
        name: classroom.name,
        description: classroom.description,
        coverId: classroom.coverId ?? "default",
        professorId: String(classroom.professorId),
        professorName: user.displayName,
        joinCode: classroom.joinCode,
        challenges,
        miniProjects,
      },
    });
  } else if (user.role === "student" && membership) {
    const challenges = await classroomChallengeSummaries(
      classroom._id,
      false,
      user._id,
    );
    const miniProjects = await classroomMiniProjectSummaries(
      classroom._id,
      false,
    );
    // Students see who runs the classroom, so they can open the professor's profile.
    const professor = await User.findById(classroom.professorId);
    return res.status(200).json({
      data: {
        id: String(classroom.id),
        name: classroom.name,
        description: classroom.description,
        coverId: classroom.coverId ?? "default",
        professorId: String(classroom.professorId),
        professorName: professor?.displayName ?? "Unknown professor",
        challenges,
        miniProjects,
      },
    });
  } else {
    return sendError(
      res,
      403,
      "FORBIDDEN",
      "You're not in this classroom.",
    );
  }
}

export async function getLeaderboard(req, res) {
  try {
    const user = req.prototypeUser;
    if (!user) {
      return sendError(
        res,
        401,
        "UNAUTHENTICATED",
        "Log in to see the leaderboard.",
      );
    }
    const classroomId = req.params.id;
    if (!mongoose.isValidObjectId(classroomId)) {
      return sendError(
        res,
        400,
        "VALIDATION_FAILED",
        "That classroom link does not look right.",
        { field: "id" },
      );
    }
    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return sendError(
        res,
        404,
        "CLASSROOM_NOT_FOUND",
        "We couldn't find that classroom.",
      );
    }
    const isOwner =
      user.role === "professor" &&
      String(user._id) === String(classroom.professorId);
    // membership validation
    let isMember = false;
    if (user.role === "student") {
      const membership = await Membership.findOne({
        classroomId: classroom._id,
        userId: user._id,
      });
      isMember = !!membership;
    }
    if (!isOwner && !isMember) {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "You need to be part of this classroom to see its leaderboard.",
      );
    }

    const memberships = await Membership.find({ classroomId: classroom._id })
      // fetch User document
      .populate("userId", "displayName");

    const entries = [];

    for (const membership of memberships) {
      // get user document from userId
      const student = membership.userId;

      // Default values for a deleted user
      let userId = null;
      let displayName = "Unknown student";

      if (student) {
        userId = String(student._id);
        displayName = student.displayName;
      }

      entries.push({
        userId,
        displayName,
        // The stored total; nothing is recomputed here.
        contributionPoints: membership.contributionPoints,
      });
    }
    // Ties go by display name, then user id, so the order never shifts (G-6).
    entries.sort((a,b) => {
      const byPoints = b.contributionPoints - a.contributionPoints;
      if (byPoints !== 0) return byPoints;

      const byName = (a.displayName ?? "").localeCompare(
        b.displayName ?? "",
        "en",
        { sensitivity: "base" },
      );
      if (byName !== 0) return byName;
      
      const byUserId = (a.userId ?? "").localeCompare(
        b.userId ?? "",
        "en",
        { sensitivity: "base" },
      );
      if (byUserId !== 0) return byUserId;
    })

    return res.status(200).json({ data: entries });
  } catch (error) {
    console.error("Failed to load leaderboard:", error);
    return sendError(
      res,
      500,
      "INTERNAL_ERROR",
      "We couldn't load the leaderboard. Please try again.",
    );
  }
}

export async function getInsights(req, res) {
  const user = req.prototypeUser;

  // 1. Check authentication
  if (!user) {
    throw new HttpError(
      401,
      "UNAUTHENTICATED",
      "Log in to see classroom insights.",
    );
  }

  // 2. Validate Classroom ID
  const classroomId = req.params.id;

  if (
    typeof classroomId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(classroomId)
  ) {
    throw new HttpError(400, "VALIDATION_FAILED", "Invalid classroom ID.");
  }

  // 3. Find Classroom
  const classroom = await Classroom.findById(classroomId);

  if (!classroom) {
    throw new HttpError(404, "CLASSROOM_NOT_FOUND", "Classroom was not found.");
  }

  // 4. Check professor ownership
  if (
    user.role !== "professor" ||
    String(user._id) !== String(classroom.professorId)
  ) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only the owning professor can view these insights.",
    );
  }

  // 5. Retrieve challenges belonging to this classroom
  const challenges = await Challenge.find({
    classroomId: classroom._id,
  }).select("_id title questions appliedCase explanation");

  const challengeIds = challenges.map((challenge) => challenge._id);

  const challengeTitles = new Map(
    challenges.map((challenge) => [String(challenge._id), challenge.title]),
  );
  const challengeById = new Map(
    challenges.map((challenge) => [String(challenge._id), challenge]),
  );
  const studentName = (student) =>
    student?.displayName || student?.name || student?.username || "Unknown student";

  // 6. Retrieve pending applied diagnoses
  const pendingAttempts = await Attempt.find({
    challengeId: { $in: challengeIds },
    reviewStatus: "pending",
  })
    .populate("studentId", "displayName name username")
    .sort({ updatedAt: 1, _id: 1 });

  // 7. Build pending review DTO. The applied-case prompt and the official
  // explanation go with each diagnosis, so the professor compares against them
  // without opening the challenge (UX audit item 14).
  const pendingAppliedAttempts = pendingAttempts.map((attempt) => {
    const student = attempt.studentId;
    const challenge = challengeById.get(String(attempt.challengeId));

    return {
      id: String(attempt._id),
      studentId: student?._id ? String(student._id) : String(student),
      studentName: studentName(student),
      challengeId: String(attempt.challengeId),
      challengeTitle:
        challengeTitles.get(String(attempt.challengeId)) || "Unknown challenge",
      appliedCasePrompt: challenge?.appliedCase?.prompt ?? "",
      officialExplanation: challenge?.explanation ?? "",
      appliedDiagnosis: attempt.appliedDiagnosis ?? "",
      previousFeedback: attempt.previousFeedback ?? "",
      reviewStatus: attempt.reviewStatus,
      submittedAt: attempt.updatedAt,
    };
  });

  // Decisions already made, newest first, so a reviewed diagnosis doesn't just
  // vanish (UX audit item 14). A returned one shows here until it is resubmitted.
  const reviewedAttemptDocs = await Attempt.find({
    challengeId: { $in: challengeIds },
    reviewStatus: { $in: ["approved", "returned"] },
  })
    .populate("studentId", "displayName name username")
    .sort({ updatedAt: -1, _id: -1 });
  const reviewedAttempts = reviewedAttemptDocs.map((attempt) => {
    const student = attempt.studentId;
    return {
      id: String(attempt._id),
      studentId: student?._id ? String(student._id) : String(student),
      studentName: studentName(student),
      challengeId: String(attempt.challengeId),
      challengeTitle:
        challengeTitles.get(String(attempt.challengeId)) || "Unknown challenge",
      appliedDiagnosis: attempt.appliedDiagnosis ?? "",
      feedback: attempt.professorFeedback ?? "",
      reviewStatus: attempt.reviewStatus,
      reviewedAt: attempt.updatedAt,
    };
  });

  const miniProjects = await MiniProject.find({
    classroomId: classroom._id,
  });

  const miniProjectIds = miniProjects.map((miniProject) => miniProject._id);

  const miniProjectById = new Map(
    miniProjects.map((miniProject) => [String(miniProject._id), miniProject]),
  );

  const groups = await ProjectGroup.find({
    miniProjectId: { $in: miniProjectIds },
  });

  const submitted = groups
    .filter((miniProject) => miniProject.submissionStatus === "submitted")
    .sort((a, b) => a.updatedAt - b.updatedAt);

  const reviewed = groups
    .filter((group) => ["approved", "returned"].includes(group.submissionStatus))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const members = await User.find(
    { _id: { $in: [...submitted, ...reviewed].flatMap((group) => group.memberIds) } },
    { displayName: 1 },
  );

  const nameById = new Map(
    members.map((member) => [String(member._id), member.displayName]),
  );

  // The brief's rubric and acceptance criteria travel with each group, so the
  // professor reviews against them (third-pass audit I).
  const pendingGroups = submitted.map((group) => {
    const miniProject = miniProjectById.get(String(group.miniProjectId));
    return {
      id: String(group._id),
      name: group.name,
      miniProjectId: String(group.miniProjectId),
      miniProjectTitle: miniProject?.title,
      rubric: miniProject?.rubric ?? "",
      acceptanceCriteria: miniProject?.acceptanceCriteria ?? [],
      previousFeedback: group.professorFeedback ?? "",
      members: group.memberIds.map((memberId) => ({
        id: String(memberId),
        displayName: nameById.get(String(memberId)) || "Unknown student",
      })),
      stageEvidence: {
        Diagnose: group.stageEvidence?.Diagnose ?? "",
        Repair: group.stageEvidence?.Repair ?? "",
        Extend: group.stageEvidence?.Extend ?? "",
        Verify: group.stageEvidence?.Verify ?? "",
        Reflect: group.stageEvidence?.Reflect ?? "",
      },
      reflection: group.reflection ?? "",
      submittedAt: group.updatedAt,
    };
  });

  const reviewedGroups = reviewed.map((group) => ({
    id: String(group._id),
    name: group.name,
    miniProjectId: String(group.miniProjectId),
    miniProjectTitle: miniProjectById.get(String(group.miniProjectId))?.title,
    members: group.memberIds.map((memberId) => ({
      id: String(memberId),
      displayName: nameById.get(String(memberId)) || "Unknown student",
    })),
    feedback: group.professorFeedback ?? "",
    submissionStatus: group.submissionStatus,
    reviewedAt: group.updatedAt,
  }));

  const startedAttempts = await Attempt.countDocuments({
    challengeId: { $in: challengeIds },
  });

  const completedAttempts = await Attempt.countDocuments({
    challengeId: { $in: challengeIds },
    reviewStatus: "approved",
    completedAt: { $ne: null },
  });

  const pendingAttemptReviews = pendingAppliedAttempts.length;

  const pendingGroupReviews = pendingGroups.length;

  const attempts = await Attempt.find({
    challengeId: { $in: challengeIds },
  }).select("challengeId answers");

  const wrongByQuestion = new Map();
  for (const challenge of challenges) {
    for (const question of challenge.questions) {
      if (question.type !== "predict-output") {
        continue;
      }
      wrongByQuestion.set(String(question._id), {
        challengeTitle: challenge.title,
        question,
        counts: new Map(),
      });
    }
  }
  for (const attempt of attempts) {
    for (const answer of attempt.answers) {
      const entry = wrongByQuestion.get(answer.questionId);
      if (!entry || answer.correct) {
        continue;
      } else {
        entry.counts.set(
          answer.value,
          (entry.counts.get(answer.value) ?? 0) + 1,
        );
      }
    }
  }
  const wrongOptions = [...wrongByQuestion.values()]
    .filter((entry) => entry.counts.size > 0)
    .map((entry) => ({
      challengeTitle: entry.challengeTitle,
      questionPrompt: entry.question.prompt,
      correctLabel:
        entry.question.options.find(
          (option) => option.id === entry.question.acceptedAnswer,
        )?.label ?? "",
      options: [...entry.counts]
        .map(([optionId, count]) => ({
          optionId,
          label:
            entry.question.options.find((option) => option.id === optionId)
              ?.label ?? optionId,
          count,
        }))
        .sort((a, b) => b.count - a.count),
    }));

  const helpRequests = await HelpRequest.find({
    classroomId: classroom._id,
  }).select("reopenCount hintType");

  let timesMarkedUnresolved = 0;
  for (const request of helpRequests) {
    timesMarkedUnresolved += request.reopenCount ?? 0;
  }
  const hintCounts = new Map();
  for (const request of helpRequests) {
    hintCounts.set(
      request.hintType,
      (hintCounts.get(request.hintType) ?? 0) + 1,
    );
  }

  let mostRequestedHintType = [];
  if (hintCounts.size > 0) {
    const top = Math.max(...hintCounts.values());
    mostRequestedHintType = [...hintCounts]
      .filter(([type, count]) => count === top)
      .map(([type]) => type);
  }

  const openHelpRequests = await HelpRequest.countDocuments({
    classroomId: classroom._id,
    status: "open",
  });

  const groupsByStatus = { draft: 0, submitted: 0, approved: 0, returned: 0 };
  for (const group of groups) {
    groupsByStatus[group.submissionStatus] += 1;
  }

  // 8. Return both queues and the summary
  return res.status(200).json({
    data: {
      classroomId: String(classroom._id),
      pendingAppliedAttempts,
      pendingGroups,
      reviewedAttempts,
      reviewedGroups,
      summary: {
        startedAttempts,
        completedAttempts,
        pendingAttemptReviews,
        pendingGroupReviews,
        wrongOptions,
        openHelpRequests,
        timesMarkedUnresolved,
        mostRequestedHintType,
        groupsByStatus,
      },
    },
  });
}

// What is waiting on the caller, one row per classroom, longest wait first.
// A professor is waited on to review and to answer help; a student is waited on
// to fix returned work and to say whether a mentor's hint helped (third-pass
// audit A: before this, students only found out by opening each page). A
// student also hears about new challenges, recent approvals and classmates'
// questions they can now answer (UX audit item 10).
export async function getWaitingOnMe(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    throw new HttpError(
      401,
      "UNAUTHENTICATED",
      "Log in to see what is waiting on you.",
    );
  }
  const rows =
    user.role === "professor"
      ? await professorWaiting(user)
      : await studentWaiting(user);

  // Longest wait first, then the classrooms with nothing waiting.
  const waiting = rows
    .filter((row) => row.oldestWaitingAt !== null)
    .sort((a, b) => a.oldestWaitingAt - b.oldestWaitingAt);
  const notWaiting = rows.filter((row) => row.oldestWaitingAt === null);
  return res.status(200).json({ data: [...waiting, ...notWaiting] });
}

const oldest = (times) => (times.length > 0 ? new Date(Math.min(...times)) : null);

async function professorWaiting(user) {
  // createdAt order is what the classrooms with nothing waiting keep at the end.
  const classrooms = await Classroom.find({ professorId: user._id }).sort({
    createdAt: 1,
  });
  const rows = [];
  for (const classroom of classrooms) {
    const challenges = await Challenge.find({
      classroomId: classroom._id,
    }).select("_id");
    const pendingAttempts = await Attempt.find({
      challengeId: { $in: challenges.map((challenge) => challenge._id) },
      reviewStatus: "pending",
    }).select("updatedAt");

    const miniProjects = await MiniProject.find({
      classroomId: classroom._id,
    }).select("_id");
    const submittedGroups = await ProjectGroup.find({
      miniProjectId: { $in: miniProjects.map((miniProject) => miniProject._id) },
      submissionStatus: "submitted",
    }).select("updatedAt");

    const openRequests = await HelpRequest.find({
      classroomId: classroom._id,
      status: "open",
    }).select("createdAt");

    // A diagnosis or group waits from when it was last sent, its updatedAt. A help
    // request waits from when it was asked: one sent back to the queue as
    // unresolved has a newer updatedAt, but the student has waited since then.
    rows.push({
      classroomId: String(classroom._id),
      classroomName: classroom.name,
      pendingDiagnoses: pendingAttempts.length,
      pendingGroups: submittedGroups.length,
      openHelpRequests: openRequests.length,
      oldestWaitingAt: oldest([
        ...pendingAttempts.map((attempt) => attempt.updatedAt.getTime()),
        ...submittedGroups.map((group) => group.updatedAt.getTime()),
        ...openRequests.map((request) => request.createdAt.getTime()),
      ]),
    });
  }
  return rows;
}

async function studentWaiting(user) {
  const memberships = await Membership.find({ userId: user._id }).select("classroomId");
  const classrooms = await Classroom.find({
    _id: { $in: memberships.map((membership) => membership.classroomId) },
  }).sort({ createdAt: 1 });
  const rows = [];
  for (const classroom of classrooms) {
    const challenges = await Challenge.find({
      classroomId: classroom._id,
    }).select("_id title status updatedAt");
    const myAttempts = await Attempt.find({
      challengeId: { $in: challenges.map((challenge) => challenge._id) },
      studentId: user._id,
    }).select("challengeId reviewStatus updatedAt completedAt");
    const returnedAttempts = myAttempts.filter((attempt) => attempt.reviewStatus === "returned");

    // UX audit item 10: what else is new for the student. Challenges they haven't
    // started, diagnoses approved this past week (that is what lets them mentor),
    // and open questions from classmates on challenges they have finished.
    const started = new Set(myAttempts.map((attempt) => String(attempt.challengeId)));
    const newChallenges = challenges.filter(
      (challenge) => challenge.status === "published" && !started.has(String(challenge._id)),
    );
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const approved = myAttempts.filter((attempt) => attempt.reviewStatus === "approved");
    const recentlyApproved = approved.filter(
      (attempt) => attempt.completedAt && attempt.completedAt.getTime() >= weekAgo,
    );
    const helpable = await HelpRequest.find({
      classroomId: classroom._id,
      status: "open",
      requesterId: { $ne: user._id },
      qualifyingChallengeId: { $in: approved.map((attempt) => attempt.challengeId) },
    }).select("createdAt");

    const miniProjects = await MiniProject.find({
      classroomId: classroom._id,
    }).select("_id title");
    const returnedGroups = await ProjectGroup.find({
      miniProjectId: { $in: miniProjects.map((miniProject) => miniProject._id) },
      memberIds: user._id,
      submissionStatus: "returned",
    }).select("miniProjectId updatedAt");

    // "responded" means a mentor sent a hint and the asker hasn't said if it helped.
    const answered = await HelpRequest.find({
      classroomId: classroom._id,
      requesterId: user._id,
      status: "responded",
    }).select("updatedAt");

    const titleOf = (list, wantedId) =>
      list.find((item) => String(item._id) === String(wantedId))?.title ?? "";
    rows.push({
      classroomId: String(classroom._id),
      classroomName: classroom.name,
      returnedDiagnoses: returnedAttempts.map((attempt) => ({
        challengeId: String(attempt.challengeId),
        title: titleOf(challenges, attempt.challengeId),
      })),
      returnedProjects: returnedGroups.map((group) => ({
        miniProjectId: String(group.miniProjectId),
        title: titleOf(miniProjects, group.miniProjectId),
      })),
      hintsToCheck: answered.length,
      requestsToHelp: helpable.length,
      newChallenges: newChallenges.map((challenge) => ({
        challengeId: String(challenge._id),
        title: challenge.title,
      })),
      approvedDiagnoses: recentlyApproved.map((attempt) => ({
        challengeId: String(attempt.challengeId),
        title: titleOf(challenges, attempt.challengeId),
      })),
      // An approval is news, not something to act on, so it doesn't set the wait.
      oldestWaitingAt: oldest([
        ...[...returnedAttempts, ...returnedGroups, ...answered, ...newChallenges].map((item) =>
          item.updatedAt.getTime(),
        ),
        ...helpable.map((request) => request.createdAt.getTime()),
      ]),
    });
  }
  return rows;
}
