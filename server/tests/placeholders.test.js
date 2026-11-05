import { afterEach, beforeEach, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
const phaseERoutes = [
  ["post", "/api/classrooms/example/mini-projects"],
  ["get", "/api/mini-projects/example"],
  ["post", "/api/mini-projects/example/groups"],
  ["put", "/api/groups/example/join"],
  ["put", "/api/groups/example/tasks"],
  ["put", "/api/groups/example/stages"],
];
// Submit and review, built in Phase G (G1, G2).
const phaseGRoutes = [
  ["put", "/api/groups/example/submit"],
  ["put", "/api/groups/example/review"],
];

beforeEach(() =>
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0),
);
afterEach(() => vi.restoreAllMocks());
it.each([...phaseERoutes, ...phaseGRoutes])(
  "%s %s refuses a malformed Authorization header",
  async (method, path) => {
    const response = await request(createApp())
      [method](path)
      .set("Authorization", "Basic malformed");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_SESSION");
  },
);
it("keeps health outside the session middleware", async () => {
  const response = await request(createApp())
    .get("/api/health")
    .set("Authorization", "Basic malformed");
  expect(response.status).toBe(200);
});
it("keeps unknown paths at 404", async () => {
  const response = await request(createApp()).get("/api/not-a-route");
  expect(response.status).toBe(404);
  expect(response.body.error.code).toBe("NOT_FOUND");
});

it.each([...phaseERoutes, ...phaseGRoutes])(
  "%s %s requires a logged-in user",
  async (method, path) => {
    const response = await request(createApp())[method](path);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  },
);
