// Locate-fault blocks hold two option lists in one options array: line choices
// have ids starting "line-" and error-category choices "category-". The accepted
// answer is { location: lineId, category: categoryId }.
const LINE_PREFIX = "line-";
const CATEGORY_PREFIX = "category-";

export function optionGroup(id) {
  if (typeof id !== "string") return null;
  if (id.startsWith(LINE_PREFIX)) return "location";
  if (id.startsWith(CATEGORY_PREFIX)) return "category";
  return null;
}

// Blocks saved before 2026-11-04 had no options and a typed accepted answer.
// Read them as one option per list, so learners can still answer them and the
// professor only has to add the wrong choices.
export function upgradeLocateFault(question) {
  const options = Array.isArray(question.options) ? question.options : [];
  const answer = question.acceptedAnswer ?? {};
  if (options.length || (!answer.location && !answer.category)) {
    return {
      options: options.map(({ id, label }) => ({ id, label })),
      acceptedAnswer: {
        location: typeof answer.location === "string" ? answer.location : "",
        category: typeof answer.category === "string" ? answer.category : "",
      },
    };
  }
  const upgraded = { options: [], acceptedAnswer: { location: "", category: "" } };
  for (const [field, prefix] of [
    ["location", LINE_PREFIX],
    ["category", CATEGORY_PREFIX],
  ]) {
    if (typeof answer[field] === "string" && answer[field].trim()) {
      upgraded.options.push({ id: `${prefix}1`, label: answer[field].trim() });
      upgraded.acceptedAnswer[field] = `${prefix}1`;
    }
  }
  return upgraded;
}
