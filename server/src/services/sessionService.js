// Login sessions: a random token for the browser, and only its SHA-256 hash in
// the database. A session lasts seven days.
import crypto from "node:crypto";
import Session from "../models/Session.js";

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function startSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await Session.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  return token;
}
