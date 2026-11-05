// What each (i) button says (UX audit item 1, "InfoTip text"). Kept in one
// place so the same term reads the same on every page. Each entry is the
// field's name, used in the button's accessible name ("About Rubric"), and
// one to three plain sentences. Rules needed to succeed are visible hint text
// on the page, not here.
export const fieldHelp = {
  objective: {
    label: 'Learning objective',
    text: 'The one skill this challenge practises. Students see it under the title.',
  },
  prompt: {
    label: 'Challenge prompt',
    text: 'The problem as the student first meets it: what the code should do and what goes wrong.',
  },
  codeSnippet: {
    label: 'Code snippet',
    text: 'The buggy code. Students see it once at the top, with line numbers. Leave it blank for a challenge without code.',
  },
  explanation: {
    label: 'Official explanation',
    text: 'The full answer, shown to students after they finish.',
  },
  blockPrompt: { label: 'Question prompt', text: 'What this question asks the student.' },
  blockExplanation: {
    label: 'Question explanation',
    text: 'Why the right answer is right. Students see it after they answer correctly.',
  },
  lineChoices: {
    label: 'Line choices',
    text: 'The lines students choose between when they look for the bug, such as "Line 3: for (let i = 0; i <= n; i++)". Include the faulty line and a few believable wrong ones, like the lines just above and below it.',
  },
  errorCategories: {
    label: 'Error categories',
    text: 'The kind of mistake behind the bug, which students pick after the line. For example: off-by-one (a loop runs once too often or too few times), wrong operator (< for <=, = for ==), wrong variable, missing return, or a type mix-up ("5" + 1 gives "51"). Give the right one and two or three believable wrong ones.',
  },
  appliedCase: {
    label: 'Applied-case prompt',
    text: 'A new situation with the same bug. Students explain it in their own words and you review it; approval lets them mentor others.',
  },
  progressiveHints: {
    label: 'Progressive hints',
    text: 'Hints from gentle to specific. Students see one more each time they answer wrongly.',
  },
  brief: {
    label: 'Project brief',
    text: 'The problem the group is solving, in a few sentences.',
  },
  stageInstructions: {
    label: 'Stage instructions',
    text: 'Groups work through the five stages in order. Each box tells them what to do and what to show at that stage.',
  },
  stageDiagnose: {
    label: 'Diagnose',
    text: 'Groups find out what is broken before changing anything: the symptoms, who they affect, the likely causes and the evidence. Write which failures to look into and what evidence to record, such as screenshots or console errors.',
  },
  stageRepair: {
    label: 'Repair',
    text: 'Groups fix what they diagnosed, each fix tied to an acceptance criterion. Write what must be fixed and any limits, such as "keep the existing layout".',
  },
  stageExtend: {
    label: 'Extend',
    text: 'Groups add one small feature that helps with the real problem. Name the feature and how far it should go, such as "add a confirmation summary after sign-up".',
  },
  stageVerify: {
    label: 'Verify',
    text: 'Groups prove the repair and the feature work, with tests or repeatable manual checks and their results. Write what to check, such as every acceptance criterion and the page at phone width.',
  },
  stageReflect: {
    label: 'Reflect',
    text: 'Groups explain what failed, why their repair works and how the ideas connect. Write the questions you want them to answer.',
  },
  acceptanceCriteria: {
    label: 'Acceptance criteria',
    text: 'Checkable statements that are true when the work is done. Groups use them to verify.',
  },
  rubric: { label: 'Rubric', text: 'How you will judge the submission.' },
  maxGroupSize: {
    label: 'Maximum group size',
    text: 'The most students one group can have.',
  },
  qualifyingChallenge: {
    label: 'Qualifying challenge',
    text: 'Students in a group can ask for help only from classmates who finished this challenge.',
  },
  starterRepo: {
    label: 'Starter repository',
    text: 'A public GitHub repository groups start from.',
  },
  stageEvidence: {
    label: 'Stage evidence',
    text: 'What your group did at this stage: findings, changes, results.',
  },
  repoLink: {
    label: 'GitHub repository link',
    text: "Your group's public repository. Learn-E shows its latest commits and contributors.",
  },
  contributionPoints: {
    label: 'Contribution points',
    text: 'Earned when a classmate marks your hint helpful. Not part of your grade.',
  },
  // The Boss Battle editor on the Classroom games page.
  gameTitle: {
    label: 'Battle title',
    text: 'The name students see above the monster before they start. Name the topic, such as "Week 3: Loops", so students know what the questions cover.',
  },
  gameHearts: {
    label: 'Hearts',
    text: 'Each wrong answer costs one heart and sends that question to the end of the battle. When the hearts run out the boss wins, and the student can try again. Fewer hearts make a harder battle.',
  },
  gameMonster: {
    label: 'Monster',
    text: 'The boss students fight. It only changes how the battle looks and what it is called; the questions and scoring stay the same.',
  },
  gameCode: {
    label: 'Code',
    text: 'Code students read before they answer, shown above the question with its spacing kept. Use it for questions like "What does this print?", and leave it empty for questions without code.',
  },
  gameQuestion: {
    label: 'Question',
    text: 'What the student has to answer, in a sentence or two. It is the heading of the question card in the battle.',
  },
  gameAnswers: {
    label: 'Answers',
    text: 'Two to four choices, and exactly one is right. Students see them shuffled, so "the first one" is never the answer by habit. Make the wrong ones mistakes students really make, like 3 instead of 4 for a loop that runs i = 0 to 3.',
  },
  gameKeepOrder: {
    label: 'Keep this order',
    text: 'Shows the answers in the order you typed them instead of shuffled. Tick it when an answer points at the others, such as "All of the above" or "Both A and B".',
  },
  gameWhy: {
    label: 'Why?',
    text: 'Why the right answer is right. Students see it straight after a right answer. After a wrong one it stays hidden, because the question comes back, and shows in "What to review" at the end of the battle.',
  },
  generateTopic: {
    label: 'Topic',
    text: 'What the questions should test, such as "Python for loops" or "off-by-one errors". Give a topic, your code, or both.',
  },
  generateLanguage: {
    label: 'Language',
    text: 'The programming language for any code in the questions, such as Python or JavaScript. Leave it empty if the topic already says.',
  },
  generateCount: {
    label: 'How many',
    text: 'How many draft questions to make, up to 10 at a time and never more than the battle has room for.',
  },
  generateCode: {
    label: 'Your code',
    text: 'Code to build the questions around, such as an example from your lecture. The questions then ask about this code.',
  },
}
