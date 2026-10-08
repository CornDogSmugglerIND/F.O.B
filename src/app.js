import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scouterRouter } from "./routes/scouter.js";
import { channelsRouter } from "./routes/channels.js";
import { csvRouter } from "./routes/csv.js";
import { getUploadsDir } from "./store.js";
import { getChannelStatuses } from "./channels/config.js";

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
      channels: getChannelStatuses().map((c) => ({ id: c.id, configured: c.configured })),
    });
  });

  app.use("/api/scouter", scouterRouter());
  app.use("/api/channels", channelsRouter());
  app.use("/api/csv", csvRouter());
  app.use("/uploads", express.static(getUploadsDir()));
  app.use(express.static(join(__dirname, "..", "public")));

  app.use((err, _req, res, _next) => {
    console.error(err);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Photo file too large" });
    }
    // Oversized JSON (e.g. full-size phone photos pasted into an Identify
    // request) must come back honest, not as a 500. Photos are kept client-side.
    if (err.type === "entity.too.large") {
      return res
        .status(413)
        .json({ ok: false, error: "Photos too large — downscale and retry. Nothing was changed." });
    }
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
