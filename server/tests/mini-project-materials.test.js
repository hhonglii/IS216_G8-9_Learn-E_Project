// Mini-project materials (H-10): the owning professor uploads PDFs and zips to
// a draft, students in the classroom download them once it is published.
// Models are mocked as in mini-projects-drafts.test.js, and the GridFS store
// is replaced by an in-memory map, so no database is needed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { sessionHeader } from "./helpers/session.js";
import User from "../src/models/User.js";
import Classroom from "../src/models/Classroom.js";
import Membership from "../src/models/Membership.js";
import MiniProject from "../src/models/MiniProject.js";
import ProjectGroup from "../src/models/ProjectGroup.js";
import {
  attachmentHeader,
  checkMaterial,
  cleanFileName,
} from "../src/utils/materialFile.js";
import * as store from "../src/services/materialStore.js";

vi.mock("../src/services/materialStore.js", () => ({
  saveMaterialFile: vi.fn(),
  readMaterialFile: vi.fn(),
  deleteMaterialFile: vi.fn(),
}));

const ownerId = new mongoose.Types.ObjectId();
const otherProfessorId = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();
const outsiderId = new mongoose.Types.ObjectId();
const classroomId = new mongoose.Types.ObjectId();
const miniProjectId = new mongoose.Types.ObjectId();
const users = {
  [String(ownerId)]: { _id: ownerId, displayName: "Prof Tan", role: "professor" },
  [String(otherProfessorId)]: { _id: otherProfessorId, displayName: "Prof Lim", role: "professor" },
  [String(studentId)]: { _id: studentId, displayName: "Alice", role: "student" },
  [String(outsiderId)]: { _id: outsiderId, displayName: "Bob", role: "student" },
};
const pdf = Buffer.from("%PDF-1.7\nInstructions\n%%EOF");
const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)]);

let stored;
let files;
let saves;
function storeBrief(fields = {}) {
  stored = MiniProject.hydrate({
    _id: miniProjectId,
    classroomId,
    createdBy: ownerId,
    title: "Counter app",
    maxGroupSize: 2,
    acceptanceCriteria: [],
    materials: [],
    status: "draft",
    ...fields,
  });
}
function addFile(name, contentType, bytes) {
  const fileId = new mongoose.Types.ObjectId();
  files.set(String(fileId), bytes);
  stored.materials.push({ fileId, name, size: bytes.length, contentType });
  return stored.materials.at(-1);
}

beforeEach(() => {
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  vi.spyOn(User, "findById").mockImplementation(async (id) => users[String(id)] ?? null);
  vi.spyOn(Classroom, "findById").mockResolvedValue({ _id: classroomId, professorId: ownerId });
  vi.spyOn(Membership, "findOne").mockImplementation(async ({ userId }) =>
    String(userId) === String(studentId) ? { userId } : null,
  );
  vi.spyOn(MiniProject, "findById").mockImplementation(async (id) =>
    String(id) === String(miniProjectId) ? stored : null,
  );
  saves = 0;
  vi.spyOn(MiniProject.prototype, "save").mockImplementation(async function save() {
    await this.validate();
    saves += 1;
    return this;
  });
  files = new Map();
  store.saveMaterialFile.mockImplementation(async (buffer) => {
    const fileId = new mongoose.Types.ObjectId();
    files.set(String(fileId), buffer);
    return fileId;
  });
  store.readMaterialFile.mockImplementation(async (fileId) => files.get(String(fileId)) ?? null);
  store.deleteMaterialFile.mockImplementation(async (fileId) => {
    files.delete(String(fileId));
  });
  storeBrief();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const base = `/api/mini-projects/${miniProjectId}/materials`;
function upload(callerId, body, name = "brief.pdf") {
  const req = request(createApp()).post(base).set("Content-Type", "application/octet-stream");
  if (callerId) req.set(...sessionHeader(callerId));
  if (name !== null) req.set("X-File-Name", encodeURIComponent(name));
  return req.send(body);
}
function download(callerId, materialId) {
  const req = request(createApp())
    .get(`${base}/${materialId}`)
    .buffer(true)
    .parse((res, done) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      // Errors come back as JSON; a download comes back as the file's bytes.
      res.on("end", () => {
        const bytes = Buffer.concat(chunks);
        const isJson = /json/.test(res.headers["content-type"] ?? "");
        done(null, isJson ? JSON.parse(bytes.toString()) : bytes);
      });
    });
  if (callerId) req.set(...sessionHeader(callerId));
  return req;
}
function remove(callerId, materialId) {
  const req = request(createApp()).delete(`${base}/${materialId}`);
  if (callerId) req.set(...sessionHeader(callerId));
  return req;
}
const problem = (response) => response.body.error.details.map((detail) => detail.message);

describe("checking an uploaded file", () => {
  it("accepts a real PDF or zip and names its type", () => {
    expect(checkMaterial("brief.PDF", pdf)).toEqual({ contentType: "application/pdf" });
    expect(checkMaterial("starter.zip", zip)).toEqual({ contentType: "application/zip" });
  });

  it.each([
    ["an empty body", "brief.pdf", Buffer.alloc(0), "Choose a file to upload."],
    ["no name", "", pdf, "The file needs a name."],
    ["a Word file", "brief.docx", zip, "Only PDF and zip files can be uploaded."],
    ["a name with no extension", "pdf", pdf, "Only PDF and zip files can be uploaded."],
    ["a renamed program", "brief.pdf", Buffer.from("MZ\x90\x00"), "This file isn't a real .pdf file."],
    ["a PDF named .zip", "starter.zip", pdf, "This file isn't a real .zip file."],
  ])("refuses %s", (_, name, body, message) => {
    expect(checkMaterial(name, body).problem).toContain(message);
  });

  it("cleans the name the client sends", () => {
    expect(cleanFileName(encodeURIComponent("Week 3 brief.pdf"))).toBe("Week 3 brief.pdf");
    expect(cleanFileName(encodeURIComponent("../../etc/notes.pdf"))).toBe("notes.pdf");
    expect(cleanFileName(encodeURIComponent('C:\\Users\\a"b\n.pdf'))).toBe("ab.pdf");
    expect(cleanFileName(encodeURIComponent("Résumé 课程.pdf"))).toBe("Résumé 课程.pdf");
    expect(cleanFileName("%E0%A4%A")).toBe("");
    expect(cleanFileName(undefined)).toBe("");
    const long = cleanFileName(encodeURIComponent(`${"a".repeat(200)}.zip`));
    expect(long).toHaveLength(120);
    expect(long.endsWith(".zip")).toBe(true);
  });

  it("keeps the exact name in the download header and an ASCII copy for old browsers", () => {
    expect(attachmentHeader('Brief "v2" 课程.pdf')).toBe(
      `attachment; filename="Brief _v2_ __.pdf"; filename*=UTF-8''Brief%20%22v2%22%20%E8%AF%BE%E7%A8%8B.pdf`,
    );
  });
});

describe("POST /api/mini-projects/:id/materials", () => {
  it("stores a PDF on a draft and lists it on the brief", async () => {
    const response = await upload(ownerId, pdf, "Week 3 brief.pdf");
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      name: "Week 3 brief.pdf",
      size: pdf.length,
      contentType: "application/pdf",
    });
    expect(response.body.data).not.toHaveProperty("fileId");
    expect(store.saveMaterialFile).toHaveBeenCalledWith(pdf, "Week 3 brief.pdf", "application/pdf");
    expect(saves).toBe(1);
    expect(stored.materials).toHaveLength(1);

    vi.spyOn(ProjectGroup, "find").mockResolvedValue([]);
    vi.spyOn(User, "find").mockResolvedValue([]);
    const brief = await request(createApp())
      .get(`/api/mini-projects/${miniProjectId}`)
      .set(...sessionHeader(ownerId));
    expect(brief.body.data.materials).toEqual([
      expect.objectContaining({ id: response.body.data.id, name: "Week 3 brief.pdf" }),
    ]);
  });

  it("refuses a file that isn't really a PDF or zip, and stores nothing", async () => {
    const response = await upload(ownerId, Buffer.from("MZ\x90\x00"), "setup.pdf");
    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe("file");
    expect(problem(response)[0]).toContain("isn't a real .pdf file");
    expect(store.saveMaterialFile).not.toHaveBeenCalled();
  });

  it("refuses an upload with no file or no name", async () => {
    expect(problem(await upload(ownerId, undefined))).toEqual(["Choose a file to upload."]);
    expect(problem(await upload(ownerId, pdf, null))).toEqual(["The file needs a name."]);
  });

  it("refuses a sixth file", async () => {
    for (let index = 0; index < 5; index += 1) addFile(`part ${index}.pdf`, "application/pdf", pdf);
    const response = await upload(ownerId, pdf);
    expect(response.status).toBe(400);
    expect(problem(response)).toEqual([
      "A mini-project can have at most 5 files. Remove one first.",
    ]);
  });

  it("refuses a file over 4 MB with 413 before the handler runs", async () => {
    const big = Buffer.concat([pdf, Buffer.alloc(4 * 1024 * 1024)]);
    const response = await upload(ownerId, big);
    expect(response.status).toBe(413);
    expect(store.saveMaterialFile).not.toHaveBeenCalled();
  });

  it("refuses a published brief with 409", async () => {
    storeBrief({ status: "published" });
    const response = await upload(ownerId, pdf);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("MINIPROJECT_PUBLISHED");
  });

  it.each([
    ["a student", studentId],
    ["a professor who does not own the classroom", otherProfessorId],
  ])("refuses %s with 403", async (_, callerId) => {
    expect((await upload(callerId, pdf)).status).toBe(403);
    expect(store.saveMaterialFile).not.toHaveBeenCalled();
  });

  it("answers 401 with no user", async () => {
    expect((await upload(null, pdf)).status).toBe(401);
  });

  it("removes the stored file again when saving the brief fails", async () => {
    MiniProject.prototype.save.mockRejectedValueOnce(new Error("database down"));
    const response = await upload(ownerId, pdf);
    expect(response.status).toBe(500);
    expect(store.deleteMaterialFile).toHaveBeenCalledTimes(1);
    expect(files.size).toBe(0);
  });
});

describe("GET /api/mini-projects/:id/materials/:materialId", () => {
  it("lets a classroom member download a published brief's file", async () => {
    storeBrief({ status: "published" });
    const material = addFile("Week 3 brief.pdf", "application/pdf", pdf);
    const response = await download(studentId, material._id);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["content-disposition"]).toBe(attachmentHeader("Week 3 brief.pdf"));
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.compare(response.body, pdf)).toBe(0);
  });

  it("lets the owner download from a draft", async () => {
    const material = addFile("starter.zip", "application/zip", zip);
    const response = await download(ownerId, material._id);
    expect(response.status).toBe(200);
    expect(Buffer.compare(response.body, zip)).toBe(0);
  });

  it("hides a draft's files from students", async () => {
    const material = addFile("brief.pdf", "application/pdf", pdf);
    const response = await download(studentId, material._id);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("MINIPROJECT_NOT_FOUND");
  });

  it("refuses someone outside the classroom with 403", async () => {
    storeBrief({ status: "published" });
    const material = addFile("brief.pdf", "application/pdf", pdf);
    expect((await download(outsiderId, material._id)).status).toBe(403);
    expect((await download(otherProfessorId, material._id)).status).toBe(403);
  });

  it("answers 404 for an unknown file or one missing from storage", async () => {
    storeBrief({ status: "published" });
    const unknown = await download(studentId, new mongoose.Types.ObjectId());
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("MATERIAL_NOT_FOUND");
    expect((await download(studentId, "abc")).status).toBe(404);

    const material = addFile("gone.pdf", "application/pdf", pdf);
    files.clear();
    const missing = await download(studentId, material._id);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("MATERIAL_NOT_FOUND");
  });
});

describe("DELETE /api/mini-projects/:id/materials/:materialId", () => {
  it("removes a file from a draft and from storage", async () => {
    const material = addFile("brief.pdf", "application/pdf", pdf);
    const response = await remove(ownerId, material._id);
    expect(response.status).toBe(204);
    expect(stored.materials).toHaveLength(0);
    expect(saves).toBe(1);
    expect(files.size).toBe(0);
  });

  it("refuses a published brief, a student and an unknown file", async () => {
    const material = addFile("brief.pdf", "application/pdf", pdf);
    expect((await remove(studentId, material._id)).status).toBe(403);
    expect((await remove(ownerId, new mongoose.Types.ObjectId())).status).toBe(404);
    stored.status = "published";
    expect((await remove(ownerId, material._id)).status).toBe(409);
    expect(stored.materials).toHaveLength(1);
    expect(files.size).toBe(1);
  });
});

describe("DELETE /api/mini-projects/:id: removing a whole draft", () => {
  let deleteOne;
  beforeEach(() => {
    deleteOne = vi.spyOn(MiniProject, "deleteOne").mockImplementation(async (filter) =>
      stored && String(filter._id) === String(stored._id) && stored.status === filter.status
        ? { deletedCount: 1 }
        : { deletedCount: 0 },
    );
  });
  const removeDraft = (callerId) => {
    const req = request(createApp()).delete(`/api/mini-projects/${miniProjectId}`);
    return callerId ? req.set(...sessionHeader(callerId)) : req;
  };

  it("removes the owner's draft and every file it holds", async () => {
    addFile("brief.pdf", "application/pdf", pdf);
    addFile("starter.zip", "application/zip", zip);
    const response = await removeDraft(ownerId);
    expect(response.status).toBe(204);
    expect(deleteOne).toHaveBeenCalledWith({ _id: stored._id, status: "draft" });
    expect(store.deleteMaterialFile).toHaveBeenCalledTimes(2);
    expect(files.size).toBe(0);
  });

  it("keeps a published brief and its files", async () => {
    storeBrief({ status: "published" });
    addFile("brief.pdf", "application/pdf", pdf);
    const response = await removeDraft(ownerId);
    expect(response.status).toBe(409);
    expect(deleteOne).not.toHaveBeenCalled();
    expect(files.size).toBe(1);
  });

  it("keeps the files when a publish lands first", async () => {
    addFile("brief.pdf", "application/pdf", pdf);
    deleteOne.mockResolvedValue({ deletedCount: 0 });
    expect((await removeDraft(ownerId)).status).toBe(409);
    expect(store.deleteMaterialFile).not.toHaveBeenCalled();
  });

  it.each([
    ["no login", null, 401],
    ["a student", studentId, 403],
    ["another professor", otherProfessorId, 403],
  ])("refuses %s", async (_who, callerId, status) => {
    expect((await removeDraft(callerId)).status).toBe(status);
    expect(deleteOne).not.toHaveBeenCalled();
  });
});
