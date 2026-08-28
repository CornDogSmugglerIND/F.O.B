import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build the Express application. Kept separate from the server bootstrap so
 * tests can import the app without binding to a port.
 */
export function createApp() {
  const app = express();
  app.use(express.json());

  const startedAt = Date.now();

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "fob",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  });

  // Simple, side-effect-free demo endpoint: reverses the provided text.
  app.post("/api/echo", (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    res.json({
      original: text,
      reversed: [...text].reverse().join(""),
      length: text.length,
    });
  });

  app.use(express.static(join(__dirname, "..", "public")));

  return app;
}
