import { createApp } from "../src/app.js";

/** Vercel serverless entry — all traffic is rewritten here. */
const app = createApp();
export default app;
