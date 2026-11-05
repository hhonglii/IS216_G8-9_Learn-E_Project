/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — a stored answer as words
 *  Attempts keep option ids (option-2, line-3, s1). A mentor needs the text
 *  the student saw, so a help request keeps the asker's last wrong answer
 *  this way (UX audit item 17). An id the question no longer has is skipped.
 * ══════════════════════════════════════════════════════════════════
 */
export function answerText(question, value) {
  const labelOf = (id) =>
    (question?.options ?? []).find((option) => option.id === id)?.label?.trim() ?? "";
  if (question?.type === "locate-fault") {
    return [labelOf(value?.location), labelOf(value?.category)].filter(Boolean).join(", ");
  }
  if (question?.type === "repair-order") {
    if (!Array.isArray(value)) return "";
    return value
      .map(labelOf)
      .filter(Boolean)
      .map((label, index) => `${index + 1}. ${label}`)
      .join("\n");
  }
  return typeof value === "string" ? labelOf(value) : "";
}
