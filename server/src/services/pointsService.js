/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — points service
 *  milestonesForHelpfulCount lists the helpful-answer milestones reached.
 *  calculateMentorAward checks a help request and returns the points it earns.
 * ══════════════════════════════════════════════════════════════════
 */
import { HttpError } from "../utils/httpError.js";

const MILESTONES = [
  { label: "First Assist", threshold: 1 },
  { label: "Helpful Five", threshold: 5 },
  { label: "Challenge Guide", threshold: 10 },
];

export function milestonesForHelpfulCount(count) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new HttpError(
      400,
      "INVALID_HELPFUL_COUNT",
      "Helpful count must be a nonnegative integer.",
    );
  }
  return MILESTONES.filter((milestone) => milestone.threshold <= count).map(
    (milestone) => milestone.label,
  );
}

export function nextMilestoneForHelpfulCount(count) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new HttpError(
      400,
      "INVALID_HELPFUL_COUNT",
      "Helpful count must be a nonnegative integer.",
    );
  }
  return MILESTONES.find((milestone) => milestone.threshold > count) ?? null;
}

//points a mentor earns when the requester says the hint helped
export const HELPFUL_POINTS = 5;

export function calculateMentorAward(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new HttpError(
      400,
      "INVALID_HELP_REQUEST",
      "A help request object is required.",
    );
  }
  // This function performs no writes. resolveHelpRequest sets pointsAwarded with a
  // conditional update first, then adds the points, so a request awards once.

  //request must have an id
  if (!request._id) {
    throw new HttpError(
      400,
      "INVALID_HELP_REQUEST",
      "The help request has no id.",
    );
  }

  // validate claimed mentor
  if (!request.claimedBy) {
    throw new HttpError(
      409,
      "NO_MENTOR",
      "This request has no mentor to award points to.",
    );
  }

  //requester ownership validation
  if (!request.requesterId) {
    throw new HttpError(
      400,
      "INVALID_HELP_REQUEST",
      "The help request has no requester.",
    );
  }

  // Self-help is invalid
  // Compare as strings
  if (String(request.claimedBy) === String(request.requesterId)) {
    throw new HttpError(
      403,
      "SELF_HELP",
      "A mentor cannot earn points for their own request.",
    );
  }

  //prevent second award
  if (request.pointsAwarded === true) {
    return 0;
  }

  //resolution state validation
  if (request.status !== "responded" && request.status !== "resolved") {
    throw new HttpError(
      409,
      "INVALID_STATE",
      "Points can only be awarded after the mentor has responded.",
    );
  }

  // helpful verdict nust be a boolean
  if (typeof request.helpful !== "boolean") {
    throw new HttpError(
      409,
      "NOT_JUDGED",
      "The requester has not said whether the hint helped.",
    );
  }

  // Helpful resolution yields five points and unresolved yields zero
  if (request.helpful) {
    return HELPFUL_POINTS;
  }
  return 0;
}
