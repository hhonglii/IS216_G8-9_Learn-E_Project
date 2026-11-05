// Stores mini-project materials (H-10) in MongoDB with GridFS, which splits a
// file into chunks so it isn't held to the 16 MB document limit. GridFS ships
// with the MongoDB driver Mongoose already uses, so no new package is needed,
// and the files live wherever the database does (Atlas included).
import mongoose from "mongoose";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const bucket = () =>
  new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "materials",
  });

// Saves the file and returns its GridFS id.
export async function saveMaterialFile(buffer, name, contentType) {
  const upload = bucket().openUploadStream(name, { metadata: { contentType } });
  await pipeline(Readable.from([buffer]), upload);
  return upload.id;
}

// Returns the whole file as a Buffer, or null when it is missing. Files are at
// most 4 MB, so reading one into memory is simpler than streaming it and
// means a missing file can still be answered with a clean 404.
export async function readMaterialFile(fileId) {
  const chunks = [];
  try {
    for await (const chunk of bucket().openDownloadStream(fileId))
      chunks.push(chunk);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  return Buffer.concat(chunks);
}

// Deletes the file. A file that is already gone counts as deleted.
export async function deleteMaterialFile(fileId) {
  try {
    await bucket().delete(fileId);
  } catch (error) {
    if (!/not found/i.test(error.message)) throw error;
  }
}
