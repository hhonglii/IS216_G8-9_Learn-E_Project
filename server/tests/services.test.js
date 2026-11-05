import { expect, it } from "vitest";
import {
  parsePublicGitHubRepositoryUrl,
} from "../src/services/githubService.js";
import {
  calculateMentorAward,
  milestonesForHelpfulCount,
  nextMilestoneForHelpfulCount,
  HELPFUL_POINTS,
} from "../src/services/pointsService.js";
it.each([
  ["https://github.com/OWNER/REPO", { owner: "OWNER", repo: "REPO" }],
  ["https://github.com/vuejs/core.git", { owner: "vuejs", repo: "core" }],
  [
    "https://github.com/demo-user/repo.name/",
    { owner: "demo-user", repo: "repo.name" },
  ],
])("parses a public repository URL %s", (url, expected) => {
  expect(parsePublicGitHubRepositoryUrl(url)).toEqual(expected);
});
it.each([
  "",
  "   ",
  null,
  42,
  "http://github.com/a/b",
  "https://example.com/a/b",
  "https://github.com",
  "https://github.com/a",
  "https://github.com/a/",
  "https://github.com/a/b/tree/main",
  "https://github.com/a/b?token=value",
  "https://github.com/a/b#readme",
  "https://user:password@github.com/a/b",
  "https://github.com.evil.test/a/b",
  "https://github.com:444/a/b",
  "https://github.com/a/../b",
  "https://github.com/a/%2e%2e",
  "https://github.com/a/.git",
  "https://github.com/a/..",
])("rejects unsupported repository input %j", (url) => {
  expect(() => parsePublicGitHubRepositoryUrl(url)).toThrow(
    expect.objectContaining({
      status: 400,
      code: "INVALID_GITHUB_REPOSITORY_URL",
    }),
  );
});
it.each([
  [0, []],
  [1, ["First Assist"]],
  [4, ["First Assist"]],
  [5, ["First Assist", "Helpful Five"]],
  [9, ["First Assist", "Helpful Five"]],
  [10, ["First Assist", "Helpful Five", "Challenge Guide"]],
  [11, ["First Assist", "Helpful Five", "Challenge Guide"]],
])("derives milestone thresholds for %i helpful hints", (count, expected) => {
  expect(milestonesForHelpfulCount(count)).toEqual(expected);
});
it.each([-1, 1.5, NaN, Infinity, "5", null])(
  "rejects invalid helpful count %j",
  (count) => {
    expect(() => milestonesForHelpfulCount(count)).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  },
);
// G13 cases.
it.each([
  [0, { label: "First Assist", threshold: 1 }],
  [1, { label: "Helpful Five", threshold: 5 }],
  [4, { label: "Helpful Five", threshold: 5 }],
  [5, { label: "Challenge Guide", threshold: 10 }],
  [9, { label: "Challenge Guide", threshold: 10 }],
  [10, null],
  [11, null],
])("gives %i helpful hints the next milestone %j", (count, expected) => {
  expect(nextMilestoneForHelpfulCount(count)).toEqual(expected);
});
it.each([0, 1, 4, 5, 9, 10, 11])(
  "never names a milestone already earned at %i helpful hints",
  (count) => {
    const next = nextMilestoneForHelpfulCount(count);
    if (next) {
      expect(milestonesForHelpfulCount(count)).not.toContain(next.label);
      expect(milestonesForHelpfulCount(next.threshold)).toContain(next.label);
    }
  },
);
it.each([-1, 1.5, NaN, Infinity, "5", null])(
  "rejects invalid helpful count %j for the next milestone",
  (count) => {
    expect(() => nextMilestoneForHelpfulCount(count)).toThrow(
      expect.objectContaining({ status: 400, code: "INVALID_HELPFUL_COUNT" }),
    );
  },
);
it.each([null, undefined, [], "request", 1])(
  "validates point-award request input %j",
  (input) => {
    expect(() => calculateMentorAward(input)).toThrow(
      expect.objectContaining({ status: 400, code: "INVALID_HELP_REQUEST" }),
    );
  },
);



  it("rejects a request that has no claimed mentor", () => {
  expect(() =>
    calculateMentorAward({
      _id: "req1",
      requesterId: "student1",
      status: "responded",
      helpful: true,
      pointsAwarded: false,
    }),
  ).toThrow(
    expect.objectContaining({
      status: 409,
      code: "NO_MENTOR",
    }),
  );
});

it("awards five points for a helpful resolution", () => {
  const points = calculateMentorAward({
    _id: "req1",
    claimedBy: "mentor1",
    requesterId: "student1",
    status: "responded",
    helpful: true,
    pointsAwarded: false,
  });
  expect(points).toBe(HELPFUL_POINTS);
});

it.skip("awards five points once for a helpful non-self request", () => {
  // Activate in the mentoring product work package after atomic resolution and repeat-award guards are implemented.
});
