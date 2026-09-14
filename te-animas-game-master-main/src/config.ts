import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.6-luna"),
  OPENAI_FALLBACK_MODEL: z.string().min(1).default("gpt-5.2"),
  DIRECTUS_URL: z.string().url(),
  DIRECTUS_TOKEN: z.string().min(1),
  DIAGNOSTIC_TOKEN: z.string().optional().default(""),
  ALLOWED_ORIGINS: z
    .string()
    .default("https://teanimas.com,https://www.teanimas.com"),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
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
  PUBLIC_APP_URL: z.string().url().default("https://teanimas.com/"),
  GAME_ID: z
    .string()
    .uuid()
    .default("62a628ac-92e2-51e4-add3-62449e619e00"),
  COUPLE_INVITE_PEPPER: z.string().optional().default(""),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
}).superRefine((value, context) => {
  if (
    value.NODE_ENV === "production" &&
    value.COUPLE_INVITE_PEPPER.trim().length < 32
  ) {
    context.addIssue({
      code: "custom",
      path: ["COUPLE_INVITE_PEPPER"],
      message:
        "COUPLE_INVITE_PEPPER debe ser un secreto independiente de al menos 32 caracteres en producción.",
    });
  }
});

const parsed = schema.parse(process.env);

export const config = {
  environment: parsed.NODE_ENV,
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
  trustProxy: parsed.TRUST_PROXY === "true",
  port: parsed.PORT,
  requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS,
  rateLimitPerMinute: parsed.RATE_LIMIT_PER_MINUTE,
  accountRateLimitPerMinute: parsed.ACCOUNT_RATE_LIMIT_PER_MINUTE,
  registerRateLimitPerMinute: parsed.REGISTER_RATE_LIMIT_PER_MINUTE,
  playerRoleId: parsed.PLAYER_ROLE_ID ?? null,
  accountInviteUrl: parsed.ACCOUNT_INVITE_URL,
  publicAppUrl: parsed.PUBLIC_APP_URL.replace(/\/+$/, "/"),
  gameId: parsed.GAME_ID,
  coupleInvitePepper: parsed.COUPLE_INVITE_PEPPER || parsed.DIRECTUS_TOKEN,
  logLevel: parsed.LOG_LEVEL,
};
