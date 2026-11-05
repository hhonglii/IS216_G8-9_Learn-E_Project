// Test helper (G16 Step 7): stands in for a logged-in caller.
import { vi } from "vitest";
import Session from "../../src/models/Session.js";
import { hashToken } from "../../src/services/sessionService.js";

// tokenHash -> userId for every token handed out by sessionHeader. Session.findOne
// is faked to read from it, so the middleware's own User.findById still runs and
// each test's existing user fixtures keep deciding who the caller is.
const issued = new Map();

export function tokenFor(userId) {
  return `test-session-${String(userId)}`;
}

// Usage: request(app).get(path).set(...sessionHeader(userId))
export function sessionHeader(userId) {
  const token = tokenFor(userId);
  issued.set(hashToken(token), String(userId));
  fakeSessionLookup();
  return ["Authorization", `Bearer ${token}`];
}

// A well-formed token that was never issued, as after logout or expiry.
export function badSessionHeader() {
  fakeSessionLookup();
  return ["Authorization", "Bearer never-issued"];
}

function fakeSessionLookup() {
  if (vi.isMockFunction(Session.findOne)) return;
  vi.spyOn(Session, "findOne").mockImplementation(async ({ tokenHash }) => {
    const id = issued.get(tokenHash);
    return id ? { _id: `session-${id}`, userId: id } : null;
  });
}
