// Test cases for the H8 follow-up.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";

// Since G16 a 401 means nobody is logged in, so every message says to log in
// and none asks the caller to select or choose an account, as the old user
// switcher did. No session header is sent, so each handler answers before
// reading any record.
const id = String(new mongoose.Types.ObjectId());
const routes = [
  ["post", "/api/classrooms/:id/challenges", "Log in to create a challenge."],
  ["post", "/api/classrooms/:id/challenge-content-drafts", "Log in to generate challenge content."],
  ["put", "/api/challenges/:id", "Log in to change a challenge."],
  ["post", "/api/challenges/:id/publish", "Log in to change a challenge."],
  ["post", "/api/challenges/:id/hint-drafts", "Log in to change a challenge."],
  ["get", "/api/challenges/:id", "Log in to read a challenge."],
  ["put", "/api/attempts/:id/review", "Log in to review an attempt."],
  ["post", "/api/help-requests", "Log in to ask for help."],
  ["get", "/api/classrooms/:id/help-requests", "Log in to see the help queue."],
  ["put", "/api/help-requests/:id/claim", "Log in to claim a request."],
  ["put", "/api/help-requests/:id/respond", "Log in to respond to a request."],
  ["put", "/api/help-requests/:id/resolve", "Log in to resolve a request."],
  ["get", "/api/classrooms/:id/leaderboard", "Log in to see the leaderboard."],
  ["get", "/api/classrooms/:id/insights", "Log in to see classroom insights."],
];

beforeEach(() => {
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
});
afterEach(() => vi.restoreAllMocks());

describe("401 messages for a logged-out caller", () => {
  it.each(routes)("%s %s says: %s", async (method, path, message) => {
    const response = await request(createApp())[method](path.replace(":id", id)).send({});
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(response.body.error.message).toBe(message);
    expect(response.body.error.message).not.toMatch(/select|choose/i);
  });
});
