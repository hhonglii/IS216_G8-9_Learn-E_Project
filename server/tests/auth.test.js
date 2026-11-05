import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import User from "../src/models/User.js";
import Session from "../src/models/Session.js";
import { hashPassword } from "../src/services/passwordService.js";
import { hashToken } from "../src/services/sessionService.js";
import { environment } from "../src/config/environment.js";

// No live database: User and Session methods are replaced per test.
const userId = new mongoose.Types.ObjectId();
const validBody = {
  username: "alice.t",
  displayName: "Alice",
  role: "student",
  password: "correct horse",
};

let sessionCreate;
beforeEach(() => {
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0);
  sessionCreate = vi.spyOn(Session, "create").mockResolvedValue({});
});
afterEach(() => vi.restoreAllMocks());

function register(body) {
  return request(createApp()).post("/api/auth/register").send(body);
}

function login(body) {
  return request(createApp()).post("/api/auth/login").send(body);
}

describe("POST /api/auth/register (G16 Step 4)", () => {
  let create;
  beforeEach(() => {
    create = vi
      .spyOn(User, "create")
      .mockImplementation(async (fields) => ({ _id: userId, ...fields }));
  });

  it("creates the user, starts a session and returns 201 with token and user", async () => {
    const response = await register(validBody);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        token: expect.any(String),
        user: {
          id: String(userId),
          username: "alice.t",
          displayName: "Alice",
          role: "student",
        },
      },
    });
    expect(sessionCreate).toHaveBeenCalledTimes(1);
    const saved = sessionCreate.mock.calls[0][0];
    expect(saved.userId).toBe(userId);
    expect(saved.tokenHash).toBe(hashToken(response.body.data.token));
  });

  it("stores a scrypt hash, never the password, and never returns the hash", async () => {
    const response = await register(validBody);
    const fields = create.mock.calls[0][0];
    expect(fields.passwordHash).toMatch(
      /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/,
    );
    expect(JSON.stringify(fields)).not.toContain(validBody.password);
    expect(JSON.stringify(response.body)).not.toContain("scrypt");
    expect(JSON.stringify(response.body)).not.toContain(validBody.password);
  });

  it("trims and lower-cases the username and trims the display name", async () => {
    await register({
      ...validBody,
      username: "  Alice.T  ",
      displayName: "  Alice  ",
    });
    expect(create).toHaveBeenCalledWith({
      username: "alice.t",
      displayName: "Alice",
      role: "student",
      passwordHash: expect.any(String),
    });
  });

  it("stores only the four allowed fields, ignoring extra body fields", async () => {
    await register({
      ...validBody,
      _id: "attacker-chosen",
      contributionPoints: 999,
      passwordHash: "scrypt$00$00",
    });
    const fields = create.mock.calls[0][0];
    expect(Object.keys(fields).sort()).toEqual([
      "displayName",
      "passwordHash",
      "role",
      "username",
    ]);
    expect(fields.passwordHash).not.toBe("scrypt$00$00");
  });

  // H3 Step 6 (option B): a professor account needs the code set on the server.
  describe("professor sign-up code", () => {
    const professor = { ...validBody, role: "professor" };
    beforeEach(() => {
      environment.professorSignupCode = "test-professor-code";
    });
    afterEach(() => {
      environment.professorSignupCode = "";
    });

    it("accepts a professor with the right code", async () => {
      const response = await register({ ...professor, professorCode: "test-professor-code" });
      expect(response.status).toBe(201);
      expect(response.body.data.user.role).toBe("professor");
      expect(create.mock.calls[0][0]).not.toHaveProperty("professorCode");
    });

    it.each([
      ["no code", {}],
      ["a wrong code", { professorCode: "guess" }],
      ["the code as a number", { professorCode: 1234 }],
    ])("refuses a professor with %s", async (_label, change) => {
      const response = await register({ ...professor, ...change });
      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual([
        { field: "professorCode", message: "Professor accounts need the professor sign-up code." },
      ]);
      expect(create).not.toHaveBeenCalled();
    });

    it("refuses every professor when the server has no code set", async () => {
      environment.professorSignupCode = "";
      const response = await register({ ...professor, professorCode: "" });
      expect(response.status).toBe(400);
      expect(create).not.toHaveBeenCalled();
    });

    it("lets a student sign up without any code", async () => {
      const response = await register({ ...validBody, professorCode: "guess" });
      expect(response.status).toBe(201);
    });
  });

  it.each([
    ["shortest username", { username: "abc" }],
    ["longest username", { username: "a".repeat(30) }],
    ["username with . _ -", { username: "a.b_c-d" }],
    ["one-character name", { displayName: "A" }],
    ["60-character name", { displayName: "n".repeat(60) }],
  ])("accepts the %s", async (_label, change) => {
    const response = await register({ ...validBody, ...change });
    expect(response.status).toBe(201);
  });

  it.each([
    ["missing", { username: undefined }],
    ["non-string", { username: 42 }],
    ["too short", { username: "ab" }],
    ["too long", { username: "a".repeat(31) }],
    ["with a space", { username: "alice t" }],
    ["with a symbol", { username: "alice!" }],
    ["blank", { username: "   " }],
  ])("rejects a %s username without a write", async (_label, change) => {
    const response = await register({ ...validBody, ...change });
    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { field: "username", message: expect.any(String) },
    ]);
    expect(create).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", { displayName: undefined }],
    ["non-string", { displayName: 42 }],
    ["empty", { displayName: "" }],
    ["blank", { displayName: "   " }],
    ["61-character", { displayName: "n".repeat(61) }],
  ])("rejects a %s display name without a write", async (_label, change) => {
    const response = await register({ ...validBody, ...change });
    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { field: "displayName", message: expect.any(String) },
    ]);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", { role: undefined }],
    ["unknown", { role: "admin" }],
    ["wrong-case", { role: "Student" }],
  ])("rejects a %s role without a write", async (_label, change) => {
    const response = await register({ ...validBody, ...change });
    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { field: "role", message: expect.any(String) },
    ]);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", { password: undefined }],
    ["7-character", { password: "1234567" }],
    ["129-character", { password: "p".repeat(129) }],
  ])("rejects a %s password without a write", async (_label, change) => {
    const response = await register({ ...validBody, ...change });
    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { field: "password", message: "Password must be 8 to 128 characters." },
    ]);
    expect(create).not.toHaveBeenCalled();
  });

  it("lists every bad field at once, with the message and details in their own slots", async () => {
    const response = await request(createApp()).post("/api/auth/register");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.error.message).toEqual(expect.any(String));
    expect(response.body.error.details.map((d) => d.field)).toEqual([
      "username",
      "displayName",
      "role",
      "password",
    ]);
    expect(create).not.toHaveBeenCalled();
  });

  it("answers 409 USERNAME_TAKEN when the unique index rejects the username", async () => {
    create.mockRejectedValue(
      Object.assign(new Error("E11000 duplicate key"), { code: 11000 }),
    );
    const response = await register(validBody);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("USERNAME_TAKEN");
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("hides other database failures behind a 500", async () => {
    create.mockRejectedValue(new Error("private-db-detail"));
    const response = await register(validBody);
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("private-db-detail");
  });
});

describe("POST /api/auth/login (G16 Step 4)", () => {
  let storedUser;
  let findOne;
  let select;
  beforeEach(async () => {
    storedUser = {
      _id: userId,
      username: "alice.t",
      displayName: "Alice",
      role: "student",
      passwordHash: await hashPassword(validBody.password),
    };
    select = vi.fn(async () => storedUser);
    findOne = vi.spyOn(User, "findOne").mockReturnValue({ select });
  });

  const invalid = {
    code: "INVALID_CREDENTIALS",
    message: "Username or password is incorrect.",
    details: null,
  };

  it("logs in, starts a session and returns 200 with token and user", async () => {
    const response = await login({
      username: "alice.t",
      password: validBody.password,
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        token: expect.any(String),
        user: {
          id: String(userId),
          username: "alice.t",
          displayName: "Alice",
          role: "student",
        },
      },
    });
    expect(select).toHaveBeenCalledWith("+passwordHash");
    const saved = sessionCreate.mock.calls[0][0];
    expect(saved.userId).toBe(userId);
    expect(saved.tokenHash).toBe(hashToken(response.body.data.token));
    expect(JSON.stringify(response.body)).not.toContain("scrypt");
  });

  it("looks the username up trimmed and lower-cased", async () => {
    const response = await login({
      username: "  ALICE.T ",
      password: validBody.password,
    });
    expect(response.status).toBe(200);
    expect(findOne).toHaveBeenCalledWith({ username: "alice.t" });
  });

  it("gives a new token on each login", async () => {
    const body = { username: "alice.t", password: validBody.password };
    const first = await login(body);
    const second = await login(body);
    expect(first.body.data.token).not.toBe(second.body.data.token);
  });

  it("rejects a wrong password with the shared 401", async () => {
    const response = await login({
      username: "alice.t",
      password: "wrong horse",
    });
    expect(response.status).toBe(401);
    expect(response.body.error).toEqual(invalid);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("rejects an unknown username with the same 401", async () => {
    select.mockResolvedValue(null);
    const response = await login({
      username: "bob",
      password: validBody.password,
    });
    expect(response.status).toBe(401);
    expect(response.body.error).toEqual(invalid);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("rejects a user who has no password yet with the same 401", async () => {
    delete storedUser.passwordHash;
    const response = await login({
      username: "alice.t",
      password: validBody.password,
    });
    expect(response.status).toBe(401);
    expect(response.body.error).toEqual(invalid);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["no body", undefined],
    ["missing username", { password: validBody.password }],
    ["missing password", { username: "alice.t" }],
    ["empty username", { username: "", password: validBody.password }],
    ["empty password", { username: "alice.t", password: "" }],
    ["non-string username", { username: 42, password: validBody.password }],
    ["non-string password", { username: "alice.t", password: 12345678 }],
    [
      "object username",
      { username: { $ne: null }, password: validBody.password },
    ],
  ])("rejects %s with the same 401 and no lookup", async (_label, body) => {
    const response = await login(body);
    expect(response.status).toBe(401);
    expect(response.body.error).toEqual(invalid);
    expect(findOne).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("hides database failures behind a 500", async () => {
    select.mockRejectedValue(new Error("private-db-detail"));
    const response = await login({
      username: "alice.t",
      password: validBody.password,
    });
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("private-db-detail");
  });
});

describe("GET /api/auth/me and POST /api/auth/logout (G16 Step 4)", () => {
  // An in-memory stand-in for the sessions collection, so register, login,
  // the session middleware, me and logout all run together through the app.
  let sessions;
  let users;
  let deleteOne;
  beforeEach(() => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
    sessions = [];
    users = new Map();
    sessionCreate.mockImplementation(async (doc) => {
      const saved = { _id: new mongoose.Types.ObjectId(), ...doc };
      sessions.push(saved);
      return saved;
    });
    vi.spyOn(Session, "findOne").mockImplementation(
      async ({ tokenHash, expiresAt }) =>
        sessions.find(
          (s) => s.tokenHash === tokenHash && s.expiresAt > expiresAt.$gt,
        ) ?? null,
    );
    deleteOne = vi
      .spyOn(Session, "deleteOne")
      .mockImplementation(async ({ _id }) => {
        sessions = sessions.filter((s) => String(s._id) !== String(_id));
        return { deletedCount: 1 };
      });
    vi.spyOn(User, "create").mockImplementation(async (fields) => {
      const user = { _id: new mongoose.Types.ObjectId(), ...fields };
      users.set(String(user._id), user);
      return user;
    });
    vi.spyOn(User, "findById").mockImplementation(
      async (id) => users.get(String(id)) ?? null,
    );
    vi.spyOn(User, "findOne").mockImplementation(({ username }) => ({
      select: async () =>
        [...users.values()].find((u) => u.username === username) ?? null,
    }));
  });

  async function registeredToken() {
    const response = await register(validBody);
    expect(response.status).toBe(201);
    return response.body.data.token;
  }

  function me(token) {
    const pending = request(createApp()).get("/api/auth/me");
    return token ? pending.set("Authorization", `Bearer ${token}`) : pending;
  }

  function logout(token) {
    const pending = request(createApp()).post("/api/auth/logout");
    return token ? pending.set("Authorization", `Bearer ${token}`) : pending;
  }

  it("me returns the session's user, without the password hash", async () => {
    const token = await registeredToken();
    const response = await me(token);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        id: expect.any(String),
        username: "alice.t",
        displayName: "Alice",
        role: "student",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("scrypt");
  });

  it("me without a token is 401 UNAUTHENTICATED", async () => {
    const response = await me();
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("me with an unknown token is 401 INVALID_SESSION", async () => {
    const response = await me("never-issued");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_SESSION");
  });

  it("me with an expired session is 401 INVALID_SESSION", async () => {
    const token = await registeredToken();
    sessions[0].expiresAt = new Date(Date.now() - 1000);
    const response = await me(token);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_SESSION");
  });

  it("logout answers 204 with no body, and the token stops working", async () => {
    const token = await registeredToken();
    const response = await logout(token);
    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect((await me(token)).status).toBe(401);
  });

  it("logout ends only this session, not the user's others", async () => {
    await registeredToken();
    const credentials = { username: "alice.t", password: validBody.password };
    const phone = (await login(credentials)).body.data.token;
    const laptop = (await login(credentials)).body.data.token;
    const laptopSession = sessions.find(
      (s) => s.tokenHash === hashToken(laptop),
    );

    expect((await logout(laptop)).status).toBe(204);
    expect(deleteOne).toHaveBeenCalledTimes(1);
    expect(deleteOne).toHaveBeenCalledWith({ _id: laptopSession._id });
    expect((await me(laptop)).status).toBe(401);
    expect((await me(phone)).status).toBe(200);
  });

  it("logout without a token is 401 and deletes nothing", async () => {
    const response = await logout();
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(deleteOne).not.toHaveBeenCalled();
  });

  it("a second logout with the same token is 401 INVALID_SESSION", async () => {
    const token = await registeredToken();
    await logout(token);
    const again = await logout(token);
    expect(again.status).toBe(401);
    expect(again.body.error.code).toBe("INVALID_SESSION");
    expect(deleteOne).toHaveBeenCalledTimes(1);
  });

  it("register and login still work with a stale token in the header", async () => {
    const stale = ["Authorization", "Bearer expired-long-ago"];
    const registered = await request(createApp())
      .post("/api/auth/register")
      .set(...stale)
      .send(validBody);
    expect(registered.status).toBe(201);
    const loggedIn = await request(createApp())
      .post("/api/auth/login")
      .set(...stale)
      .send({ username: "alice.t", password: validBody.password });
    expect(loggedIn.status).toBe(200);
  });

  it("hides a failed session delete behind a 500", async () => {
    const token = await registeredToken();
    deleteOne.mockRejectedValue(new Error("private-db-detail"));
    const response = await logout(token);
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("private-db-detail");
  });
});
