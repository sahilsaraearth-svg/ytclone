import { Hono } from "hono";
import { cors } from "hono/cors";
import { youtube } from "./routes/youtube";
import { googleAuth } from "./routes/google-auth";
import { zuno } from "./routes/zuno";

const app = new Hono()
  .basePath("api")
  .use(cors({ origin: (origin) => origin ?? "*", credentials: true }))
  .get("/health", (c) => c.json({ status: "ok" }, 200))
  .route("/", youtube)
  .route("/", googleAuth)
  .route("/", zuno);

export type AppType = typeof app;
export default app;
