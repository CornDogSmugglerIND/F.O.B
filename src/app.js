import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scouterRouter } from "./routes/scouter.js";
import { getUploadsDir } from "./store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const startedAt = Date.now();

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "scouter",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  });

  app.use("/api/scouter", scouterRouter());
  app.use("/uploads", express.static(getUploadsDir()));
  app.use(express.static(join(__dirname, "..", "public")));

  app.use((err, _req, res, _next) => {
    console.error(err);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Photo file too large" });
    }
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
