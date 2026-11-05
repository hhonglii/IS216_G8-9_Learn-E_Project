// Vercel's entry point for the API (H-23). Vercel runs this file as one function
// and hands each request to the exported app; local development and the tests
// use src/server.js and src/app.js instead. Vercel checks index.js before
// src/app.js (which exports a factory, not an app), but only accepts a file whose
// text imports "express". This file reaches Express through createApp, so the
// import below is what makes Vercel pick it; without it Vercel falls through to
// src/app.js and every request fails.
import "express";
import mongoose from "mongoose";
import { createApp } from "./src/app.js";
import { connectDatabase } from "./src/config/database.js";

try {
  const database = await connectDatabase();
  if (database === "not-configured") {
    console.warn("MongoDB not configured: set MONGODB_URI in the Vercel project settings.");
  }
} catch (error) {
  // Log only the error name and code: driver messages can include the database host.
  // The app still starts, so /api/health can report the database as disconnected.
  console.error(
    `Database connection failed (${[error.name, error.code].filter(Boolean).join(" ")}). Check MONGODB_URI and Atlas network access.`,
  );
  await mongoose.disconnect();
}

export default createApp();
