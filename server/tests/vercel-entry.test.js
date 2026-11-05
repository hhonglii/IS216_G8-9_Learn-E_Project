// The Vercel entry point (H-23): Vercel picks it, it connects once, exports the
// app, and still answers when the database can't be reached. The connection is mocked, so this
// never touches the database in server/.env.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const connectDatabase = vi.fn();
vi.mock("../src/config/database.js", async (importOriginal) => ({
  ...(await importOriginal()),
  connectDatabase,
}));

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  connectDatabase.mockReset();
});

async function loadEntry() {
  return (await import("../index.js")).default;
}

describe("Vercel entry point", () => {
  it("is the file Vercel picks: it imports express, so src/app.js is not used", () => {
    // The same pattern Vercel's Express builder (@vercel/express 24.0.1) uses to
    // accept an entry file. index.js is checked before src/app.js.
    const vercelPattern = /(?:from|require|import)\s*(?:\(\s*)?["']express["']\s*(?:\))?/;
    const entry = readFileSync(fileURLToPath(new URL("../index.js", import.meta.url)), "utf8");
    expect(entry).toMatch(vercelPattern);
  });

  it("connects once and exports an app that answers requests", async () => {
    connectDatabase.mockResolvedValue("not-configured");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = await loadEntry();
    expect(connectDatabase).toHaveBeenCalledTimes(1);
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("ok");
  });

  it("still starts when the database can't be reached, without logging its address", async () => {
    const failure = Object.assign(new Error("connect failed: secret-host.example.net"), {
      name: "MongoServerSelectionError",
    });
    connectDatabase.mockRejectedValue(failure);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = await loadEntry();
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][0]).toContain("MongoServerSelectionError");
    expect(logged.mock.calls[0][0]).not.toContain("secret-host");
  });
});
