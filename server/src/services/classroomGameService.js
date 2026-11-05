/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — Boss Battle rules
 *  Pure functions with no database access, so the rules are easy to test.
 *  A correct answer removes the question. A wrong answer costs a heart and
 *  sends the question to the end, so the boss only falls once every question
 *  has been answered correctly.
 * ══════════════════════════════════════════════════════════════════
 */
export function nextPlayState({ heartsLeft, questionQueue }, correct) {
  const [current, ...rest] = questionQueue;
  const queue = correct ? rest : [...rest, current];
  const hearts = correct ? heartsLeft : heartsLeft - 1;
  let status = "in-progress";
  if (hearts <= 0) status = "lost";
  else if (queue.length === 0) status = "won";
  return { heartsLeft: Math.max(hearts, 0), questionQueue: queue, status };
}

// A student's first ever answer to each question shows what the class understood
// before any retry. plays must be oldest first. students is the class list as
// [{ id, name }], so someone who never played still gets a row (G11).
export function summariseResults(game, plays, students = []) {
  const stats = new Map(
    game.questions.map((question) => [
      question.id,
      { firstTryCorrect: 0, firstTryTotal: 0, wrong: new Map() },
    ]),
  );
  const seen = new Set();
  const played = new Set();
  const winners = new Set();
  for (const play of plays) {
    const studentId = String(play.studentId);
    played.add(studentId);
    if (play.status === "won") winners.add(studentId);
    for (const answer of play.answers) {
      const key = `${studentId}:${answer.questionId}`;
      const entry = stats.get(answer.questionId);
      if (!entry || seen.has(key)) continue;
      seen.add(key);
      entry.firstTryTotal += 1;
      if (answer.correct) entry.firstTryCorrect += 1;
      else entry.wrong.set(answer.optionId, (entry.wrong.get(answer.optionId) ?? 0) + 1);
    }
  }
  return {
    version: game.version,
    studentsPlayed: played.size,
    studentsDefeatedBoss: winners.size,
    students: studentRows(plays, students),
    questions: game.questions.map((question) => {
      const entry = stats.get(question.id);
      const [topId, topCount] = [...entry.wrong].sort((a, b) => b[1] - a[1])[0] ?? [];
      return {
        id: question.id,
        prompt: question.prompt,
        firstTryCorrect: entry.firstTryCorrect,
        firstTryTotal: entry.firstTryTotal,
        topWrongAnswer: topId
          ? {
              label: question.options.find((option) => option.id === topId)?.label ?? "",
              count: topCount,
            }
          : null,
      };
    }),
  };
}

// Best result first: a win beats a loss, and a loss beats a run still going.
// An abandoned run (the battle was unpublished mid-play) isn't an attempt.
const resultOrder = ["won", "lost", "in-progress"];
const bestNames = { won: "won", lost: "lost", "in-progress": "playing" };

function studentRows(plays, students) {
  return students
    .map(({ id, name }) => {
      const mine = plays.filter(
        (play) => String(play.studentId) === String(id) && play.status !== "abandoned",
      );
      const best = resultOrder.find((status) => mine.some((play) => play.status === status));
      return { name, attempts: mine.length, best: best ? bestNames[best] : "not-played" };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
