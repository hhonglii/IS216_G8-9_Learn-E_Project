// dotenv supplies local environment loading; no credentials are included in this scaffold.
import dotenv from "dotenv";

dotenv.config({ quiet: true });

export const environment = {
  port: Number(process.env.PORT || 8000),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  mongodbUri: process.env.MONGODB_URI || "",
  githubToken: process.env.GITHUB_TOKEN || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "",
  professorSignupCode: process.env.PROFESSOR_SIGNUP_CODE || "",
};

if (
  !Number.isInteger(environment.port) ||
  environment.port < 1 ||
  environment.port > 65535
) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}
