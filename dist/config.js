import { z } from 'zod';
const schema = z.object({
    OPENAI_API_KEY: z.string().optional().default(''),
    OPENAI_MODEL: z.string().min(1).default('gpt-5.6'),
    DIRECTUS_URL: z.string().url(),
    DIRECTUS_TOKEN: z.string().min(1),
    ALLOWED_ORIGINS: z.string().default('https://teanimas.com,https://census.ar'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(14000),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(60),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});
const parsed = schema.parse(process.env);
export const config = {
    openaiApiKey: parsed.OPENAI_API_KEY,
    openaiModel: parsed.OPENAI_MODEL,
    directusUrl: parsed.DIRECTUS_URL.replace(/\/+$/, ''),
    directusToken: parsed.DIRECTUS_TOKEN,
    allowedOrigins: new Set(parsed.ALLOWED_ORIGINS.split(',')
        .map((value) => value.trim())
        .filter(Boolean)),
    port: parsed.PORT,
    requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS,
    rateLimitPerMinute: parsed.RATE_LIMIT_PER_MINUTE,
    logLevel: parsed.LOG_LEVEL,
};
//# sourceMappingURL=config.js.map