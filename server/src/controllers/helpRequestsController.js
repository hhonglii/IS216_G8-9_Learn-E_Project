/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — help request handlers
 *  create, list, then the lifecycle claim -> respond -> resolve, plus the two
 *  ways back out: the asker withdraws an open request, and a mentor unclaims
 *  before hinting. Claiming and resolving need an atomic state change, and read-then-check-then-save
 *  cannot give one, so both use a conditional findOneAndUpdate. A passing
 *  mocked sequential test does not prove that; the database tests do.
 * ══════════════════════════════════════════════════════════════════
 */
import { HttpError, sendError } from "../utils/httpError.js";
import { calculateMentorAward } from "../services/pointsService.js"
import { addContributionPoints } from "../models/Membership.js"

import mongoose from "mongoose"

import HelpRequest from "../models/HelpRequest.js"
import Challenge from "../models/Challenge.js"
import Classroom from "../models/Classroom.js"
import Membership from "../models/Membership.js"
import Attempt from "../models/Attempt.js"
import { orderedQuestions } from "../utils/challengeDto.js"
import { answerText } from "../utils/answerText.js"


const HINT_TYPES = HelpRequest.schema.path("hintType").enumValues


//helper function for error rendering 

//helper function for text formatting 
function cleanText(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export async function createHelpRequest(req, res) {
  try {
    const user = req.prototypeUser
    if (!user) {
      return sendError(res, 401, "UNAUTHENTICATED", "Log in to ask for help.")
    }
    if (user.role !== "student") {
      return sendError(res, 403, "FORBIDDEN", "Only students may ask for help. Switch to a student account to continue.")
    }

    // H-14: contextType "challenge" is question help about one question of a
    // published challenge; contextType "classroom" is general class help.
    const { contextType, contextId } = req.body || {}
    if (contextType !== "challenge" && contextType !== "classroom") {
      return sendError(res, 400, "VALIDATION_FAILED",
        "Choose question help or general class help.",
        { field: "contextType" })
    }
    const isQuestionHelp = contextType === "challenge"

    if (!mongoose.isValidObjectId(contextId)) {
      return sendError(res, 400, "VALIDATION_FAILED",
        isQuestionHelp
          ? "We couldn't tell which challenge this is about. Please go back and try again."
          : "We couldn't tell which classroom this is about. Please go back and try again.",
        { field: "contextId" });
    }

    let challenge = null
    let classroomId = contextId
    if (isQuestionHelp) {
      challenge = await Challenge.findById(contextId)
      if (!challenge || challenge.status !== "published") {
        return sendError(res, 404, "CHALLENGE_NOT_FOUND",
          "We couldn't find that challenge. It may not be available yet.")
      }
      classroomId = challenge.classroomId
    } else {
      const classroom = await Classroom.findById(contextId)
      if (!classroom) {
        return sendError(res, 404, "CLASSROOM_NOT_FOUND", "Classroom not found.")
      }
    }

    const membership = await Membership.findOne({
      classroomId,
      userId: user._id,
    })
    if (!membership) {
      return sendError(res, 403, "FORBIDDEN",
        isQuestionHelp
          ? "Join this classroom to ask for help with its challenges."
          : "Join this classroom to ask for help in it.")
    }

    const { hintType } = req.body
    const details = []
    const fields = {}
    if (isQuestionHelp) {
      // The question must be one of this challenge's blocks.
      const questionId = req.body.questionId
      const question = (challenge.questions ?? []).find(
        (block) => block._id && String(block._id) === String(questionId),
      )
      if (!question) {
        details.push({ field: "questionId", message: "Choose which question you need help with." })
      } else {
        fields.questionId = question._id
        // The mentor sees what the asker last answered, if it was wrong (UX audit item 17).
        const attempt = await Attempt.findOne({ challengeId: challenge._id, studentId: user._id })
          .select("answers")
          .lean()
        const last = (attempt?.answers ?? [])
          .filter((answer) => answer.questionId === String(question._id))
          .at(-1)
        if (last && !last.correct) {
          const text = answerText(question, last.value)
          if (text) fields.askerAnswer = text
        }
      }
    } else {
      fields.codeSnippet = cleanText(req.body.codeSnippet)
      fields.expectedBehaviour = cleanText(req.body.expectedBehaviour)
      fields.actualBehaviour = cleanText(req.body.actualBehaviour)
      if (!fields.codeSnippet) {
        details.push({ field: "codeSnippet", message: "Paste the code you need help with." })
      }
      if (!fields.expectedBehaviour) {
        details.push({ field: "expectedBehaviour", message: "Say what you expected to happen." })
      }
      if (!fields.actualBehaviour) {
        details.push({ field: "actualBehaviour", message: "Say what happened instead." })
      }
    }
    if (!HINT_TYPES.includes(hintType)) {
      details.push({ field: "hintType", message: "Choose the kind of hint you would like." })
    }
    if (details.length > 0) {
      return sendError(res, 400, "VALIDATION_FAILED", "Fix the highlighted fields and try again.", details)
    }

    const helpRequest = await HelpRequest.create({
      kind: isQuestionHelp ? "question" : "general",
      classroomId,
      ...(isQuestionHelp
        ? { challengeId: challenge._id, qualifyingChallengeId: challenge._id }
        : {}),
      requesterId: user._id,
      ...fields,
      hintType
    })
    //return success
    return res.status(201).json({
      data: {
        id: String(helpRequest._id),
        status: helpRequest.status, // Defaults to "open" in schema
      },
    });
  } catch (error) {
    //schema validation error 
    if (error.name === "ValidationError") {
      return sendError(res, 400, "VALIDATION_FAILED", "Some of your details were not valid. Please check them and try again.");
    }
    // other errors 
    console.error("Failed to create help request:", error)
    return sendError(
      res,
      500,
      "INTERNAL_ERROR",
      "Could not create the help request. Please try again."
    )
  }
}

// D-6: mentorResponse goes only to the requester, the assigned mentor and the owning professor.
export async function listHelpRequests(req, res) {
  try {
    const user = req.prototypeUser
    if (!user) {
      return sendError(res, 401, "UNAUTHENTICATED", "Log in to see the help queue.")
    }
    //from request
    const classroomId = req.params.id
    if (!mongoose.isValidObjectId(classroomId)) {
      return sendError(res, 400, "VALIDATION_FAILED",
        "The classroom link does not look right.",
        { field: "id" })
    }
    //from classroom model
    const classroom = await Classroom.findById(classroomId)
    if (!classroom) {
      return sendError(res, 404, "CLASSROOM_NOT_FOUND",
        "Classroom not found.")
    }
    //check owner 
    const isOwner =
      user.role === "professor" && String(user._id) === String(classroom.professorId)

    // check member 
    let isMember = false;
    if (user.role === "student") {
      const membership = await Membership.findOne({
        classroomId: classroom._id,
        userId: user._id,
      });
      isMember = !!membership;
    }
    if (!isOwner && !isMember) {
      return sendError(res, 403, "FORBIDDEN", "You need to be part of this classroom to view this queue.");
    }
    //find all help requests 
    const requests = await HelpRequest.find({ classroomId: classroom._id })
      // order with most recent first 
      .sort({ createdAt: -1 })
      // the title, the questions so question help can show its number and prompt,
      // and the code the mentor reads beside it (UX audit item 12)
      .populate("challengeId", "title questions codeSnippet")
      //display name of student requester 
      .populate("requesterId", "displayName")

    // Default to an empty Set
    const completedIds = new Set();

    if (isMember) {
      const approvedAttempts = await Attempt.find({
        studentId: user._id,
        reviewStatus: "approved",
        challengeId: {
          $in: requests.map((r) => r.qualifyingChallengeId).filter(Boolean),
        },
      })
        .select("challengeId")
        .lean();

      // Store unique string IDs in the Set (must stay INSIDE this block)
      for (const attempt of approvedAttempts) {
        completedIds.add(String(attempt.challengeId))
      }
    }

    // Pre-calculate user identity once outside the loop
    const currentUserId = String(user._id)

    const queue = requests.map((request) => {
      const requester = request.requesterId // Populated User
      const challenge = request.challengeId // Populated Challenge

      const requesterId = requester?._id ? String(requester._id) : null
      const mentorId = request.claimedBy ? String(request.claimedBy) : null


      const isRequester = requesterId === currentUserId
      const isMentor = mentorId === currentUserId
      const canSeeResponse = isRequester || isMentor || isOwner

      // General class help has no qualifying challenge: any other classmate may claim it (H-14).
      const qualifiesForClaim =
        !request.qualifyingChallengeId || completedIds.has(String(request.qualifyingChallengeId))
      const canClaim = isMember && request.status === "open" && !isRequester && qualifiesForClaim
      // A wrong answer would rule out a choice for a classmate still working on the
      // challenge, so only people who could help, or already know, see it.
      const canSeeAnswer = isRequester || isMentor || isOwner || (isMember && qualifiesForClaim)

      // Question help shows the question the asker picked, numbered as students see it.
      let questionNumber = null
      let questionPrompt = null
      if (request.questionId && challenge?.questions) {
        const ordered = orderedQuestions(challenge)
        const index = ordered.findIndex((block) => String(block._id) === String(request.questionId))
        if (index !== -1) {
          questionNumber = index + 1
          questionPrompt = ordered[index].prompt ?? ""
        }
      }

      // 3. Clean DTO construction
      return {
        id: String(request._id),
        status: request.status,
        kind: request.kind ?? "question",
        hintType: request.hintType,
        challengeId: challenge?._id ? String(challenge._id) : null,
        challengeTitle: challenge?.title,
        questionId: request.questionId ? String(request.questionId) : null,
        questionNumber,
        questionPrompt,
        challengeCode: request.kind === "general" ? undefined : challenge?.codeSnippet || undefined,
        askerAnswer: canSeeAnswer ? request.askerAnswer : undefined,
        codeSnippet: request.codeSnippet,
        expectedBehaviour: request.expectedBehaviour,
        actualBehaviour: request.actualBehaviour,
        attemptedReasoning: request.attemptedReasoning,
        suspectedCause: request.suspectedCause,
        requesterId,
        requesterName: requester?.displayName,
        mentorId,
        mentorResponse: canSeeResponse ? request.mentorResponse : undefined,
        helpful: request.helpful,
        reopenCount: request.reopenCount,
        createdAt: request.createdAt,
        canClaim,
      }
    })

    return res.status(200).json({ data: queue })

  } catch (error) {
    console.error(error);
    return sendError(res, 500, "INTERNAL_ERROR", "Could not load the help queue.")
  }
}



// One winner: the claim is a conditional update on status "open" (D-7).
export async function claimHelpRequest(req, res) {
  try {
    const user = req.prototypeUser;
    if (!user) {
      return sendError(res, 401, "UNAUTHENTICATED", "Log in to claim a request.")
    }
    // mentoring is done by students 
    if (user.role !== "student") {
      return sendError(res, 403, "FORBIDDEN", "Only students can mentor help requests.")
    }

    const requestId = req.params.id;
    if (!mongoose.isValidObjectId(requestId)) {
      return sendError(res, 400, "VALIDATION_FAILED",
        "That help request link does not look right.", { field: "id" })
    }

    const helpRequest = await HelpRequest.findById(requestId);
    if (!helpRequest) {
      return sendError(res, 404, "HELP_REQUEST_NOT_FOUND", "We couldn't find that help request.");
    }

    //mentor must be part of the request's classroom 
    const membership = await Membership.findOne({
      classroomId: helpRequest.classroomId,
      userId: user._id,
    })
    if (!membership) {
      return sendError(res, 403, "FORBIDDEN",
        "You need to be part of this classroom to help with its requests.")
    }

    //ensure mentor and requester are different 
    if (String(helpRequest.requesterId) === String(user._id)) {
      return sendError(res, 403, "FORBIDDEN", "You cannot claim your own help request.");
    }

    // Question help needs an approved diagnosis on its challenge; general class
    // help has no qualifying challenge, so any other classmate may claim it (H-14).
    const completedAttempt = !helpRequest.qualifyingChallengeId || await Attempt.findOne({
      studentId: user._id,
      challengeId: helpRequest.qualifyingChallengeId,
      reviewStatus: "approved",
      completedAt: { $ne: null },
    }).select("_id")

    if (!completedAttempt) {
      // Look up the title so the message can say which challenge they need.
      const needed = await Challenge.findById(helpRequest.qualifyingChallengeId).select("title")
      // Show challenge name needed
      let challengeName = "the required challenge"
      if (needed && needed.title) {
        challengeName = `"${needed.title}"`;
      }
      const message = `Complete ${challengeName} first to help with this request.`;
      return sendError(res, 403, "NOT_ELIGIBLE", message);
    }

    // update DB that the request has been claimed by a mentor 
    const claimed = await HelpRequest.findOneAndUpdate(
      {
        _id: helpRequest._id,
        // only an open request can be claimed
        status: "open",
        requesterId: { $ne: user._id },
      },
      { $set: { status: "claimed", claimedBy: user._id } },
      // return the updated document
      { new: true }
    )

    if (claimed) {
      return res.status(200).json({
        data: {
          id: String(claimed._id),
          status: claimed.status,
          mentorId: String(claimed.claimedBy),
        },
      })
    }

    const latest = await HelpRequest.findById(helpRequest._id)

    if (!latest) {
      return sendError(res, 404, "HELP_REQUEST_NOT_FOUND", "We couldn't find that help request.")
    }

    if (
      latest &&
      latest.status === "claimed" &&
      String(latest.claimedBy) === String(user._id)
    ) {
      return res.status(200).json({
        data: {
          id: String(latest._id),
          status: latest.status,
          mentorId: String(latest.claimedBy),
        },
      })
    }

    //otherwise inform the mentor that the request has been claimed. 
    return sendError(res, 409, "CLAIM_CONFLICT",
      "This request is no longer open.")

  } catch (error) {
    console.error("Failed to claim help request:", error);
    return sendError(res, 500, "INTERNAL_ERROR",
      "Could not claim the help request. Please try again.")
  }
}

export async function respondToHelpRequest(req, res) {
  try {
    const user = req.prototypeUser
    if (!user) {
      return sendError(res, 401, "UNAUTHENTICATED", "Log in to respond to a request.")
    }
    const requestId = req.params.id;
    if (!mongoose.isValidObjectId(requestId)) {
      return sendError(res, 400, "VALIDATION_FAILED",
        "That help request link does not look right.", { field: "id" })
    }
    const helpRequest = await HelpRequest.findById(requestId)
    if (!helpRequest) {
      return sendError(res, 404, "HELP_REQUEST_NOT_FOUND", "We couldn't find that help request.");
    }
    //only the mentor who claimed this requ
    if (!helpRequest.claimedBy || String(helpRequest.claimedBy) !== String(user._id)) {
      return sendError(res, 403, "FORBIDDEN",
        "Only the mentor who claimed this request can respond to it.")
    }
    //refuse anything else that is not "claimed" (first hint) or "responded" (overwrite)
    if (!["claimed", "responded"].includes(helpRequest.status)) {
      return sendError(res, 409, "INVALID_STATE",
        "This request can no longer be responded to.");
    }
    //hint text 
    const response = cleanText(req.body?.response);
    if (!response) {
      return sendError(res, 400, "VALIDATION_FAILED",
        "Write a hint before sending.", { field: "response" })
    }
    // set limit since a hint should be short 
    if (response.length > 1000) {
      return sendError(res, 400, "VALIDATION_FAILED",
        "Keep your hint to 1000 characters or fewer.", { field: "response" })
    }

    const updated = await HelpRequest.findOneAndUpdate(
      {
        _id: helpRequest._id,
        claimedBy: user._id,
        status: { $in: ["claimed", "responded"] },
      },
      { $set: { mentorResponse: response, status: "responded" } },
      { new: true } // return the updated document
    )

    if (updated) {
      return res.status(200).json({
        data: {
          id: String(updated._id),
          status: updated.status,
          mentorResponse: updated.mentorResponse,
        },
      })
    }
    return sendError(res, 409, "INVALID_STATE",
      "This request can no longer be responded to.")

  } catch (error) {
    console.error("Failed to respond to help request:", error)
    return sendError(res, 500, "INTERNAL_ERROR",
      "Could not save your response. Please try again.")
  }
}

export async function resolveHelpRequest(req, res) {
  try {
    const user = req.prototypeUser;
    if (!user) {
      return sendError(res, 401, "UNAUTHENTICATED", "Log in to resolve a request.")
    }

    if (!req.body) {
      return sendError(res, 400, "VALIDATION_FAILED", "Fill in the form, then try again.")
    }

    const resolution = req.body.resolution
    if (resolution !== "helpful" && resolution !== "unresolved") {
      return sendError(res, 400, "VALIDATION_FAILED", 'Choose "helpful" or "unresolved".', {
        field: "resolution",
      })
    }

    const requestId = req.params.id
    if (!mongoose.isValidObjectId(requestId)) {
      return sendError(
        res,
        400,
        "VALIDATION_FAILED",
        "That help request link does not look right.",
        { field: "id" },
      );
    }
    const helpRequest = await HelpRequest.findById(requestId);
    if (!helpRequest) {
      return sendError(res, 404, "HELP_REQUEST_NOT_FOUND", "We couldn't find that help request.")
    }

    //only the student who asked can resolve it 
    if (String(helpRequest.requesterId) !== String(user._id)) {
      return sendError(res, 403, "FORBIDDEN", "Only the student who asked for help can resolve it.")
    }

    // pass all previous checks 
    if (
      resolution === "helpful" &&
      helpRequest.status === "resolved" &&
      helpRequest.helpful === true
    ) {
      return res.status(200).json({
        data: {
          id: String(helpRequest._id),
          status: helpRequest.status,
          helpful: helpRequest.helpful,
        },
      })
    }

    // Everything else must start from "responded"
    if (helpRequest.status !== "responded") {
      return sendError(res, 409, "INVALID_STATE",
        "This request can only be resolved after the mentor has responded.")
    }

    // Unresolved goes back to the queue with no points 
    if (resolution === "unresolved") {
      const reopened = await HelpRequest.findOneAndUpdate(
        { _id: helpRequest._id, requesterId: user._id, status: "responded" },
        {
          $set: { status: "open", helpful: null },
          $unset: { claimedBy: "", mentorResponse: "" },
          $inc: { reopenCount: 1 },
        },
        { new: true } // return the updated document
      )
      if (!reopened) {
        // Something changed between read and the update
        return sendError(res, 409, "INVALID_STATE", "This request has already changed. Please reload.")
      }
      return res.status(200).json({
        data: {
          id: String(reopened._id),
          status: reopened.status,
          helpful: reopened.helpful,
          reopenCount: reopened.reopenCount,
        },
      })
    }

    // points to be earned 
    const requestData = helpRequest.toObject()
    requestData.helpful = true;
    const points = calculateMentorAward(requestData)

    // only 1 helpful request can be matched 
    const resolved = await HelpRequest.findOneAndUpdate(
      {
        _id: helpRequest._id,
        requesterId: user._id,
        status: "responded",
        pointsAwarded: false,
      },
      { $set: { status: "resolved", helpful: true, pointsAwarded: true } },
      { new: true }
    )

    // if no match 
    if (!resolved) {
      const latest = await HelpRequest.findById(helpRequest._id);
      if (latest && latest.status === "resolved" && latest.helpful === true) {
        return res.status(200).json({
          data: {
            id: String(latest._id),
            status: latest.status,
            helpful: latest.helpful,
          },
        });
      }
      return sendError(res, 409, "INVALID_STATE", "This request has already changed. Please reload.")
    }

    // add points to winning mentor's total 
    try {
      const membership = await addContributionPoints(
        resolved.classroomId,
        resolved.claimedBy,
        points
      );
      if (!membership) {
        throw new Error("Mentor membership not found.")
      }
    } catch (pointsError) {
      await HelpRequest.updateOne(
        { _id: resolved._id },
        { $set: { status: "responded", helpful: null, pointsAwarded: false } }
      )
      throw pointsError // handled by the catch at the bottom (500)
    }

    return res.status(200).json({
      data: {
        id: String(resolved._id),
        status: resolved.status,
        helpful: resolved.helpful,
      },
    })

  } catch (error) {
    // calculateMentorAward throws HttpError 
    if (error instanceof HttpError) {
      return sendError(res, error.status, error.code, error.message)
    }
    console.error("Failed to resolve help request:", error)
    return sendError(res, 500, "INTERNAL_ERROR",
      "Could not resolve the request. Please try again.")
  }
}

// UX audit A2: the asker can take back a request nobody has picked up yet.
// The delete is conditional on "open", so a claim that lands first wins and
// the asker gets a 409 instead of pulling the request out from under a mentor.
export async function withdrawHelpRequest(req, res) {
  try {
    const user = req.prototypeUser
    if (!user) {
      return sendError(res, 401, "UNAUTHENTICATED", "Log in to withdraw a request.")
    }
    const requestId = req.params.id
    if (!mongoose.isValidObjectId(requestId)) {
      return sendError(res, 400, "VALIDATION_FAILED",
        "That help request link does not look right.", { field: "id" })
    }
    const helpRequest = await HelpRequest.findById(requestId)
    if (!helpRequest) {
      return sendError(res, 404, "HELP_REQUEST_NOT_FOUND", "We couldn't find that help request.")
    }
    if (String(helpRequest.requesterId) !== String(user._id)) {
      return sendError(res, 403, "FORBIDDEN", "Only the student who asked for help can withdraw it.")
    }

    const result = await HelpRequest.deleteOne({
      _id: helpRequest._id,
      requesterId: user._id,
      status: "open",
    })
    if (result.deletedCount === 0) {
      return sendError(res, 409, "INVALID_STATE",
        "A mentor has already picked up this request, so it can't be withdrawn.")
    }
    return res.status(200).json({ data: { id: String(helpRequest._id), withdrawn: true } })
  } catch (error) {
    console.error("Failed to withdraw help request:", error)
    return sendError(res, 500, "INTERNAL_ERROR",
      "Could not withdraw the request. Please try again.")
  }
}

// UX audit A3: a mentor who claimed by mistake can hand the request back
// before sending a hint. It returns to "open" for anyone to claim; reopenCount
// stays the same because the asker didn't reject anything.
export async function unclaimHelpRequest(req, res) {
  try {
    const user = req.prototypeUser
    if (!user) {
      return sendError(res, 401, "UNAUTHENTICATED", "Log in to give a request back.")
    }
    const requestId = req.params.id
    if (!mongoose.isValidObjectId(requestId)) {
      return sendError(res, 400, "VALIDATION_FAILED",
        "That help request link does not look right.", { field: "id" })
    }
    const helpRequest = await HelpRequest.findById(requestId)
    if (!helpRequest) {
      return sendError(res, 404, "HELP_REQUEST_NOT_FOUND", "We couldn't find that help request.")
    }
    if (!helpRequest.claimedBy || String(helpRequest.claimedBy) !== String(user._id)) {
      return sendError(res, 403, "FORBIDDEN",
        "Only the mentor who claimed this request can give it back.")
    }

    const reopened = await HelpRequest.findOneAndUpdate(
      { _id: helpRequest._id, claimedBy: user._id, status: "claimed" },
      { $set: { status: "open" }, $unset: { claimedBy: "" } },
      { new: true }
    )
    if (!reopened) {
      return sendError(res, 409, "INVALID_STATE",
        "You've already sent a hint, so this request can't be given back.")
    }
    return res.status(200).json({
      data: { id: String(reopened._id), status: reopened.status, mentorId: null },
    })
  } catch (error) {
    console.error("Failed to unclaim help request:", error)
    return sendError(res, 500, "INTERNAL_ERROR",
      "Could not give the request back. Please try again.")
  }
}
