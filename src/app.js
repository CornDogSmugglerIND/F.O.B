import { shopifyRouter } from "./routes/shopify.js";
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scouterRouter } from "./routes/scouter.js";
import { channelsRouter } from "./routes/channels.js";
import { csvRouter } from "./routes/csv.js";
import { deviceSyncRouter } from "./routes/deviceSync.js";
import { identifyQueueRouter } from "./routes/identifyQueue.js";
import { scannerRouter } from "./routes/scanner.js";
import { getUploadsDir } from "./store.js";
import { getChannelStatuses } from "./channels/config.js";
import { gate, authRoute } from "./gate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  const lockPage = join(__dirname, "..", "public", "lock.html");
  app.post("/api/auth", express.json({ limit: "4kb" }), authRoute);
  app.use(gate(lockPage));
  // Device sync carries the full item store (photos included): its own big parser, before the global one.
  app.use("/api/sync", express.json({ limit: "25mb" }), deviceSyncRouter());
  app.use(["/api/channels/ebay/publish-item", "/api/channels/ebay/publish-variation", "/api/channels/ebay/upload-image"], express.json({ limit: "25mb" }));
  /* scanner intake: one scan per POST */
  app.use("/api/identify/queue", express.json({ limit: "8mb" }), identifyQueueRouter());
  app.use("/api/scanner", express.json(), scannerRouter());
  app.use(express.json({ limit: "2mb" }));

  const startedAt = Date.now();

  /* behind the gate on purpose: 200 signed in, 401 locked. The app shell asks this on boot. */
  app.get("/api/session", (_req, res) => res.set("Cache-Control", "no-store").json({ ok: true }));

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
  app.use("/api/shopify", express.json({ limit: "2mb" }), shopifyRouter());
  // The new app is the app. Classic stays reachable at /hud.html.
  app.get("/", (_req, res) => res.redirect(302, "/next/"));
  app.use("/uploads", express.static(getUploadsDir()));
  /* public: the storefront assets, the sign-in page, icons */
  app.use(express.static(join(__dirname, "..", "public")));
  /* private: the app itself. Lives outside public/ so Vercel can't serve it
     from the CDN ahead of the gate. Every byte here needs a signed-in cookie. */
  app.use(express.static(join(__dirname, "..", "private"), {
    setHeaders: (res, file) => {
      res.set("X-Robots-Tag", "noindex, nofollow");
      if (/\.html$/.test(file) || /manifest\.webmanifest$/.test(file)) res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    },
  }));

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
