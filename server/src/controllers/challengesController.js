/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — challenge handlers
 *  Authoring: create, update, publish, get, hint drafts and content drafts
 *  (decisions B-13 and B-14 in docs/TEAM_DECISIONS.md). Attempts: create an
 *  attempt, submit the applied diagnosis, and the professor's review. The
 *  B and C labels below are this project's build order in
 *  docs/CORE_BUILD_GUIDE.md sections 8 and 9.
 * ══════════════════════════════════════════════════════════════════
 */
import { requestContentDraft, requestHintDrafts } from "../services/geminiService.js";
import mongoose from "mongoose";
import Attempt from "../models/Attempt.js";
import {
  checkAnswer,
  calculateStructuredProgress,
  buildQuestionResults,
  unlockedHints,
} from "../services/challengeService.js";
import Challenge from "../models/Challenge.js";
import Classroom from "../models/Classroom.js";
import Membership from "../models/Membership.js";
import { HttpError } from "../utils/httpError.js";
import {
  createDraftFields,
  validateChallengeDraft,
} from "../utils/challengeDraft.js";
import {
  toLearnerChallengeDto,
  toProfessorChallengeDto,
} from "../utils/challengeDto.js";
import { validateChallengePublication } from "../utils/challengePublication.js";
import { validateContentDraftRequest } from "../utils/challengeContentDraft.js";

/* B5a: create an owning-professor draft under the B1/B2a/B2b/B6 contract. */
export async function createChallenge(req, res) {
  const user = req.prototypeUser;
  if (!user)
    throw new HttpError(
      401,
      "UNAUTHENTICATED",
      "Log in to create a challenge.",
    );
  const classroomId = req.params.id;
  if (
    typeof classroomId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(classroomId)
  ) {
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "That classroom link isn't valid.",
      [{ field: "id", message: "That classroom link isn't valid." }],
    );
  }
  const classroom = await Classroom.findById(classroomId);
  if (!classroom)
    throw new HttpError(
      404,
      "CLASSROOM_NOT_FOUND",
      "Classroom was not found.",
      { field: "id" },
    );
  if (
    user.role !== "professor" ||
    String(user._id) !== String(classroom.professorId)
  ) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only the owning professor may create a challenge.",
    );
  }
  const details = validateChallengeDraft(req.body, { requireMetadata: true });
  if (details.length)
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "Challenge input is invalid.",
      details,
    );
  let challenge;
  try {
    challenge = await Challenge.create({
      ...createDraftFields(req.body),
      classroomId: classroom._id,
      createdBy: user._id,
    });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      throw new HttpError(
        400,
        "VALIDATION_FAILED",
        "Challenge input is invalid.",
        Object.keys(error.errors).map((field) => ({
          field,
          message: "Field failed validation.",
        })),
      );
    }
    throw error;
  }
  return res.status(201).json({ data: toProfessorChallengeDto(challenge) });
}

// Generate from the professor's current editor state, without creating a draft.
export async function draftChallengeContent(req, res) {
  const user = req.prototypeUser;
  if (!user)
    throw new HttpError(
      401,
      "UNAUTHENTICATED",
      "Log in to generate challenge content.",
    );
  const classroomId = req.params.id;
  if (typeof classroomId !== "string" || !/^[a-fA-F0-9]{24}$/.test(classroomId))
    throw new HttpError(
      400,
      "CONTENT_DRAFT_INVALID",
      "Choose a valid classroom before generating challenge content.",
      [{ field: "id", message: "That classroom link isn't valid." }],
    );
  const classroom = await Classroom.findById(classroomId);
  if (!classroom)
    throw new HttpError(404, "CLASSROOM_NOT_FOUND", "Classroom was not found.");
  if (user.role !== "professor" || String(user._id) !== String(classroom.professorId))
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only the owning professor may generate challenge content.",
    );
  const { details, field, context } = validateContentDraftRequest(req.body);
  if (details.length)
    throw new HttpError(
      400,
      "CONTENT_DRAFT_INVALID",
      "Complete the required challenge fields before generating.",
      details,
    );
  const content = await requestContentDraft(field, context);
  return res.status(200).json({ data: { field, content } });
}

// B5b ownership/save helpers.
async function owningProfessorChallenge(req) {
  const user = req.prototypeUser;
  if (!user)
    throw new HttpError(
      401,
      "UNAUTHENTICATED",
      "Log in to change a challenge.",
    );
  const id = req.params.id;
  if (typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id))
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "That challenge link isn't valid.",
      [{ field: "id", message: "That challenge link isn't valid." }],
    );
  const challenge = await Challenge.findById(id);
  if (!challenge)
    throw new HttpError(
      404,
      "CHALLENGE_NOT_FOUND",
      "Challenge was not found.",
      { field: "id" },
    );
  const classroom = await Classroom.findById(challenge.classroomId);
  if (!classroom)
    throw new HttpError(404, "CLASSROOM_NOT_FOUND", "Classroom was not found.");
  if (
    user.role !== "professor" ||
    String(user._id) !== String(classroom.professorId)
  )
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only the owning professor may change this challenge.",
    );
  return challenge;
}

async function saveChallenge(challenge) {
  try {
    await challenge.save();
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError)
      throw new HttpError(
        400,
        "VALIDATION_FAILED",
        "Challenge input is invalid.",
        Object.keys(error.errors).map((field) => ({
          field,
          message: "Field failed validation.",
        })),
      );
    if (error instanceof mongoose.Error.VersionError)
      throw new HttpError(
        409,
        "CHALLENGE_CONFLICT",
        "Challenge changed. Reload it before trying again.",
      );
    throw error;
  }
}

/* B5b: B-9 locks published content; B-10 updates present fields only;
 * B-11 rejects ownership/status changes. Validate before changing the document.
 */
export async function updateChallenge(req, res) {
  const challenge = await owningProfessorChallenge(req);
  if (challenge.status === "published")
    throw new HttpError(
      409,
      "CHALLENGE_PUBLISHED",
      "Published challenges cannot be edited.",
    );
  const body = req.body;
  const details = validateChallengeDraft(body, { requireTitle: false });
  const existingIds = new Map(
    challenge.questions.map((block) => [String(block._id), block._id]),
  );
  if (body && typeof body === "object" && !Array.isArray(body)) {
    for (const field of ["status", "createdBy", "classroomId"]) {
      if (Object.hasOwn(body, field))
        details.push({
          field,
          message: "This field cannot be changed in a draft update.",
        });
    }
    if (Array.isArray(body.questions)) {
      const seen = new Set();
      body.questions.forEach((block, index) => {
        if (!block || typeof block !== "object" || !Object.hasOwn(block, "id"))
          return;
        const id = typeof block.id === "string" ? block.id.toLowerCase() : "";
        if (!existingIds.has(id))
          details.push({
            field: `questions.${index}.id`,
            message: "Block id must belong to this challenge.",
          });
        else if (seen.has(id))
          details.push({
            field: `questions.${index}.id`,
            message: "Block ids must not be repeated.",
          });
        seen.add(id);
      });
    }
  }
  if (details.length)
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "Challenge input is invalid.",
      details,
    );
  const fields = createDraftFields(body);
  if (fields.questions) {
    fields.questions.forEach((block, index) => {
      const id = body.questions[index].id;
      if (id !== undefined) block._id = existingIds.get(id.toLowerCase());
    });
  }
  // An empty/unknown-only body is a harmless read, without timestamp changes.
  if (Object.keys(fields).length) {
    challenge.set(fields);
    await saveChallenge(challenge);
  }
  return res.status(200).json({ data: toProfessorChallengeDto(challenge) });
}

/* B7: validate only stored content, never request content. B-12 repeats are
 * harmless and leave timestamps unchanged.
 */
export async function publishChallenge(req, res) {
  const challenge = await owningProfessorChallenge(req);
  if (challenge.status === "published")
    return res.status(200).json({ data: toProfessorChallengeDto(challenge) });
  const details = validateChallengePublication(challenge);
  if (details.length)
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "Challenge is incomplete or invalid for publication.",
      details,
    );
  challenge.status = "published";
  try {
    await saveChallenge(challenge);
  } catch (error) {
    if (error.code === "CHALLENGE_CONFLICT") {
      const latest = await Challenge.findById(challenge._id);
      if (latest?.status === "published")
        return res.status(200).json({ data: toProfessorChallengeDto(latest) });
    }
    throw error;
  }
  return res.status(200).json({ data: toProfessorChallengeDto(challenge) });
}

/* DELETE /challenges/:id removes a draft the owning professor no longer wants.
 * Only drafts: students never see one, so nothing else points at it. The
 * status is part of the delete filter, so a publish that lands first wins.
 */
export async function deleteChallenge(req, res) {
  const challenge = await owningProfessorChallenge(req);
  const result = await Challenge.deleteOne({ _id: challenge._id, status: "draft" });
  if (result.deletedCount === 0)
    throw new HttpError(
      409,
      "CHALLENGE_PUBLISHED",
      "Published challenges cannot be deleted.",
    );
  return res.status(204).end();
}

/* B8: explicit role-specific DTOs after classroom ownership/membership checks.
 * Member students see published content only, without answers or explanations,
 * plus their current attempt, which carries the progressive hints unlocked so
 * far (H-7).
 */
export async function getChallenge(req, res) {
  const user = req.prototypeUser;

  if (!user)
    throw new HttpError(
      401,
      "UNAUTHENTICATED",
      "Log in to read a challenge.",
    );
  const challengeId = req.params.id;

  if (typeof challengeId !== "string" || !/^[a-fA-F0-9]{24}$/.test(challengeId))
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "That challenge link isn't valid.",
      [{ field: "id", message: "That challenge link isn't valid." }],
    );
  const challenge = await Challenge.findById(challengeId);

  const notFound = () =>
    new HttpError(404, "CHALLENGE_NOT_FOUND", "Challenge was not found.", {
      field: "id",
    });

  if (!challenge) throw notFound();
  const classroom = await Classroom.findById(challenge.classroomId);

  if (!classroom)
    throw new HttpError(404, "CLASSROOM_NOT_FOUND", "Classroom was not found.");

  if (
    user.role === "professor" &&
    String(user._id) === String(classroom.professorId)
  )
    return res.status(200).json({ data: toProfessorChallengeDto(challenge) });

  if (user.role === "student") {
    const membership = await Membership.findOne({
      classroomId: classroom._id,
      userId: user._id,
    });

    if (membership) {
      if (challenge.status !== "published") throw notFound();

      const attempt = await Attempt.findOne({
        challengeId: challenge._id,
        studentId: user._id,
      });

      let attemptDto = null;

      if (attempt) {
        const progress = calculateStructuredProgress(
          challenge.questions,
          attempt.answers
        );

        attemptDto = {
          id: String(attempt._id),
          structuredScore: progress.structuredScore,
          structuredComplete: progress.structuredComplete,
          reviewStatus: attempt.reviewStatus,
          appliedDiagnosis: attempt.appliedDiagnosis ?? "",
          professorFeedback: attempt.professorFeedback ?? "",
          completedAt: attempt.completedAt ?? null,
          questionResults: buildQuestionResults(
            challenge.questions,
            attempt.answers
          ),
          unlockedHints: unlockedHints(
            challenge.progressiveHints,
            attempt.answers
          ),
        };
      }

      return res.status(200).json({
        data: {
          ...toLearnerChallengeDto(challenge),
          attempt: attemptDto,
        },
      });
    }
  }
  throw new HttpError(
    403,
    "FORBIDDEN",
    "Only the owning professor or a joined student may read this challenge.",
  );
}

// Sends only an explicit projection of the stored, non-secret challenge text.
// The service validates the hints; this endpoint never changes or saves the
// challenge (B-13/B-14).
export async function draftHints(req, res) {
  const challenge = await owningProfessorChallenge(req);
  if (challenge.status === "published") {
    throw new HttpError(
      409,
      "CHALLENGE_PUBLISHED",
      "Published challenges cannot be edited.",
    );
  }
  const text = (value) => (typeof value === "string" ? value : "");
  const draftText = JSON.stringify({
    title: text(challenge.title),
    language: text(challenge.language),
    objective: text(challenge.objective),
    prompt: text(challenge.prompt),
    codeSnippet: text(challenge.codeSnippet),
    questions: challenge.questions.map((block) => ({
      type: text(block.type),
      prompt: text(block.prompt),
    })),
    appliedCase: { prompt: text(challenge.appliedCase?.prompt) },
  });
  const hints = await requestHintDrafts(draftText);
  return res.status(200).json({ data: { hints } });
}

// Answers are compared, never run: nothing here evaluates or executes submitted code.

// Structured answers lock while the diagnosis is pending review or approved. A
// question already answered correctly also stays solved: a later wrong answer
// would otherwise count as the latest one, un-solve it and unlock hints
// (third-pass audit D).
function assertCanAnswer(attempt, questionId) {
  if (!attempt) return;
  if (["pending", "approved"].includes(attempt.reviewStatus)) {
    throw new HttpError(
      409,
      "ATTEMPT_LOCKED",
      "Structured answers cannot be modified while the diagnosis is pending review or approved."
    );
  }
  const latest = attempt.answers
    .filter((answer) => answer.questionId === String(questionId))
    .at(-1);
  if (latest?.correct) {
    throw new HttpError(
      409,
      "QUESTION_SOLVED",
      "You've already solved this question."
    );
  }
}

export async function createAttempt(req, res) {
  // 1. Check authentication
  const user = req.prototypeUser;

  if (!user) {
    throw new HttpError(
      401,
      "UNAUTHENTICATED",
      "Select a student before submitting an answer."
    );
  }

  // 2. Validate challenge ID
  const challengeId = req.params.id;

  if (
    typeof challengeId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(challengeId)
  ) {
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "That challenge link isn't valid."
    );
  }

  // 3. Load published challenge
  const challenge = await Challenge.findById(challengeId);

  if (!challenge || challenge.status !== "published") {
    throw new HttpError(
      404,
      "CHALLENGE_NOT_FOUND",
      "Challenge was not found."
    );
  }

  // 4. Check classroom
  const classroom = await Classroom.findById(challenge.classroomId);

  if (!classroom) {
    throw new HttpError(
      404,
      "CLASSROOM_NOT_FOUND",
      "Classroom was not found."
    );
  }

  // 5. Only students may submit answers
  if (user.role !== "student") {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only students may submit challenge answers."
    );
  }

  // 6. Verify classroom membership
  const membership = await Membership.findOne({
    classroomId: classroom._id,
    userId: user._id,
  });

  if (!membership) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "You must join this classroom before submitting."
    );
  }

  // 7. Read submitted answer
  const { questionId, value } = req.body ?? {};

  if (
    typeof questionId !== "string" ||
    !mongoose.isValidObjectId(questionId)
  ) {
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "Invalid question ID."
    );
  }

  // 8. Find the question
  const question = challenge.questions.find(
    (item) => String(item._id) === questionId
  );

  if (!question) {
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "Question does not exist in this challenge."
    );
  }

  // 9. Validate and score answer
  const result = checkAnswer(value, question);

  if (!result.valid) {
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "Invalid answer format."
    );
  }

  // 10. Find existing Attempt
  const filter = {
    challengeId: challenge._id,
    studentId: user._id,
  };

  let attempt = await Attempt.findOne(filter);
  const isNew = !attempt;

  // 11. Lock structured answers during review and after approval, and keep a
  // solved question solved
  assertCanAnswer(attempt, question._id);

  // 12. Create history entry
  const entry = {
    questionId: String(question._id),
    value,
    correct: result.correct,
    submittedAt: new Date(),
  };

  // 13. Create an Attempt if one does not exist
  if (!attempt) {
    attempt = new Attempt({
      challengeId: challenge._id,
      studentId: user._id,
      answers: [],
      structuredScore: 0,
      reviewStatus: "not-submitted",
    });
  }

  // 14. Append submission history
  attempt.answers.push(entry);

  // 15. Recalculate structured progress
  let progress = calculateStructuredProgress(
    challenge.questions,
    attempt.answers
  );

  attempt.structuredScore = progress.structuredScore;

  // 16. Save Attempt to MongoDB
  try {
    await attempt.save();
  } catch (error) {
    // Handle simultaneous first submissions
    if (error.code !== 11000 || !isNew) {
      throw error;
    }

    attempt = await Attempt.findOne(filter);

    if (!attempt) {
      throw error;
    }

    // Recheck the lock after a duplicate-key conflict
    assertCanAnswer(attempt, question._id);

    attempt.answers.push(entry);

    progress = calculateStructuredProgress(
      challenge.questions,
      attempt.answers
    );

    attempt.structuredScore = progress.structuredScore;

    await attempt.save();
  }

  // 17. Build learner-safe question results using the shared service
  const questionResults = buildQuestionResults(
    challenge.questions,
    attempt.answers
  );

  // 18. Return safe response
  return res.status(isNew ? 201 : 200).json({
    data: {
      id: String(attempt._id),
      questionId: String(question._id),
      correct: result.correct,
      questionResults,
      structuredScore: progress.structuredScore,
      structuredComplete: progress.structuredComplete,
      reviewStatus: attempt.reviewStatus,
      professorFeedback: attempt.professorFeedback ?? "",
      completedAt: attempt.completedAt ?? null,
      unlockedHints: unlockedHints(
        challenge.progressiveHints,
        attempt.answers
      ),
    },
  });
}





export async function submitAppliedDiagnosis(req, res) {
  const user = req.prototypeUser;

  // 1. Check authentication
  if (!user) {
    throw new HttpError(
      401,
      "UNAUTHENTICATED",
      "Select a student before submitting a diagnosis."
    );
  }

  // 2. Validate Attempt ID
  const attemptId = req.params.id;

  if (
    typeof attemptId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(attemptId)
  ) {
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "That attempt link isn't valid."
    );
  }

  // 3. Find Attempt
  const attempt = await Attempt.findById(attemptId);

  if (!attempt) {
    throw new HttpError(
      404,
      "ATTEMPT_NOT_FOUND",
      "Attempt was not found."
    );
  }

  // 4. Verify student ownership
  if (
    user.role !== "student" ||
    String(attempt.studentId) !== String(user._id)
  ) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only the student who owns this attempt may submit a diagnosis."
    );
  }

  // 5. Validate diagnosis
  const diagnosis = req.body?.appliedDiagnosis;

  if (
    typeof diagnosis !== "string" ||
    diagnosis.trim().length === 0
  ) {
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "Applied diagnosis must be non-empty text."
    );
  }

  // 6. Find associated Challenge
  const challenge = await Challenge.findById(attempt.challengeId);

  if (!challenge) {
    throw new HttpError(
      404,
      "CHALLENGE_NOT_FOUND",
      "Challenge was not found."
    );
  }

  // 7. Enforce structured completion
  const progress = calculateStructuredProgress(
    challenge.questions,
    attempt.answers
  );

  if (!progress.structuredComplete) {
    throw new HttpError(
      409,
      "STRUCTURED_INCOMPLETE",
      "Complete all structured questions correctly before submitting a diagnosis."
    );
  }

  // 8. Prevent changes to approved attempts
  if (attempt.reviewStatus === "approved") {
    throw new HttpError(
      409,
      "ATTEMPT_COMPLETED",
      "Approved attempts cannot be modified."
    );
  }

  // 9. Validate review state
  // Allowed: not-submitted, pending, returned -> pending
  if (
    !["not-submitted", "pending", "returned"].includes(
      attempt.reviewStatus
    )
  ) {
    throw new HttpError(
      409,
      "INVALID_REVIEW_STATUS",
      "Diagnosis cannot be submitted in the current review state."
    );
  }

  // 10. Save diagnosis and mark it pending
  attempt.appliedDiagnosis = diagnosis.trim();
  attempt.reviewStatus = "pending";
  attempt.structuredScore = progress.structuredScore;
  attempt.completedAt = null;

  // Clear outdated feedback when resubmitting, keeping it for the professor's
  // next review
  if (attempt.professorFeedback) attempt.previousFeedback = attempt.professorFeedback;
  attempt.professorFeedback = "";

  await attempt.save();

  // 11. Use shared function for learner-safe question results
  const questionResults = buildQuestionResults(
    challenge.questions,
    attempt.answers
  );

  // 12. Return updated Attempt
  return res.status(200).json({
    data: {
      id: String(attempt._id),
      structuredScore: progress.structuredScore,
      structuredComplete: progress.structuredComplete,
      reviewStatus: attempt.reviewStatus,
      appliedDiagnosis: attempt.appliedDiagnosis,
      professorFeedback: attempt.professorFeedback ?? "",
      completedAt: attempt.completedAt ?? null,
      questionResults,
    },
  });
}



export async function reviewAttempt(req, res) {
  const user = req.prototypeUser;

  // 1. Check authentication
  if (!user) {
    throw new HttpError(
      401,
      "UNAUTHENTICATED",
      "Log in to review an attempt."
    );
  }

  // 2. Validate Attempt ID
  const attemptId = req.params.id;

  if (
    typeof attemptId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(attemptId)
  ) {
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "That attempt link isn't valid."
    );
  }

  // 3. Find Attempt
  const attempt = await Attempt.findById(attemptId);

  if (!attempt) {
    throw new HttpError(
      404,
      "ATTEMPT_NOT_FOUND",
      "Attempt was not found."
    );
  }

  // 4. Find associated Challenge
  const challenge = await Challenge.findById(attempt.challengeId);

  if (!challenge) {
    throw new HttpError(
      404,
      "CHALLENGE_NOT_FOUND",
      "Challenge was not found."
    );
  }

  // 5. Find associated Classroom
  const classroom = await Classroom.findById(challenge.classroomId);

  if (!classroom) {
    throw new HttpError(
      404,
      "CLASSROOM_NOT_FOUND",
      "Classroom was not found."
    );
  }

  // 6. Only the owning professor can review
  if (
    user.role !== "professor" ||
    String(user._id) !== String(classroom.professorId)
  ) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only the owning professor may review this attempt."
    );
  }

  // 7. Read the review request
  const { decision, feedback } = req.body ?? {};

  if (!["approve", "return"].includes(decision)) {
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "Decision must be either approve or return."
    );
  }

  if (
    feedback !== undefined &&
    typeof feedback !== "string"
  ) {
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "Feedback must be a string."
    );
  }

  const trimmedFeedback = (feedback ?? "").trim();

  // Returning an attempt requires feedback
  if (decision === "return" && !trimmedFeedback) {
    throw new HttpError(
      400,
      "VALIDATION_FAILED",
      "Feedback is required when returning a diagnosis."
    );
  }

  // 8. Only pending attempts can be reviewed
  if (attempt.reviewStatus !== "pending") {
    throw new HttpError(
      409,
      "INVALID_REVIEW_STATUS",
      "Only pending attempts can be reviewed."
    );
  }

  // 9. Recheck structured completion on approval
  const progress = calculateStructuredProgress(
    challenge.questions,
    attempt.answers
  );

  if (decision === "approve" && !progress.structuredComplete) {
    throw new HttpError(
      409,
      "STRUCTURED_INCOMPLETE",
      "Cannot approve an attempt with incomplete structured work."
    );
  }

  // 10. Apply the professor's decision
  if (decision === "approve") {
    attempt.reviewStatus = "approved";
    attempt.completedAt = new Date();
  } else {
    attempt.reviewStatus = "returned";
    attempt.completedAt = null;
  }

  attempt.professorFeedback = trimmedFeedback;
  attempt.structuredScore = progress.structuredScore;

  // 11. Persist changes
  await attempt.save();

  // 12. Return the updated Attempt
  return res.status(200).json({
    data: {
      id: String(attempt._id),
      challengeId: String(attempt.challengeId),
      studentId: String(attempt.studentId),
      structuredScore: attempt.structuredScore,
      structuredComplete: progress.structuredComplete,
      appliedDiagnosis: attempt.appliedDiagnosis ?? "",
      reviewStatus: attempt.reviewStatus,
      professorFeedback: attempt.professorFeedback ?? "",
      completedAt: attempt.completedAt ?? null,
    },
  });
}

