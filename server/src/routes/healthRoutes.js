// GET /api/health: says the server is up and whether the database is
// connected. The browser tests wait on it before they start.
import { Router } from "express";
import { databaseStatus } from "../config/database.js";

const router = Router();
router.get("/health", (req, res) => {
  res.json({
    data: {
      service: "learn-e-server",
      status: "ok",
      database: databaseStatus(),
    },
  });
});
export default router;
