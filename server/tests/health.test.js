import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { environment } from "../src/config/environment.js";
import { connectDatabase, databaseStatus } from "../src/config/database.js";
import { HttpError } from "../src/utils/httpError.js";
import { asyncHandler } from "../src/utils/asyncHandler.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
const originalUri = environment.mongodbUri;
beforeEach(() => {
  environment.mongodbUri = "";
});
afterEach(() => {
  environment.mongodbUri = originalUri;
  vi.restoreAllMocks();
});
describe("runtime health", () => {
  it("reports service health without a database", async () => {
    const response = await request(createApp()).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        service: "learn-e-server",
        status: "ok",
        database: "not-configured",
      },
    });
    expect(["connected", "disconnected", "not-configured"]).toContain(
      response.body.data.database,
    );
  });
  it("returns structured 404 for unknown routes", async () => {
    const response = await request(createApp()).get("/api/missing");
    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({
      code: "NOT_FOUND",
      message: "Route not found.",
      details: null,
    });
  });
  it("allows the configured client origin", async () => {
    const response = await request(createApp())
      .get("/api/health")
      .set("Origin", environment.clientOrigin);
    expect(response.headers["access-control-allow-origin"]).toBe(
      environment.clientOrigin,
    );
  });
  it("maps malformed JSON to 400 without echoing the payload", async () => {
    const response = await request(createApp())
      .post("/api/missing")
      .set("Content-Type", "application/json")
      .send("{broken");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
    expect(JSON.stringify(response.body)).not.toContain("{broken");
  });
});
describe("optional database", () => {
  it("skips connection when unconfigured", async () => {
    const connect = vi.spyOn(mongoose, "connect");
    expect(await connectDatabase()).toBe("not-configured");
    expect(connect).not.toHaveBeenCalled();
  });
  it("returns connected when a configured connection succeeds", async () => {
    environment.mongodbUri = "test-only-placeholder";
    const connect = vi.spyOn(mongoose, "connect").mockResolvedValue(mongoose);
    expect(await connectDatabase()).toBe("connected");
    expect(connect).toHaveBeenCalledWith("test-only-placeholder");
  });
  it("propagates connection failure", async () => {
    environment.mongodbUri = "test-only-placeholder";
    vi.spyOn(mongoose, "connect").mockRejectedValue(
      new Error("connection failed"),
    );
    await expect(connectDatabase()).rejects.toThrow("connection failed");
  });
  it.each([
    [0, "disconnected"],
    [1, "connected"],
    [2, "disconnected"],
    [3, "disconnected"],
  ])("maps ready state %i to %s", (state, expected) => {
    environment.mongodbUri = "test-only-placeholder";
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(state);
    expect(databaseStatus()).toBe(expected);
  });
});
describe("shared response helpers", () => {
  it("forwards asynchronous HttpError details", async () => {
    const app = express()
      .get(
        "/failure",
        asyncHandler(async () => {
          throw new HttpError(409, "CONFLICT", "Try again.", { retry: true });
        }),
      )
      .use(errorHandler);
    const response = await request(app).get("/failure");
    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: "CONFLICT",
      message: "Try again.",
      details: { retry: true },
    });
  });
  it("hides unexpected internal error details", async () => {
    const app = express()
      .get(
        "/failure",
        asyncHandler(async () => {
          throw new Error("private-internal-detail");
        }),
      )
      .use(errorHandler);
    const response = await request(app).get("/failure");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        details: null,
      },
    });
  });
});
