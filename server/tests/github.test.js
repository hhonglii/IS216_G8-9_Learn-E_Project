// Phase F service tests for fetchRepositorySnapshot.
// Covers F2 Step 7 and the guide's section 12 checkpoints with a fake fetch, so no
// real GitHub quota is used. The empty-repository test was added 2026-10-23,
// and the F7 contributors tests on 2026-10-24.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "../src/config/environment.js";
import { fetchRepositorySnapshot } from "../src/services/githubService.js";

// Nothing in the docs names these codes yet. Rename them here if you choose
// others; every test below reads them from this block.
const errors = {
  notFound: { status: 404, code: "GITHUB_REPOSITORY_NOT_FOUND" },
  private: { status: 400, code: "GITHUB_REPOSITORY_PRIVATE" },
  rateLimited: { status: 429, code: "GITHUB_RATE_LIMITED" },
  unavailable: { status: 502, code: "GITHUB_UNAVAILABLE" },
};

const repoUrl = "https://api.github.com/repos/octo/demo";
const token = "test-token-do-not-leak";

const repoBody = {
  name: "demo",
  description: "A demo repository",
  language: "JavaScript",
  default_branch: "main",
  updated_at: "2026-10-20T08:00:00Z",
  private: false,
  visibility: "public",
};

const commitBody = (n) => ({
  sha: `sha${n}`,
  html_url: `https://github.com/octo/demo/commit/sha${n}`,
  commit: {
    message: `Commit ${n}`,
    author: { name: `Author ${n}`, date: `2026-10-2${n}T08:00:00Z` },
  },
});

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const contributorBody = (login, contributions) => ({
  login,
  contributions,
  html_url: `https://github.com/${login}`,
  avatar_url: `https://avatars.example/${login}`,
  type: "User",
});

// Answers by address, so the order of requests does not matter. Contributors
// default to an empty list so the F2 tests need not mention them.
function fakeGitHub({
  repo = json(repoBody),
  commits = json([1, 2, 3, 4, 5].map(commitBody)),
  contributors = json([]),
} = {}) {
  const reply = (answer) => (typeof answer === "function" ? answer() : answer);
  return vi.fn(async (url) => {
    const address = String(url);
    if (address.startsWith(`${repoUrl}/commits`)) return reply(commits);
    if (address.startsWith(`${repoUrl}/contributors`)) return reply(contributors);
    if (address.startsWith(repoUrl)) return reply(repo);
    throw new Error(`Unexpected request to ${address}`);
  });
}

const headersOf = (call) => new Headers(call[1]?.headers);

describe("fetchRepositorySnapshot (F2)", () => {
  let savedToken;
  beforeEach(() => {
    // Your own server/.env may set GITHUB_TOKEN; tests choose it explicitly.
    savedToken = environment.githubToken;
    environment.githubToken = "";
  });
  afterEach(() => {
    environment.githubToken = savedToken;
    vi.unstubAllGlobals();
  });

  it("asks only the fixed GitHub API origin for the repository and five commits", async () => {
    const fetch = fakeGitHub();
    vi.stubGlobal("fetch", fetch);
    await fetchRepositorySnapshot("octo", "demo");
    const addresses = fetch.mock.calls.map(([url]) => new URL(String(url)));
    expect(addresses.every((url) => url.origin === "https://api.github.com")).toBe(true);
    expect(addresses.some((url) => url.pathname === "/repos/octo/demo")).toBe(true);
    const commits = addresses.find((url) => url.pathname === "/repos/octo/demo/commits");
    expect(commits?.searchParams.get("per_page")).toBe("5");
  });

  it("maps GitHub's fields to the F3 snapshot shape", async () => {
    vi.stubGlobal("fetch", fakeGitHub());
    const snapshot = await fetchRepositorySnapshot("octo", "demo");
    expect(snapshot.repository).toEqual({
      name: "demo",
      description: "A demo repository",
      language: "JavaScript",
      defaultBranch: "main",
      updatedAt: "2026-10-20T08:00:00Z",
    });
    expect(snapshot.commits).toHaveLength(5);
    expect(snapshot.commits[0]).toEqual({
      sha: "sha1",
      message: "Commit 1",
      author: "Author 1",
      date: "2026-10-21T08:00:00Z",
      url: "https://github.com/octo/demo/commit/sha1",
    });
  });

  it("returns the commits there are when a repository has fewer than five", async () => {
    vi.stubGlobal("fetch", fakeGitHub({ commits: json([commitBody(1), commitBody(2)]) }));
    const snapshot = await fetchRepositorySnapshot("octo", "demo");
    expect(snapshot.commits.map((commit) => commit.sha)).toEqual(["sha1", "sha2"]);
  });

  it("returns no commits for an empty repository instead of failing", async () => {
    // GitHub answers the commits request for a repository with no commits with
    // 409 "Git Repository is empty", not an empty list (F2 Step 6).
    vi.stubGlobal(
      "fetch",
      fakeGitHub({ commits: json({ message: "Git Repository is empty." }, 409) }),
    );
    const snapshot = await fetchRepositorySnapshot("octo", "demo");
    expect(snapshot.repository.name).toBe("demo");
    expect(snapshot.commits).toEqual([]);
  });

  it("treats a missing description, language or commit author as normal", async () => {
    // A missing description, language or author comes back as null.
    const bare = { ...commitBody(1), commit: { message: "No author", author: null } };
    vi.stubGlobal(
      "fetch",
      fakeGitHub({
        repo: json({ ...repoBody, description: null, language: null }),
        commits: json([bare]),
      }),
    );
    const snapshot = await fetchRepositorySnapshot("octo", "demo");
    expect(snapshot.repository.description).toBeNull();
    expect(snapshot.repository.language).toBeNull();
    expect(snapshot.commits[0].author).toBeNull();
    expect(snapshot.commits[0].message).toBe("No author");
  });

  it("refuses a private repository even when the request succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      fakeGitHub({ repo: json({ ...repoBody, private: true, visibility: "private" }) }),
    );
    await expect(fetchRepositorySnapshot("octo", "demo")).rejects.toMatchObject(errors.private);
  });

  it("names a missing repository", async () => {
    vi.stubGlobal("fetch", fakeGitHub({ repo: json({ message: "Not Found" }, 404) }));
    await expect(fetchRepositorySnapshot("octo", "demo")).rejects.toMatchObject(errors.notFound);
  });

  it.each([
    ["403", () => json({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0" })],
    ["429", () => json({ message: "Too many requests" }, 429, { "retry-after": "60" })],
  ])("names a rate limit (%s) and says to try again later", async (_label, reply) => {
    vi.stubGlobal("fetch", fakeGitHub({ repo: reply }));
    const error = await fetchRepositorySnapshot("octo", "demo").catch((caught) => caught);
    expect(error).toMatchObject(errors.rateLimited);
    expect(error.message).toMatch(/try again later/i);
    // Nothing copied from GitHub's headers or body.
    expect(JSON.stringify({ message: error.message, details: error.details })).not.toMatch(
      /x-ratelimit|retry-after|API rate limit exceeded/i,
    );
  });

  it("names a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(fetchRepositorySnapshot("octo", "demo")).rejects.toMatchObject(errors.unavailable);
  });

  it("fails as a whole when the repository loads but the commits request fails", async () => {
    // The guide's "metadata success with commit-fetch failure" checkpoint: no
    // half snapshot of fresh metadata beside missing commits.
    vi.stubGlobal("fetch", fakeGitHub({ commits: json({ message: "Server Error" }, 500) }));
    await expect(fetchRepositorySnapshot("octo", "demo")).rejects.toMatchObject(errors.unavailable);
  });

  it("sends no Authorization header when no token is configured", async () => {
    const fetch = fakeGitHub();
    vi.stubGlobal("fetch", fetch);
    await fetchRepositorySnapshot("octo", "demo");
    for (const call of fetch.mock.calls) expect(headersOf(call).has("authorization")).toBe(false);
  });

  it("sends the configured token to GitHub and nowhere else", async () => {
    environment.githubToken = token;
    const fetch = fakeGitHub();
    vi.stubGlobal("fetch", fetch);
    const snapshot = await fetchRepositorySnapshot("octo", "demo");
    for (const call of fetch.mock.calls) {
      expect(headersOf(call).get("authorization")).toMatch(new RegExp(`^(Bearer|token) ${token}$`));
    }
    expect(JSON.stringify(snapshot)).not.toContain(token);
  });

  it("never puts the token in an error", async () => {
    environment.githubToken = token;
    vi.stubGlobal("fetch", fakeGitHub({ repo: json({ message: "Not Found" }, 404) }));
    const error = await fetchRepositorySnapshot("octo", "demo").catch((caught) => caught);
    expect(`${error.message} ${JSON.stringify(error.details)} ${error.stack}`).not.toContain(token);
  });

  it.each([
    ["../evil", "demo"],
    ["octo", "demo/../../users"],
    ["", "demo"],
  ])("rechecks owner %j and repository %j before any request", async (owner, repo) => {
    const fetch = fakeGitHub();
    vi.stubGlobal("fetch", fetch);
    await expect(fetchRepositorySnapshot(owner, repo)).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("fetchRepositorySnapshot contributors (F7)", () => {
  let savedToken;
  beforeEach(() => {
    savedToken = environment.githubToken;
    environment.githubToken = "";
  });
  afterEach(() => {
    environment.githubToken = savedToken;
    vi.unstubAllGlobals();
  });

  it("asks for the top 10 contributors without anonymous ones", async () => {
    const fetch = fakeGitHub();
    vi.stubGlobal("fetch", fetch);
    await fetchRepositorySnapshot("octo", "demo");
    const contributors = fetch.mock.calls
      .map(([url]) => new URL(String(url)))
      .find((url) => url.pathname === "/repos/octo/demo/contributors");
    expect(contributors?.origin).toBe("https://api.github.com");
    expect(contributors?.searchParams.get("per_page")).toBe("10");
    expect(contributors?.searchParams.has("anon")).toBe(false);
  });

  it("maps each contributor to login, commits and url, in GitHub's order", async () => {
    vi.stubGlobal(
      "fetch",
      fakeGitHub({ contributors: json([contributorBody("alice", 12), contributorBody("bob", 3)]) }),
    );
    const snapshot = await fetchRepositorySnapshot("octo", "demo");
    expect(snapshot.contributors).toEqual([
      { login: "alice", commits: 12, url: "https://github.com/alice" },
      { login: "bob", commits: 3, url: "https://github.com/bob" },
    ]);
  });

  it("returns no contributors for an empty repository's 204 instead of failing", async () => {
    // GitHub answers an empty repository's contributors with 204 and no body.
    vi.stubGlobal(
      "fetch",
      fakeGitHub({
        commits: json({ message: "Git Repository is empty." }, 409),
        contributors: () => new Response(null, { status: 204 }),
      }),
    );
    const snapshot = await fetchRepositorySnapshot("octo", "demo");
    expect(snapshot.commits).toEqual([]);
    expect(snapshot.contributors).toEqual([]);
  });

  it.each([
    ["404", 404, errors.notFound],
    ["403 rate limit", 403, errors.rateLimited],
    ["429", 429, errors.rateLimited],
    ["500", 500, errors.unavailable],
  ])(
    "fails the whole snapshot when only the contributors request fails (%s)",
    async (_label, status, expected) => {
      vi.stubGlobal("fetch", fakeGitHub({ contributors: json({ message: "Nope" }, status) }));
      await expect(fetchRepositorySnapshot("octo", "demo")).rejects.toMatchObject(expected);
    },
  );

  it("names a network failure on the contributors request", async () => {
    vi.stubGlobal(
      "fetch",
      fakeGitHub({
        contributors: () => {
          throw new TypeError("fetch failed");
        },
      }),
    );
    await expect(fetchRepositorySnapshot("octo", "demo")).rejects.toMatchObject(errors.unavailable);
  });
});
