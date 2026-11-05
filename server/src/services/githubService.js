/* ══════════════════════════════════════════════════════════════════
 *  Learn-E — GitHub evidence service
 *  parsePublicGitHubRepositoryUrl checks a repository address.
 *  fetchRepositorySnapshot reads a public repository's details, latest
 *  commits and top contributors from GitHub.
 * ══════════════════════════════════════════════════════════════════
 */
import { HttpError } from "../utils/httpError.js";
import { environment } from "../config/environment.js";

export function parsePublicGitHubRepositoryUrl(url) {
  const match =
    typeof url === "string"
      ? /^https:\/\/github\.com\/([a-z0-9-]+)\/([a-z0-9_.-]+)\/?$/i.exec(
          url.trim(),
        )
      : null;
  const repo = match?.[2].replace(/\.git$/, "");
  if (!match || !repo || repo === "." || repo === "..") {
    throw new HttpError(
      400,
      "INVALID_GITHUB_REPOSITORY_URL",
      "Use an HTTPS github.com owner/repository URL without credentials, query parameters or extra paths.",
    );
  }
  return { owner: match[1], repo };
}

async function safeFetch(url, headers) {
  try {
    return await fetch(url, { headers });
  } catch (err) {
    throw new HttpError(
      502,
      "GITHUB_UNAVAILABLE",
      "We couldn't reach GitHub. Try again later.",
    );
  }
}

export async function fetchRepositorySnapshot(owner, repo) {
  const tryRepoUrl = `https://github.com/${owner}/${repo}`;
  parsePublicGitHubRepositoryUrl(tryRepoUrl);

  const headers = { Accept: "application/vnd.github+json" };
  if (environment.githubToken) {
    headers.Authorization = `Bearer ${environment.githubToken}`;
  }

  const repoUrl = `https://api.github.com/repos/${owner}/${repo}`;

  const gitRepoResponse = await safeFetch(repoUrl, headers);

  if (!gitRepoResponse.ok) {
    if (gitRepoResponse.status === 404) {
      throw new HttpError(
        404,
        "GITHUB_REPOSITORY_NOT_FOUND",
        "The entered Github Repository could not be found",
      );
    } else if (
      gitRepoResponse.status === 403 ||
      gitRepoResponse.status === 429
    ) {
      throw new HttpError(
        429,
        "GITHUB_RATE_LIMITED",
        "Github is busy, try again later",
      );
    } else {
      throw new HttpError(
        502,
        "GITHUB_UNAVAILABLE",
        "Github is unavailable, try again later",
      );
    }
  }
  const gitRepoResponseBody = await gitRepoResponse.json();

  if (gitRepoResponseBody.private) {
    throw new HttpError(
      400,
      "GITHUB_REPOSITORY_PRIVATE",
      "This repository is private. Attach a public repository.",
    );
  }

  const repoMap = {
    name: gitRepoResponseBody.name,
    description: gitRepoResponseBody.description,
    language: gitRepoResponseBody.language,
    defaultBranch: gitRepoResponseBody.default_branch,
    updatedAt: gitRepoResponseBody.updated_at,
  };

  const repoCommitsUrl = repoUrl + "/commits?per_page=5";
  const gitCommitsResponse = await safeFetch(repoCommitsUrl,headers);

  let commitsMap = [];

  if (!gitCommitsResponse.ok && gitCommitsResponse.status !== 409) {
    if (gitCommitsResponse.status === 404) {
      throw new HttpError(
        404,
        "GITHUB_REPOSITORY_NOT_FOUND",
        "The entered Github Repository could not be found",
      );
    } else if (
      gitCommitsResponse.status === 403 ||
      gitCommitsResponse.status === 429
    ) {
      throw new HttpError(
        429,
        "GITHUB_RATE_LIMITED",
        "Github is busy, try again later",
      );
    } else {
      throw new HttpError(
        502,
        "GITHUB_UNAVAILABLE",
        "Github is unavailable, try again later",
      );
    }
  }
  if (gitCommitsResponse.status !== 409) {
    const gitCommitsResponseBody = await gitCommitsResponse.json();
    commitsMap = gitCommitsResponseBody.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: commit.commit?.author?.name ?? null,
      date: commit.commit?.author?.date ?? null,
      url: commit.html_url,
    }));
  }
  
  const repoContributorsUrl = repoUrl + "/contributors?per_page=10";
  const gitContributorsResponse = await safeFetch(repoContributorsUrl, headers);

  let contributorsMap = [];

  if (!gitContributorsResponse.ok ) {
    if (gitContributorsResponse.status === 404) {
      throw new HttpError(
        404,
        "GITHUB_REPOSITORY_NOT_FOUND",
        "The entered Github Repository could not be found",
      );
    } else if (
      gitContributorsResponse.status === 403 ||
      gitContributorsResponse.status === 429
    ) {
      throw new HttpError(
        429,
        "GITHUB_RATE_LIMITED",
        "Github is busy, try again later",
      );
    } else {
      throw new HttpError(
        502,
        "GITHUB_UNAVAILABLE",
        "Github is unavailable, try again later",
      );
    }
  }
  if (gitContributorsResponse.status !== 204){
    const gitContributorsResponseBody = await gitContributorsResponse.json();
    contributorsMap = gitContributorsResponseBody.map((contributor) => ({
      login: contributor.login,
      commits: contributor.contributions,
      url: contributor.html_url,
    }));
  }
  return {
    repository: repoMap,
    commits: commitsMap,
    contributors: contributorsMap,
  };
}
