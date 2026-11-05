/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — user handlers
 *  getProfile returns the contribution summary from stored helpful outcomes,
 *  the classrooms the caller may see, completed challenges and project
 *  groups. updateMe and changePassword act only on the logged-in caller.
 * ══════════════════════════════════════════════════════════════════
 */
import User from "../models/User.js";
import Classroom from "../models/Classroom.js";
import Membership from "../models/Membership.js";
import Attempt from "../models/Attempt.js";
import Challenge from "../models/Challenge.js";
import MiniProject from "../models/MiniProject.js";
import ProjectGroup from "../models/ProjectGroup.js";
import { toUserResponse } from "../utils/userDto.js";
import Session from "../models/Session.js";
import {
  verifyPassword,
  passwordProblem,
  hashPassword,
} from "../services/passwordService.js";
import HelpRequest from "../models/HelpRequest.js";
import {
  milestonesForHelpfulCount,
  nextMilestoneForHelpfulCount,
} from "../services/pointsService.js";
import { sendError } from "../utils/httpError.js";

export async function getProfile(req, res) {
  const user = req.prototypeUser;
  if (!user) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
  }
  const profileId = req.params.id;
  if (typeof profileId !== "string" || !/^[a-fA-F0-9]{24}$/.test(profileId)) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "That profile link isn't valid.",
      { field: "id" },
    );
  }
  const profile = await User.findOne({
    _id: profileId,
  });
  if (!profile) {
    return sendError(
      res,
      404,
      "PROFILE_NOT_FOUND",
      "That profile doesn't exist.",
      { field: "id" },
    );
  }
  let targetClassrooms;
  if (profile.role === "professor") {
    targetClassrooms = await Classroom.find({ professorId: profile.id });
  } else {
    const memberships = await Membership.find({ userId: profile.id });
    const classroomIds = memberships.map((m) => m.classroomId);
    targetClassrooms = await Classroom.find({ _id: { $in: classroomIds } });
  }
  let sameClassrooms = [];
  if (profileId === user.id) {
    for (const c of targetClassrooms) {
      sameClassrooms.push({
        id: String(c._id),
        name: c.name,
        description: c.description,
        coverId: c.coverId ?? "default",
      });
    }
  } else {
    let callerClassrooms;
    if (user.role === "professor") {
      callerClassrooms = await Classroom.find({ professorId: user.id });
    } else {
      const callerMemberships = await Membership.find({ userId: user.id });
      const callerClassroomIds = callerMemberships.map((m) => m.classroomId);
      callerClassrooms = await Classroom.find({
        _id: { $in: callerClassroomIds },
      });
    }
    const callerIds = new Set(callerClassrooms.map((c) => String(c._id)));
    const shared = targetClassrooms.filter((c) => callerIds.has(String(c._id)));
    for (const c of shared) {
      sameClassrooms.push({
        id: String(c._id),
        name: c.name,
        description: c.description,
        coverId: c.coverId ?? "default",
      });
    }
  }

  let helpfulCount = 0;
  // only students mentor
  if (profile.role === "student") {
    //Requests profile claimed that were resolved as helpful
    helpfulCount = await HelpRequest.countDocuments({
      claimedBy: profile._id,
      status: "resolved",
      helpful: true,
    });
  }

  //milestone labels
  const milestones = milestonesForHelpfulCount(helpfulCount);
  const nextMilestone = nextMilestoneForHelpfulCount(helpfulCount);
  // Points per classroom, looked up by classroom id: { "classroomId": points }
  const pointsByClassroom = {};

  // Only students earn points, and only visible classrooms are looked up
  const isStudent = profile.role === "student";
  const hasVisibleClassrooms = sameClassrooms.length > 0;

  if (isStudent && hasVisibleClassrooms) {
    // The ids of the classrooms this caller is allowed to see
    const visibleClassroomIds = [];
    for (const classroom of sameClassrooms) {
      visibleClassroomIds.push(classroom.id);
    }

    // This student's memberships in just those classrooms
    const memberships = await Membership.find({
      userId: profile._id,
      classroomId: { $in: visibleClassroomIds },
    });

    // Remember each classroom's stored points
    for (const membership of memberships) {
      const classroomId = String(membership.classroomId);
      pointsByClassroom[classroomId] = membership.contributionPoints;
    }
  }

  const classroomsWithPoints = [];
  for (const classroom of sameClassrooms) {
    // 0 if there is no membership (for example a professor's classroom)
    let points = pointsByClassroom[classroom.id];
    if (points === undefined) {
      points = 0;
    }

    classroomsWithPoints.push({
      ...classroom,
      contributionPoints: points,
    });
  }
  const sameClassroomsIds = sameClassrooms.map((classroom) => classroom.id);
  let completedChallenges = [];
  if (isStudent && hasVisibleClassrooms) {
    const challenges = await Challenge.find({
      classroomId: { $in: sameClassroomsIds },
    }).select("_id title");
    const challengeIds = challenges.map((challenge) => challenge._id);
    const challengeTitles = new Map(
      challenges.map((challenge) => [String(challenge._id), challenge.title]),
    );
    const completedAttempts = await Attempt.find({
      studentId: profile._id,
      challengeId: { $in: challengeIds },
      reviewStatus: "approved",
      completedAt: { $ne: null },
    }).sort({ completedAt: -1 });
    completedChallenges = completedAttempts.map((attempt) => ({
      challengeId: String(attempt.challengeId),
      title: challengeTitles.get(String(attempt.challengeId)),
      completedAt: attempt.completedAt,
    }));
  }

  let projects = [];
  if (isStudent && hasVisibleClassrooms) {
    const groups = await ProjectGroup.find({ memberIds: profile._id });
    const miniProjectIds = groups.map((group) => group.miniProjectId);
    const studentMiniProjects = await MiniProject.find({
      _id: { $in: miniProjectIds },
      classroomId: { $in: sameClassroomsIds },
    });
    const miniProjectTitles = new Map(
      studentMiniProjects.map((miniProject) => [
        String(miniProject._id),
        miniProject.title,
      ]),
    );

    projects = groups
      .filter((group) => miniProjectTitles.has(String(group.miniProjectId)))
      .map((group) => ({
        groupId: String(group._id),
        groupName: group.name,
        miniProjectId: String(group.miniProjectId),
        miniProjectTitle: miniProjectTitles.get(String(group.miniProjectId)),
        submissionStatus: group.submissionStatus,
      }));
  }
  return res.status(200).json({
    data: {
      ...toUserResponse(profile),
      classrooms: classroomsWithPoints,
      helpfulCount,
      milestones,
      nextMilestone,
      completedChallenges,
      projects,
    },
  });
}

export async function updateMe(req, res) {
  if (!req.prototypeUser) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
  }
  let displayName = req.body?.displayName;
  if (
    typeof displayName !== "string" ||
    displayName.trim().length < 1 ||
    displayName.trim().length > 60
  ) {
    return sendError(
      res,
      400,
      "VALIDATION_FAILED",
      "Check the highlighted fields.",
      [{ field: "displayName", message: "Enter a display name of 1 to 60 characters." }],
    );
  } else {
    const updated = await User.findByIdAndUpdate(
      req.prototypeUser._id,
      { $set: { displayName: displayName.trim() } },
      { returnDocument: "after" },
    );
    if (!updated) {
      return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
    } else {
      return res.status(200).json({ data: toUserResponse(updated) });
    }
  }
}

export async function changePassword(req, res) {
  if (!req.prototypeUser) {
    return sendError(res, 401, "UNAUTHENTICATED", "Log in to continue.");
  }
  const currentPassword = req.body?.currentPassword;
  const newPassword = req.body?.newPassword;
  const user = await User.findById(req.prototypeUser._id).select(
    "+passwordHash",
  );
  if (
    typeof currentPassword !== "string" ||
    !(await verifyPassword(currentPassword, user?.passwordHash))
  ) {
    return sendError(res, 401, "INVALID_CREDENTIALS", "Current password is incorrect.");
  } else {
    const message = passwordProblem(newPassword);
    if (message) {
      return sendError(
        res,
        400,
        "VALIDATION_FAILED",
        'Check the highlighted fields.',
        [{ field: "newPassword", message }],
      );
    }
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash: await hashPassword(newPassword) } },
    );
    await Session.deleteMany({ userId: user._id, _id: { $ne: req.sessionId } });
    return res.status(204).end();
  }
}
