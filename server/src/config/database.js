// Mongoose supplies MongoDB access, following the course's Mongoose example pattern.
import mongoose from "mongoose";
import { environment } from "./environment.js";

export async function connectDatabase() {
  if (!environment.mongodbUri) return "not-configured";
  await mongoose.connect(environment.mongodbUri);
  return "connected";
}

export function databaseStatus() {
  if (!environment.mongodbUri) return "not-configured";
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
}
