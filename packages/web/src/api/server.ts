import app from "./index";

const port = Number(process.env.PORT ?? 4200);

console.log(`API server running on http://0.0.0.0:${port}`);

export default {
  port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
  idleTimeout: 255, // max allowed by Bun — needed for video streaming
};
