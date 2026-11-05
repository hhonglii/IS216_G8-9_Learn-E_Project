// Checks a file a professor uploads to a mini-project (H-10). Only PDFs and
// zip files are allowed. The file's first bytes must match its extension, so
// a renamed program is refused even when its name ends in .pdf.

// 4 MB per file, not more: Vercel refuses request and response bodies over
// 4.5 MB, so a bigger file could be neither uploaded nor downloaded (H-23).
export const MATERIAL_MAX_BYTES = 4 * 1024 * 1024;
export const MATERIAL_MAX_FILES = 5; // per mini-project
const MAX_NAME_LENGTH = 120;

// Every PDF starts with "%PDF-" and every non-empty zip with "PK\x03\x04".
const kinds = {
  pdf: { contentType: "application/pdf", signature: Buffer.from("%PDF-") },
  zip: {
    contentType: "application/zip",
    signature: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  },
};

// The client sends the name URI-encoded in the X-File-Name header, because a
// header can't carry most non-ASCII characters. Returns the plain name with
// any folder path, control characters and quotes removed, cut to 120
// characters with the extension kept, or "" when there is no usable name.
export function cleanFileName(raw) {
  if (typeof raw !== "string") return "";
  let name;
  try {
    name = decodeURIComponent(raw);
  } catch {
    return "";
  }
  name = name
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .trim();
  if (name.length <= MAX_NAME_LENGTH) return name;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot) : "";
  return name.slice(0, MAX_NAME_LENGTH - extension.length) + extension;
}

// Returns { contentType } for an acceptable file, or { problem } saying what
// to fix. The size limit is also enforced by the route's body parser, which
// refuses anything larger with 413 before this runs.
export function checkMaterial(name, body) {
  if (!Buffer.isBuffer(body) || body.length === 0)
    return { problem: "Choose a file to upload." };
  if (!name) return { problem: "The file needs a name." };
  if (body.length > MATERIAL_MAX_BYTES)
    return { problem: "Files can be up to 4 MB." };

  const extension = name.toLowerCase().split(".").pop();
  const kind = Object.hasOwn(kinds, extension) ? kinds[extension] : null;
  if (!name.includes(".") || !kind)
    return { problem: "Only PDF and zip files can be uploaded." };
  if (!body.subarray(0, kind.signature.length).equals(kind.signature))
    return {
      problem: `This file isn't a real .${extension} file. Check that it opens, then upload it again.`,
    };
  return { contentType: kind.contentType };
}

// The Content-Disposition header for a download. Browsers that read
// filename* get the exact name; older ones fall back to an ASCII copy.
export function attachmentHeader(name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
