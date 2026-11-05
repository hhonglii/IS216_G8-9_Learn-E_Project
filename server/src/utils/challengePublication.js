// B7 stored-content validation under B2a/B2b.
import { validateChallengeDraft } from "./challengeDraft.js";
import { optionGroup, upgradeLocateFault } from "./locateFault.js";

export function validateChallengePublication(challenge) {
  const content = challenge.toObject();
  // Check an old typed-answer locate-fault block as it now reads, so the
  // professor is told to add choices rather than about a stored format.
  if (Array.isArray(content.questions))
    content.questions = content.questions.map((block) =>
      block?.type === "locate-fault"
        ? { ...block, ...upgradeLocateFault(block) }
        : block,
    );
  const details = validateChallengeDraft(content);
  function problem(field, message) {
    if (!details.some((item) => item.field === field))
      details.push({ field, message });
  }
  function requiredText(value, field) {
    if (typeof value !== "string" || !value.trim())
      problem(field, "Non-empty text is required to publish.");
  }
  for (const field of [
    "title",
    "language",
    "objective",
    "prompt",
    "explanation",
  ])
    requiredText(content[field], field);
  requiredText(content.appliedCase?.prompt, "appliedCase.prompt");
  if (
    !Array.isArray(content.progressiveHints) ||
    content.progressiveHints.length < 2
  )
    problem(
      "progressiveHints",
      "At least two non-empty hints are required to publish.",
    );
  if (Array.isArray(content.progressiveHints))
    content.progressiveHints.forEach((hint, index) =>
      requiredText(hint, `progressiveHints.${index}`),
    );
  if (!Array.isArray(content.questions) || !content.questions.length)
    problem(
      "questions",
      "At least one structured block is required to publish.",
    );
  const seen = new Set();
  if (Array.isArray(content.questions))
    content.questions.forEach((block, index) => {
      const path = `questions.${index}`;
      if (!block || typeof block !== "object" || Array.isArray(block)) return;
      requiredText(block.prompt, `${path}.prompt`);
      requiredText(block.explanation, `${path}.explanation`);
      if (!Number.isInteger(block.order) || block.order !== index)
        problem(
          `${path}.order`,
          "Stored block order must match its list position.",
        );
      const id = String(block._id ?? "");
      if (!/^[a-f0-9]{24}$/i.test(id) || seen.has(id))
        problem(`${path}.id`, "Stored block ids must be valid and distinct.");
      seen.add(id);
      if (
        ["predict-output", "repair-order"].includes(block.type) &&
        (!Array.isArray(block.options) || block.options.length < 2)
      )
        problem(
          `${path}.options`,
          "At least two valid choices or steps are required to publish.",
        );
      if (block.type === "predict-output") {
        requiredText(block.acceptedAnswer, `${path}.acceptedAnswer`);
      } else if (block.type === "locate-fault") {
        const groups = (Array.isArray(block.options) ? block.options : []).map(
          (option) => optionGroup(option?.id),
        );
        if (
          groups.filter((group) => group === "location").length < 2 ||
          groups.filter((group) => group === "category").length < 2
        )
          problem(
            `${path}.options`,
            "At least two line choices and two error categories are required to publish.",
          );
        requiredText(
          block.acceptedAnswer?.location,
          `${path}.acceptedAnswer.location`,
        );
        requiredText(
          block.acceptedAnswer?.category,
          `${path}.acceptedAnswer.category`,
        );
      } else if (block.type === "repair-order") {
        const ids = Array.isArray(block.options)
          ? block.options.map((option) => option?.id)
          : [];
        const answer = block.acceptedAnswer;
        if (
          !Array.isArray(answer) ||
          !answer.length ||
          answer.length !== ids.length ||
          ids.some((id) => !answer.includes(id))
        )
          problem(
            `${path}.acceptedAnswer`,
            "Correct repair order must include every step exactly once.",
          );
        // Students start from the steps as listed, so a list already in the
        // correct order would hand them the answer (third-pass audit B).
        else if (answer.every((id, position) => id === ids[position]))
          problem(
            `${path}.acceptedAnswer`,
            "Repair steps must be listed in a different order from the correct order.",
          );
      }
    });
  return details;
}
