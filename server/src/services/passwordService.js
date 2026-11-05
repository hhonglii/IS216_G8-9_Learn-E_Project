// Password hashing with Node's built-in scrypt and a random salt per password,
// stored as scrypt$<salt>$<hash>. verifyPassword compares in constant time.
// passwordProblem holds the length rule shared by sign-up and password change.
import crypto from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(crypto.scrypt);

export async function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(plain, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(plain, stored) {
  if (
    typeof stored !== "string" ||
    !(stored.split("$").length === 3 && stored.split("$")[0] === "scrypt")
  ) {
    return false;
  } else {
    const [label, saltHex, hashHex] = stored.split("$");
    const saltBytes = Buffer.from(saltHex, "hex");
    const hashBytes = Buffer.from(hashHex, "hex");
    if (hashBytes.length !== 64) return false;
    const hashPlain = await scrypt(plain, saltBytes, hashBytes.length);
    return crypto.timingSafeEqual(hashBytes, hashPlain);
  }
}

export function passwordProblem(plain) {
  if (typeof plain !== "string" || plain.length < 8 || plain.length > 128) {
    return "Password must be 8 to 128 characters.";
  } else {
    return null;
  }
}
