// Express app with CORS.
import express from "express";
import cors from "cors";
import { environment } from "./config/environment.js";
import healthRoutes from "./routes/healthRoutes.js";
import { HttpError } from "./utils/httpError.js";
import { errorHandler } from "./middleware/errorHandler.js";

import usersRoutes from "./routes/usersRoutes.js";
import classroomsRoutes from "./routes/classroomsRoutes.js";
import challengesRoutes from "./routes/challengesRoutes.js";
import helpRequestsRoutes from "./routes/helpRequestsRoutes.js";
import miniProjectsRoutes from "./routes/miniProjectsRoutes.js";
import groupsRoutes from "./routes/groupsRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import classroomGamesRoutes from "./routes/classroomGamesRoutes.js";

export function createApp() {
  const app = express();
  app.use(cors({ origin: environment.clientOrigin }));
  // Parse JSON before routes so handlers can read req.body. CORS above is a browser
  // origin policy, not authentication. Each router below contributes paths under /api.
  app.use(express.json());
  app.use("/api", healthRoutes);
  app.use("/api", usersRoutes);
  app.use("/api", classroomsRoutes);
  app.use("/api", challengesRoutes);
  app.use("/api", helpRequestsRoutes);
  app.use("/api", miniProjectsRoutes);
  app.use("/api", groupsRoutes);
  app.use("/api", authRoutes);
  app.use("/api", classroomGamesRoutes);

  // This fallback is last among normal handlers: valid routes get a chance to match.
  // Forwarding an HttpError enters error middleware instead of sending success.
  app.use((req, res, next) =>
    next(new HttpError(404, "NOT_FOUND", "Route not found.")),
  );
  app.use(errorHandler);
  return app;
}
