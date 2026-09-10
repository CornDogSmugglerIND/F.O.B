import { loadEnvFile } from "./loadEnv.js";
import { createApp } from "./app.js";

loadEnvFile();

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const app = createApp();

app.listen(PORT, HOST, () => {
  console.log(`F.O.B server listening on http://${HOST}:${PORT}`);
});
