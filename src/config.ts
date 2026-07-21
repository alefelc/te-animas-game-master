import { z } from "zod";

const schema = z.object({
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.6-luna"),
  OPENAI_FALLBACK_MODEL: z.string().min(1).default("gpt-5.2"),
  DIRECTUS_URL: z.string().url(),
  DIRECTUS_TOKEN: z.string().min(1),
  DIAGNOSTIC_TOKEN: z.string().optional().default(""),
  ALLOWED_ORIGINS: z
    .string()
    .default(
      "https://teanimas.com,https://www.teanimas.com,https://census.ar,https://www.census.ar,http://localhost:5173",
    ),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60000)
    .default(18000),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(60),
  ACCOUNT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(120),
  REGISTER_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(60).default(3),
  PLAYER_ROLE_ID: z.string().uuid().optional(),
  ACCOUNT_INVITE_URL: z.string().url().default("https://teanimas.com/?auth=accept-invite"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const parsed = schema.parse(process.env);

export const config = {
  openaiApiKey: parsed.OPENAI_API_KEY,
  openaiModel: parsed.OPENAI_MODEL,
  openaiFallbackModel: parsed.OPENAI_FALLBACK_MODEL,
  directusUrl: parsed.DIRECTUS_URL.replace(/\/+$/, ""),
  directusToken: parsed.DIRECTUS_TOKEN,
  diagnosticToken: parsed.DIAGNOSTIC_TOKEN,
  allowedOrigins: new Set(
    parsed.ALLOWED_ORIGINS.split(",")
      .map((value) => value.trim().replace(/\/+$/, ""))
      .filter(Boolean),
  ),
  port: parsed.PORT,
  requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS,
  rateLimitPerMinute: parsed.RATE_LIMIT_PER_MINUTE,
  accountRateLimitPerMinute: parsed.ACCOUNT_RATE_LIMIT_PER_MINUTE,
  registerRateLimitPerMinute: parsed.REGISTER_RATE_LIMIT_PER_MINUTE,
  playerRoleId: parsed.PLAYER_ROLE_ID ?? null,
  accountInviteUrl: parsed.ACCOUNT_INVITE_URL,
  logLevel: parsed.LOG_LEVEL,
};
