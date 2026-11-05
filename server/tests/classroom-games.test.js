// Classroom Games HTTP tests, with a mocked database: an in-memory store answers
// the Mongoose calls, while real documents still run their schema validation.
// The product browser test covers the same journey against a real MongoDB.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import Classroom from "../src/models/Classroom.js";
import ClassroomGame from "../src/models/ClassroomGame.js";
import GamePlay from "../src/models/GamePlay.js";
import Membership from "../src/models/Membership.js";
import User from "../src/models/User.js";
import {
  nextPlayState,
  summariseResults,
} from "../src/services/classroomGameService.js";
import { environment } from "../src/config/environment.js";

const { ObjectId } = mongoose.Types;
const ids = Object.fromEntries(
  ["prof", "otherProf", "student", "student2", "outsider", "classroom"].map(
    (key) => [key, new ObjectId()],
  ),
);
const users = {
  [ids.prof]: { _id: ids.prof, role: "professor" },
  [ids.otherProf]: { _id: ids.otherProf, role: "professor" },
  [ids.student]: { _id: ids.student, role: "student" },
  [ids.student2]: { _id: ids.student2, role: "student" },
  [ids.outsider]: { _id: ids.outsider, role: "student" },
};

const question = (n) => ({
  id: `q${n}`,
  code: n === 1 ? "print(1)" : "",
  prompt: `Question ${n}`,
  options: [
    { id: `q${n}-right`, label: `Right ${n}` },
    { id: `q${n}-wrong`, label: `Wrong ${n}` },
    { id: `q${n}-blank`, label: "" },
    { id: `q${n}-blank2`, label: "   " },
  ],
  correctOptionId: `q${n}-right`,
  explanation: `Because ${n}`,
});
const readyGame = (overrides = {}) => ({
  title: "Week 3",
  bossId: "memory-kraken",
  hearts: 2,
  questions: [question(1), question(2), question(3)],
  ...overrides,
});

let games;
let plays;

const same = (a, b) => String(a) === String(b);
const matches = (doc, filter) =>
  Object.entries(filter).every(([key, want]) =>
    want?.$ne !== undefined ? !same(doc[key], want.$ne) : same(doc[key], want),
  );

function fakeStore() {
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(async (id) => users[id] ?? null);
  vi.spyOn(Classroom, "findById").mockImplementation(async (id) =>
    same(id, ids.classroom) ? { _id: ids.classroom, professorId: ids.prof } : null,
  );
  vi.spyOn(Membership, "findOne").mockImplementation(async ({ userId }) =>
    same(userId, ids.student) || same(userId, ids.student2) ? { userId } : null,
  );
  // The class list for the results: both students, with their display names.
  vi.spyOn(Membership, "find").mockImplementation(() => ({
    populate: async () => [
      { userId: { _id: ids.student2, displayName: "Ben Ong" } },
      { userId: { _id: ids.student, displayName: "Ana Cruz" } },
    ],
  }));
  vi.spyOn(ClassroomGame, "findOne").mockImplementation(
    async (filter) => games.find((game) => matches(game, filter)) ?? null,
  );
  vi.spyOn(ClassroomGame, "findById").mockImplementation(
    async (id) => games.find((game) => same(game._id, id)) ?? null,
  );
  vi.spyOn(ClassroomGame.prototype, "save").mockImplementation(async function () {
    await this.validate();
    if (!games.includes(this)) games.push(this);
    return this;
  });
  vi.spyOn(GamePlay, "findOne").mockImplementation(
    async (filter) => plays.find((play) => matches(play, filter)) ?? null,
  );
  vi.spyOn(GamePlay, "findById").mockImplementation(
    async (id) => plays.find((play) => same(play._id, id)) ?? null,
  );
  vi.spyOn(GamePlay, "exists").mockImplementation(async (filter) =>
    plays.find((play) => matches(play, filter)) ? { _id: "x" } : null,
  );
  vi.spyOn(GamePlay, "create").mockImplementation(async (fields) => {
    const play = new GamePlay(fields);
    await play.validate();
    plays.push(play);
    return play;
  });
  vi.spyOn(GamePlay, "updateMany").mockImplementation(async (filter, update) => {
    plays.filter((play) => matches(play, filter)).forEach((play) => play.set(update.$set));
  });
  vi.spyOn(GamePlay, "find").mockImplementation((filter) => {
    const rows = plays.filter((play) => matches(play, filter));
    const query = { sort: () => query, select: () => Promise.resolve(rows) };
    return query;
  });
  vi.spyOn(GamePlay.prototype, "save").mockImplementation(async function () {
    await this.validate();
    return this;
  });
}

const app = createApp();
const as = (userId) => ({
  get: (path) => request(app).get(`/api${path}`).set(...sessionHeader(userId)),
  put: (path, body) =>
    request(app).put(`/api${path}`).set(...sessionHeader(userId)).send(body),
  post: (path, body = {}) =>
    request(app).post(`/api${path}`).set(...sessionHeader(userId)).send(body),
});
const gamePath = `/classrooms/${ids.classroom}/game`;

async function publishedGame(overrides) {
  await as(ids.prof).put(gamePath, readyGame(overrides)).expect(201);
  await as(ids.prof).post(`${gamePath}/publish`).expect(200);
}
async function startRun(userId = ids.student) {
  const response = await as(userId).post(`${gamePath}/plays`);
  return response.body.data.play;
}
const answer = (play, optionSuffix, userId = ids.student) =>
  as(userId).post(`/game-plays/${play.id}/answers`, {
    questionId: play.currentQuestion.id,
    optionId: `${play.currentQuestion.id}-${optionSuffix}`,
  });

beforeEach(() => {
  games = [];
  plays = [];
  fakeStore();
});
afterEach(() => vi.restoreAllMocks());

describe("who sees what", () => {
  it("gives the owning professor a null game to start editing, with no error", async () => {
    const { body } = await as(ids.prof).get(gamePath).expect(200);
    expect(body.data).toEqual({ viewer: "professor", game: null });
  });

  it("tells a member student no game exists, for no game and for a draft", async () => {
    const empty = { viewer: "student", game: null, play: null, defeated: false };
    const before = await as(ids.student).get(gamePath).expect(200);
    expect(before.body.data).toEqual(empty);
    await as(ids.prof).put(gamePath, readyGame()).expect(201);
    const during = await as(ids.student).get(gamePath).expect(200);
    expect(during.body.data).toEqual(empty);
  });

  it.each([
    ["a student outside the classroom", "outsider"],
    ["another professor", "otherProf"],
  ])("refuses %s", async (_label, who) => {
    await as(ids[who]).get(gamePath).expect(403);
  });

  it("refuses a caller who is not logged in", async () => {
    await request(app).get(`/api${gamePath}`).expect(401);
  });

  it("never sends a student the answers or explanations", async () => {
    await publishedGame();
    const read = await as(ids.student).get(gamePath).expect(200);
    const started = await as(ids.student).post(`${gamePath}/plays`).expect(201);
    for (const reply of [read, started]) {
      const text = JSON.stringify(reply.body);
      expect(text).not.toContain("correctOptionId");
      expect(text).not.toContain("Because");
    }
    expect(read.body.data.game).toEqual({
      id: expect.any(String),
      title: "Week 3",
      bossId: "memory-kraken",
      hearts: 2,
      questionCount: 3,
    });
  });

  it("does not offer blank answer rows to a student", async () => {
    await publishedGame();
    const play = await startRun();
    expect(play.currentQuestion.options.map((o) => o.label).sort()).toEqual([
      "Right 1",
      "Wrong 1",
    ]);
  });
});

describe("editing a draft", () => {
  it("stores an unfinished draft, so autosave never loses work", async () => {
    const { body } = await as(ids.prof)
      .put(gamePath, { title: "", questions: [{ id: "q1", options: [] }] })
      .expect(201);
    expect(body.data.status).toBe("draft");
    expect(body.data.questions).toHaveLength(1);
  });

  it("updates the same game on later saves and keeps fields not sent", async () => {
    await as(ids.prof).put(gamePath, readyGame()).expect(201);
    const { body } = await as(ids.prof).put(gamePath, { hearts: 5 }).expect(200);
    expect(body.data.hearts).toBe(5);
    expect(body.data.title).toBe("Week 3");
    expect(games).toHaveLength(1);
  });

  it.each([
    ["a monster not on the list", { bossId: "dragon" }, "bossId"],
    ["0 hearts", { hearts: 0 }, "hearts"],
    ["11 hearts", { hearts: 11 }, "hearts"],
    ["fractional hearts", { hearts: 1.5 }, "hearts"],
    ["a title that is too long", { title: "x".repeat(121) }, "title"],
    ["questions that are not a list", { questions: "nope" }, "questions"],
    [
      "a repeated question id",
      { questions: [question(1), question(1)] },
      "questions.1",
    ],
    [
      "a correct answer that is not an option",
      { questions: [{ ...question(1), correctOptionId: "other" }] },
      "questions.0.correctOptionId",
    ],
    [
      "too many answers",
      {
        questions: [
          {
            ...question(1),
            options: [1, 2, 3, 4, 5].map((n) => ({ id: `o${n}`, label: "x" })),
            correctOptionId: "o1",
          },
        ],
      },
      "questions.0.options",
    ],
  ])("rejects %s", async (_label, body, field) => {
    const reply = await as(ids.prof).put(gamePath, body).expect(400);
    expect(reply.body.error.details.map((d) => d.field)).toContain(field);
  });

  it("ignores attempts to set status, version or ownership in the body", async () => {
    const { body } = await as(ids.prof)
      .put(gamePath, { ...readyGame(), status: "published", version: 9 })
      .expect(201);
    expect(body.data.status).toBe("draft");
    expect(body.data.version).toBe(0);
  });

  it("only lets the owner save", async () => {
    await as(ids.student).put(gamePath, readyGame()).expect(403);
    await as(ids.otherProf).put(gamePath, readyGame()).expect(403);
    expect(games).toHaveLength(0);
  });
});

describe("publishing", () => {
  it.each([
    ["no title", { title: " " }, "title"],
    ["too few questions", { questions: [question(1)] }, "questions"],
    [
      "a missing correct answer",
      { questions: [question(1), question(2), { ...question(3), correctOptionId: "" }] },
      "questions.2.correctOptionId",
    ],
    [
      "a correct answer on a blank row",
      { questions: [question(1), question(2), { ...question(3), correctOptionId: "q3-blank" }] },
      "questions.2.correctOptionId",
    ],
    [
      "a missing explanation",
      { questions: [question(1), question(2), { ...question(3), explanation: "" }] },
      "questions.2.explanation",
    ],
    [
      "only one filled answer",
      {
        questions: [
          question(1),
          question(2),
          {
            ...question(3),
            options: [
              { id: "q3-right", label: "Only" },
              { id: "q3-wrong", label: "" },
            ],
          },
        ],
      },
      "questions.2.options",
    ],
    [
      "an unapproved generated question",
      { questions: [question(1), question(2), { ...question(3), needsReview: true }] },
      "questions.2.needsReview",
    ],
  ])("refuses a game with %s", async (_label, overrides, field) => {
    await as(ids.prof).put(gamePath, readyGame(overrides)).expect(201);
    const reply = await as(ids.prof).post(`${gamePath}/publish`).expect(400);
    expect(reply.body.error.details.map((d) => d.field)).toContain(field);
    expect(games[0].status).toBe("draft");
  });

  it("locks a published game until it is unpublished", async () => {
    await publishedGame();
    const locked = await as(ids.prof).put(gamePath, { title: "New" }).expect(409);
    expect(locked.body.error.code).toBe("GAME_PUBLISHED");
    await as(ids.prof).post(`${gamePath}/unpublish`).expect(200);
    await as(ids.prof).put(gamePath, { title: "New" }).expect(200);
  });

  it("counts a repeat publish once", async () => {
    await publishedGame();
    const { body } = await as(ids.prof).post(`${gamePath}/publish`).expect(200);
    expect(body.data.version).toBe(1);
  });

  it("ends battles in progress on unpublish, and the student then sees no game", async () => {
    await publishedGame();
    const play = await startRun();
    await as(ids.prof).post(`${gamePath}/unpublish`).expect(200);
    expect(plays[0].status).toBe("abandoned");
    const read = await as(ids.student).get(gamePath).expect(200);
    expect(read.body.data.game).toBeNull();
    const reply = await answer(play, "right");
    expect(reply.status).toBe(409);
  });

  it("only lets the owner publish, unpublish or read results", async () => {
    await as(ids.prof).put(gamePath, readyGame()).expect(201);
    for (const who of [ids.student, ids.otherProf]) {
      await as(who).post(`${gamePath}/publish`).expect(403);
      await as(who).post(`${gamePath}/unpublish`).expect(403);
      await as(who).get(`${gamePath}/results`).expect(403);
    }
  });
});

describe("playing", () => {
  it("defeats the boss once every question is correct", async () => {
    await publishedGame();
    let play = await startRun();
    expect(play).toMatchObject({ heartsLeft: 2, maxHearts: 2, remaining: 3 });
    for (const remaining of [2, 1, 0]) {
      const { body } = await answer(play, "right").expect(200);
      expect(body.data.correct).toBe(true);
      expect(body.data.explanation).toBe(`Because ${3 - remaining}`);
      expect(body.data.play.remaining).toBe(remaining);
      play = body.data.play;
    }
    expect(play.status).toBe("won");
    expect(play.currentQuestion).toBeNull();
    const read = await as(ids.student).get(gamePath);
    expect(read.body.data.defeated).toBe(true);
    expect(read.body.data.play).toBeNull();
  });

  it("takes a heart for a wrong answer and brings the question back last", async () => {
    await publishedGame();
    let play = await startRun();
    const { body } = await answer(play, "wrong").expect(200);
    // The question comes back, so its explanation would give the answer away.
    expect(body.data).toMatchObject({ correct: false, explanation: "" });
    play = body.data.play;
    expect(play.heartsLeft).toBe(1);
    expect(play.remaining).toBe(3);
    expect(play.currentQuestion.id).toBe("q2");
    expect(plays[0].questionQueue).toEqual(["q2", "q3", "q1"]);
  });

  it("only reveals the correct answer in the review once the run has ended", async () => {
    await publishedGame();
    let play = await startRun();
    const first = await answer(play, "wrong");
    expect(JSON.stringify(first.body.data.play)).not.toContain("Right 1");
    expect(first.body.data.play.missed).toEqual([]);
    play = first.body.data.play;
    const second = await answer(play, "wrong");
    expect(second.body.data.play.status).toBe("lost");
    expect(second.body.data.play.currentQuestion).toBeNull();
    expect(second.body.data.play.missed).toEqual([
      expect.objectContaining({ id: "q1", correctAnswer: "Right 1", explanation: "Because 1" }),
      expect.objectContaining({ id: "q2", correctAnswer: "Right 2", explanation: "Because 2" }),
    ]);
  });

  it("does not count a lost run as defeating the boss", async () => {
    await publishedGame({ hearts: 1 });
    const play = await startRun();
    await answer(play, "wrong").expect(200);
    const read = await as(ids.student).get(gamePath);
    expect(read.body.data.defeated).toBe(false);
  });

  it("resumes the run in progress rather than restoring hearts", async () => {
    await publishedGame();
    const play = await startRun();
    await answer(play, "wrong").expect(200);
    const resumed = await as(ids.student).post(`${gamePath}/plays`).expect(200);
    expect(resumed.body.data.play.id).toBe(play.id);
    expect(resumed.body.data.play.heartsLeft).toBe(1);
    const read = await as(ids.student).get(gamePath);
    expect(read.body.data.play.heartsLeft).toBe(1);
  });

  it("starts fresh hearts on a new run after losing", async () => {
    await publishedGame({ hearts: 1 });
    const play = await startRun();
    await answer(play, "wrong").expect(200);
    const again = await as(ids.student).post(`${gamePath}/plays`).expect(201);
    expect(again.body.data.play).toMatchObject({ heartsLeft: 1, remaining: 3 });
    expect(again.body.data.play.id).not.toBe(play.id);
  });

  it("charges nothing for a stale question, as from a double click or old tab", async () => {
    await publishedGame();
    const play = await startRun();
    await answer(play, "right").expect(200);
    const reply = await answer(play, "wrong");
    expect(reply.status).toBe(409);
    expect(reply.body.error.code).toBe("PLAY_CHANGED");
    expect(plays[0].heartsLeft).toBe(2);
  });

  it("charges nothing when an old tab resends the only question left", async () => {
    await publishedGame({ hearts: 3 });
    let play = await startRun();
    expect(play.answerCount).toBe(0);
    play = (await answer(play, "right").expect(200)).body.data.play;
    play = (await answer(play, "right").expect(200)).body.data.play;
    expect(play.answerCount).toBe(2);
    const send = () =>
      as(ids.student).post(`/game-plays/${play.id}/answers`, {
        questionId: "q3",
        optionId: "q3-wrong",
        answerCount: 2,
      });
    const first = await send().expect(200);
    expect(first.body.data.play.heartsLeft).toBe(2);
    expect(first.body.data.play.answerCount).toBe(3);
    // The missed question comes straight back, so it still looks current to the old tab.
    await send().expect(409);
    expect(plays[0].heartsLeft).toBe(2);
  });

  it("still accepts an answer that does not say how many came before", async () => {
    await publishedGame();
    const play = await startRun();
    await answer(play, "right").expect(200);
  });

  it("frees a run left behind when unpublishing failed halfway", async () => {
    await publishedGame();
    const stuck = await startRun();
    GamePlay.updateMany.mockRejectedValueOnce(new Error("database blip"));
    await as(ids.prof).post(`${gamePath}/unpublish`).expect(500);
    // Publishing again makes a new version that the old run can never answer.
    await as(ids.prof).post(`${gamePath}/publish`).expect(200);
    await answer(stuck, "right").expect(409);

    const page = await as(ids.student).get(gamePath).expect(200);
    expect(page.body.data.play).toBeNull();
    const fresh = await as(ids.student).post(`${gamePath}/plays`).expect(201);
    expect(fresh.body.data.play.id).not.toBe(stuck.id);
    await answer(fresh.body.data.play, "right").expect(200);
    expect(plays.find((play) => same(play._id, stuck.id)).status).toBe("abandoned");
  });

  it("finishes the job when the professor retries a failed unpublish", async () => {
    await publishedGame();
    await startRun();
    GamePlay.updateMany.mockRejectedValueOnce(new Error("database blip"));
    await as(ids.prof).post(`${gamePath}/unpublish`).expect(500);
    await as(ids.prof).post(`${gamePath}/unpublish`).expect(200);
    expect(plays[0].status).toBe("abandoned");
  });

  it("refuses an answer from a student removed from the classroom", async () => {
    await publishedGame();
    const play = await startRun();
    Membership.findOne.mockResolvedValueOnce(null);
    const reply = await answer(play, "right");
    expect(reply.status).toBe(409);
    expect(plays[0].answers).toHaveLength(0);
  });

  it("refuses more answers once a run is lost, even for the next question", async () => {
    await publishedGame({ hearts: 1 });
    const play = await startRun();
    await answer(play, "wrong").expect(200);
    expect(plays[0].status).toBe("lost");
    const reply = await as(ids.student).post(`/game-plays/${play.id}/answers`, {
      questionId: plays[0].questionQueue[0],
      optionId: `${plays[0].questionQueue[0]}-right`,
    });
    expect(reply.status).toBe(409);
    expect(plays[0].answers).toHaveLength(1);
  });

  it("does not treat a non-professor as the owner, even with a matching id", async () => {
    await publishedGame();
    users[ids.prof].role = "student";
    try {
      await as(ids.prof).get(gamePath).expect(403);
    } finally {
      users[ids.prof].role = "professor";
    }
  });

  it("starts class results fresh after publishing again", async () => {
    await publishedGame();
    const play = await startRun();
    await answer(play, "right").expect(200);
    const before = await as(ids.prof).get(`${gamePath}/results`).expect(200);
    expect(before.body.data.studentsPlayed).toBe(1);
    await as(ids.prof).post(`${gamePath}/unpublish`).expect(200);
    await as(ids.prof).post(`${gamePath}/publish`).expect(200);
    const after = await as(ids.prof).get(`${gamePath}/results`).expect(200);
    expect(after.body.data.studentsPlayed).toBe(0);
  });

  it("answers 409 rather than 500 when two saves collide", async () => {
    await publishedGame();
    const play = await startRun();
    GamePlay.prototype.save.mockRejectedValueOnce(
      new mongoose.Error.VersionError(plays[0], 0, []),
    );
    const reply = await answer(play, "wrong");
    expect(reply.status).toBe(409);
  });

  it.each([
    ["another question's answer", "q2-right"],
    ["a blank row", "q1-blank"],
    ["whitespace row", "q1-blank2"],
    ["nothing", undefined],
  ])("rejects %s without costing a heart", async (_label, optionId) => {
    await publishedGame();
    const play = await startRun();
    await as(ids.student)
      .post(`/game-plays/${play.id}/answers`, { questionId: "q1", optionId })
      .expect(400);
    expect(plays[0].heartsLeft).toBe(2);
    expect(plays[0].answers).toHaveLength(0);
  });

  it("does not let a student answer on someone else's run", async () => {
    await publishedGame();
    const play = await startRun(ids.student);
    const reply = await answer(play, "right", ids.student2);
    expect(reply.status).toBe(403);
  });

  it("only lets a student in the classroom start a run", async () => {
    await publishedGame();
    await as(ids.outsider).post(`${gamePath}/plays`).expect(403);
    await as(ids.prof).post(`${gamePath}/plays`).expect(403);
  });

  it("answers 404 when there is no published game to play", async () => {
    await as(ids.prof).put(gamePath, readyGame()).expect(201);
    await as(ids.student).post(`${gamePath}/plays`).expect(404);
  });

  it("rejects a malformed run id", async () => {
    await as(ids.student).post("/game-plays/not-an-id/answers", {}).expect(400);
  });
});

describe("the battle rules", () => {
  const state = { heartsLeft: 2, questionQueue: ["a", "b"] };
  it("removes a correct question", () => {
    expect(nextPlayState(state, true)).toEqual({
      heartsLeft: 2,
      questionQueue: ["b"],
      status: "in-progress",
    });
  });
  it("moves a wrong question to the end and takes a heart", () => {
    expect(nextPlayState(state, false)).toEqual({
      heartsLeft: 1,
      questionQueue: ["b", "a"],
      status: "in-progress",
    });
  });
  it("wins on the last correct answer", () => {
    expect(nextPlayState({ heartsLeft: 1, questionQueue: ["a"] }, true).status).toBe("won");
  });
  it("loses on the last heart", () => {
    expect(nextPlayState({ heartsLeft: 1, questionQueue: ["a"] }, false).status).toBe("lost");
  });
});

describe("class results", () => {
  const game = { version: 1, questions: [question(1), question(2)] };
  const run = (studentId, status, answers) => ({
    studentId,
    status,
    answers: answers.map(([questionId, optionId, correct]) => ({
      questionId,
      optionId,
      correct,
    })),
  });

  it("counts only each student's first answer to a question", () => {
    const results = summariseResults(game, [
      run("a", "lost", [["q1", "q1-wrong", false]]),
      run("a", "won", [
        ["q1", "q1-right", true],
        ["q2", "q2-right", true],
      ]),
      run("b", "in-progress", [["q1", "q1-right", true]]),
    ]);
    expect(results.studentsPlayed).toBe(2);
    expect(results.studentsDefeatedBoss).toBe(1);
    expect(results.questions[0]).toMatchObject({
      firstTryCorrect: 1,
      firstTryTotal: 2,
      topWrongAnswer: { label: "Wrong 1", count: 1 },
    });
    expect(results.questions[1]).toMatchObject({
      firstTryCorrect: 1,
      firstTryTotal: 1,
      topWrongAnswer: null,
    });
  });

  it("lists each student's attempts and best result, by name (G11)", () => {
    const results = summariseResults(
      game,
      [
        run("a", "lost", []),
        run("a", "won", []),
        run("b", "lost", []),
        run("b", "abandoned", []),
        run("c", "in-progress", []),
        run("c", "abandoned", []),
      ],
      [
        { id: "d", name: "Dee" },
        { id: "c", name: "Cal" },
        { id: "b", name: "Bea" },
        { id: "a", name: "Abe" },
      ],
    );
    expect(results.students).toEqual([
      { name: "Abe", attempts: 2, best: "won" },
      { name: "Bea", attempts: 1, best: "lost" },
      { name: "Cal", attempts: 1, best: "playing" },
      { name: "Dee", attempts: 0, best: "not-played" },
    ]);
  });

  it("names every student over HTTP but returns no student ids", async () => {
    await publishedGame();
    const play = await startRun();
    await answer(play, "wrong").expect(200);
    const { body } = await as(ids.prof).get(`${gamePath}/results`).expect(200);
    expect(body.data.studentsPlayed).toBe(1);
    expect(body.data.students).toEqual([
      { name: "Ana Cruz", attempts: 1, best: "playing" },
      { name: "Ben Ong", attempts: 0, best: "not-played" },
    ]);
    expect(JSON.stringify(body)).not.toContain(String(ids.student));
  });
});

describe("generating questions", () => {
  const good = {
    prompt: "What prints?",
    code: "print(1)",
    answers: ["1", "2"],
    correctIndex: 0,
    explanation: "It prints 1.",
  };
  function replyWith(questions) {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify({ questions }) }] },
          },
        ],
      }),
    });
  }
  const path = `${gamePath}/question-drafts`;
  let savedKey;
  let savedModel;
  beforeEach(() => {
    savedKey = environment.geminiApiKey;
    savedModel = environment.geminiModel;
    environment.geminiApiKey = "test-key";
    environment.geminiModel = "test-model";
  });
  afterEach(() => {
    environment.geminiApiKey = savedKey;
    environment.geminiModel = savedModel;
  });

  it("returns suggestions and saves nothing", async () => {
    replyWith([good]);
    const { body } = await as(ids.prof).post(path, { topic: "Loops" }).expect(200);
    expect(body.data.questions).toEqual([good]);
    expect(games).toHaveLength(0);
  });

  it("sends only what the professor typed", async () => {
    replyWith([good]);
    await as(ids.prof)
      .post(path, { topic: "Loops", language: "Python", code: "x", count: 1, secret: "no" })
      .expect(200);
    const sent = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(JSON.parse(sent.contents[0].parts[0].text)).toEqual({
      topic: "Loops",
      language: "Python",
      code: "x",
    });
  });

  it("answers 503 when generation is not set up", async () => {
    environment.geminiApiKey = "";
    const reply = await as(ids.prof).post(path, { topic: "Loops" }).expect(503);
    expect(reply.body.error.code).toBe("GAME_DRAFTS_UNAVAILABLE");
    // G12: the message gives the professor a way forward.
    expect(reply.body.error.message).toBe(
      "Question generation is not set up. You can still write the questions yourself.",
    );
  });

  it.each([
    ["a correct index out of range", { ...good, correctIndex: 5 }],
    ["one answer", { ...good, answers: ["1"] }],
    ["five answers", { ...good, answers: ["1", "2", "3", "4", "5"] }],
    ["no explanation", { ...good, explanation: "" }],
  ])("rejects a reply with %s", async (_label, bad) => {
    replyWith([bad]);
    const reply = await as(ids.prof).post(path, { topic: "Loops" }).expect(502);
    expect(reply.body.error.code).toBe("GAME_DRAFTS_FAILED");
  });

  it("needs a topic or code, and a sensible count", async () => {
    await as(ids.prof).post(path, {}).expect(400);
    await as(ids.prof).post(path, { topic: "Loops", count: 11 }).expect(400);
  });

  it("is only for the owning professor", async () => {
    await as(ids.student).post(path, { topic: "Loops" }).expect(403);
  });
});
