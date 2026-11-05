// DELETE /api/challenges/:id: the owning professor removes a draft they no
// longer want. Published challenges stay. Mocked models, as in
// challenges-publish.test.js.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import Challenge from "../src/models/Challenge.js";
import {
  missingId,
  otherId,
  ownerId,
  setupStore,
  studentId,
} from "./helpers/challengeStore.js";

let store, deleteOne;

beforeEach(() => {
  store = setupStore();
  // Deletes only a stored record whose status matches the filter, like MongoDB.
  deleteOne = vi.spyOn(Challenge, "deleteOne").mockImplementation(async (filter) => {
    const key = String(filter._id).toLowerCase();
    const stored = store.records.get(key);
    if (!stored || stored.status !== filter.status) return { deletedCount: 0 };
    store.records.delete(key);
    return { deletedCount: 1 };
  });
});
afterEach(() => vi.restoreAllMocks());

function remove(caller, target) {
  const pending = request(createApp()).delete(`/api/challenges/${target}`);
  return caller ? pending.set(...sessionHeader(caller)) : pending;
}

describe("DELETE /api/challenges/:id", () => {
  it("removes the owner's draft", async () => {
    const id = store.add({ status: "draft" });
    const response = await remove(ownerId, id);
    expect(response.status).toBe(204);
    expect(store.records.has(id)).toBe(false);
    expect(deleteOne).toHaveBeenCalledWith({ _id: expect.anything(), status: "draft" });
  });

  it("keeps a published challenge", async () => {
    const id = store.add({ status: "published" });
    const response = await remove(ownerId, id);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CHALLENGE_PUBLISHED");
    expect(store.records.has(id)).toBe(true);
  });

  it.each([otherId, studentId])("refuses caller %s and keeps the draft", async (caller) => {
    const id = store.add({ status: "draft" });
    expect((await remove(caller, id)).status).toBe(403);
    expect(deleteOne).not.toHaveBeenCalled();
    expect(store.records.has(id)).toBe(true);
  });

  it("needs a logged-in caller, a valid id and a challenge that exists", async () => {
    const id = store.add({ status: "draft" });
    expect((await remove(null, id)).status).toBe(401);
    expect((await remove(ownerId, "example")).status).toBe(400);
    expect((await remove(ownerId, String(missingId))).status).toBe(404);
    expect(deleteOne).not.toHaveBeenCalled();
  });
});
