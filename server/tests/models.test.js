import { afterEach, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import Classroom from "../src/models/Classroom.js";
import Membership from "../src/models/Membership.js";
import Challenge from "../src/models/Challenge.js";
import Attempt from "../src/models/Attempt.js";
import HelpRequest from "../src/models/HelpRequest.js";
import MiniProject from "../src/models/MiniProject.js";
import ProjectGroup from "../src/models/ProjectGroup.js";
import ClassroomGame from "../src/models/ClassroomGame.js";
import GamePlay from "../src/models/GamePlay.js";
const cases = [
  [ClassroomGame, "ClassroomGame", "classroomId title bossId hearts questions status version createdBy"],
  [GamePlay, "GamePlay", "gameId gameVersion studentId maxHearts heartsLeft questionQueue answers status completedAt"],
  [User, "User", "displayName role"],
  [Classroom, "Classroom", "name description professorId joinCode"],
  [Membership, "Membership", "classroomId userId contributionPoints"],
  [
    Challenge,
    "Challenge",
    "classroomId title language objective prompt codeSnippet questions appliedCase progressiveHints explanation status createdBy",
  ],
  [
    Attempt,
    "Attempt",
    "challengeId studentId answers structuredScore appliedDiagnosis reviewStatus professorFeedback completedAt",
  ],
  [
    HelpRequest,
    "HelpRequest",
    "classroomId challengeId projectGroupId qualifyingChallengeId requesterId expectedBehaviour actualBehaviour attemptedReasoning suspectedCause hintType claimedBy mentorResponse status helpful pointsAwarded reopenCount",
  ],
  [
    MiniProject,
    "MiniProject",
    "classroomId title brief starterRepoUrl maxGroupSize stageInstructions acceptanceCriteria rubric status qualifyingChallengeId createdBy",
  ],
  [
    ProjectGroup,
    "ProjectGroup",
    "miniProjectId name memberIds tasks stageEvidence repositoryUrl githubCache reflection submissionStatus professorFeedback",
  ],
];
afterEach(() => vi.restoreAllMocks());
it.each(cases)(
  "compiles model %# with its data fields and timestamps",
  (model, name, fields) => {
    expect(model.modelName).toBe(name);
    for (const path of (fields + " createdAt updatedAt").split(" "))
      expect(model.schema.path(path), path).toBeDefined();
  },
);
it("reuses registered models across module reloads", async () => {
  vi.resetModules();
  for (const [model, name] of cases)
    expect((await import(`../src/models/${name}.js`)).default).toBe(model);
});
it("defines unique indexes for memberships, attempts and project group membership", () => {  expect(Classroom.schema.indexes()).toContainEqual([
    { joinCode: 1 },
    expect.objectContaining({ unique: true }),
  ]);
  expect(Membership.schema.indexes()).toContainEqual([
    { classroomId: 1, userId: 1 },
    expect.objectContaining({ unique: true }),
  ]);
  expect(Attempt.schema.indexes()).toContainEqual([
    { challengeId: 1, studentId: 1 },
    expect.objectContaining({ unique: true }),
  ]);
  expect(ProjectGroup.schema.indexes()).toContainEqual([
  { miniProjectId: 1, memberIds: 1 },
  expect.objectContaining({ unique: true }),
]);
});
it("validates role, state and embedded question/task enums", async () => {
  await expect(
    new User({ displayName: "Demo", role: "admin" }).validate(),
  ).rejects.toMatchObject({ errors: { role: expect.anything() } });
  await expect(
    new Challenge({
      status: "invalid",
      questions: [{ type: "arbitrary-code" }],
    }).validate(),
  ).rejects.toMatchObject({
    errors: { "questions.0.type": expect.anything() },
  });
  // Decision B-4: the applied case lives in appliedCase, not in questions[].
  await expect(
    new Challenge({ questions: [{ type: "applied-case" }] }).validate(),
  ).rejects.toMatchObject({
    errors: { "questions.0.type": expect.anything() },
  });
  await expect(
    new ProjectGroup({
      tasks: [{ title: "Task", status: "invalid" }],
    }).validate(),
  ).rejects.toMatchObject({ errors: { "tasks.0.status": expect.anything() } });
});
it("uses ObjectId references and embedded documents", () => {
  expect(Classroom.schema.path("professorId").instance).toBe("ObjectId");
  expect(MiniProject.schema.path("qualifyingChallengeId").instance).toBe(
    "ObjectId",
  );
  expect(
    ProjectGroup.schema.path("memberIds").caster?.instance ||
      ProjectGroup.schema.path("memberIds").embeddedSchemaType.instance,
  ).toBe("ObjectId");
  expect(
    Challenge.schema.path("questions").schema.path("acceptedAnswer"),
  ).toBeDefined();
  expect(
    ProjectGroup.schema.path("tasks").schema.path("ownerId").instance,
  ).toBe("ObjectId");
});
it("starts reopenCount at 0 and rejects a negative count (decision G-8)", async () => {
  expect(new HelpRequest().reopenCount).toBe(0);
  await expect(new HelpRequest({ reopenCount: -1 }).validate()).rejects.toMatchObject(
    { errors: { reopenCount: expect.anything() } },
  );
});
it("needs a challenge for question help but not for general class help (decision H-14)", async () => {
  const base = {
    classroomId: new mongoose.Types.ObjectId(),
    requesterId: new mongoose.Types.ObjectId(),
    hintType: "Guiding question",
  };
  expect(new HelpRequest(base).kind).toBe("question");
  await expect(new HelpRequest(base).validate()).rejects.toMatchObject({
    errors: { challengeId: expect.anything() },
  });
  await expect(new HelpRequest({ ...base, kind: "general" }).validate()).resolves.toBeUndefined();
  await expect(new HelpRequest({ ...base, kind: "other" }).validate()).rejects.toMatchObject({
    errors: { kind: expect.anything() },
  });
});
