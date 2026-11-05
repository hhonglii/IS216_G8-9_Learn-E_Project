// Starts Learn-E's API: connects to MongoDB when MONGODB_URI is set, then
// listens on PORT. Without a database it still starts, so the health route can
// say "not-configured". Errors are logged without the database address.
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { environment } from "./config/environment.js";
import { connectDatabase } from "./config/database.js";

try {
  const database = await connectDatabase();
  if (database === "not-configured") {
    console.warn(
      "MongoDB not configured: set MONGODB_URI locally when ready. Health reports not-configured.",
    );
  }
  const server = createApp().listen(environment.port, () => {
    console.log(
      `Learn-E server listening on http://localhost:${environment.port}`,
    );
  });
  server.on("error", async (error) => {
    console.error(
      `Server could not listen (${error.code ?? error.name}). Check PORT and whether another process is using it.`,
    );
    await mongoose.disconnect();
    process.exitCode = 1;
  });
} catch (error) {
  // Log only the error name and code: driver messages can include the database host.
  console.error(
    `Database connection failed (${[error.name, error.code].filter(Boolean).join(" ")}). Check local MongoDB configuration and network access.`,
  );
  await mongoose.disconnect();
  process.exitCode = 1;
}
