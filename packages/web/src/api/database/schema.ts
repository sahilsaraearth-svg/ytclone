import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Persists Google OAuth tokens across server restarts.
 */
export const googleTokens = sqliteTable("google_tokens", {
  userId: text("user_id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiry: integer("expiry").notNull(),
});
