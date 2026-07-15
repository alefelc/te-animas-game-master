import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { chooseFallback } from './fallback.js';
import { chooseWithOpenAI } from './openai-director.js';
import { NextRequestSchema, NextResponseSchema, } from './schemas.js';
import { persistDecision, persistResolvedEvent, readAiSettings, } from './directus.js';
import { SlidingMinuteLimiter } from './rate-limit.js';
const limiter = new SlidingMinuteLimiter(config.rateLimitPerMinute);
function originAllowed(origin) {
    if (!origin)
        return true;
    return config.allowedOrigins.has(origin);
}
function setCors(response, origin) {
    if (origin && config.allowedOrigins.has(origin)) {
        response.setHeader('Access-Control-Allow-Origin', origin);
    }
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Max-Age', '600');
}
function json(response, status, payload) {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(payload));
}
async function readBody(request, maxBytes = 1_500_000) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > maxBytes) {
            throw new Error('El cuerpo de la solicitud es demasiado grande.');
        }
        chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
function clientKey(request) {
    const forwarded = request.headers['x-forwarded-for'];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return value?.split(',')[0]?.trim() || request.socket.remoteAddress || 'unknown';
}
const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    const origin = typeof request.headers.origin === 'string'
        ? request.headers.origin
        : undefined;
    setCors(response, origin);
    if (!originAllowed(origin)) {
        return json(response, 403, { error: 'Origen no permitido.', request_id: requestId });
    }
    if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        return response.end();
    }
    if (request.method === 'GET' && request.url === '/health') {
        return json(response, 200, {
            ok: true,
            game_master: true,
            openai_configured: Boolean(config.openaiApiKey),
        });
    }
    if (request.method !== 'POST' || request.url !== '/v1/game-master/next') {
        return json(response, 404, { error: 'Ruta no encontrada.', request_id: requestId });
    }
    if (!limiter.allow(clientKey(request))) {
        return json(response, 429, { error: 'Demasiadas solicitudes.', request_id: requestId });
    }
    const startedAt = Date.now();
    try {
        const body = NextRequestSchema.parse(await readBody(request));
        const settings = await readAiSettings(body.game_id);
        const limitedBody = {
            ...body,
            candidates: body.candidates.slice(0, settings.candidate_limit),
        };
        let responseBody;
        try {
            if (!settings.enabled) {
                throw new Error('Game Master desactivado en la configuración.');
            }
            const decision = await chooseWithOpenAI(limitedBody, {
                model: settings.model || config.openaiModel,
                timeoutMs: settings.decision_timeout_ms || config.requestTimeoutMs,
                customPrompt: settings.director_prompt,
            });
            if (!limitedBody.candidates.some((card) => card.id === decision.selected_card_id)) {
                throw new Error('El modelo eligió una carta fuera de la lista válida.');
            }
            responseBody = NextResponseSchema.parse({
                ...decision,
                host_message: settings.show_host_messages ? decision.host_message : '',
                provider: 'openai',
                model: settings.model || config.openaiModel,
                latency_ms: Date.now() - startedAt,
                fallback_used: false,
            });
        }
        catch (error) {
            console.warn(`[${requestId}] Se usó selección adaptativa local.`, error);
            const decision = chooseFallback(limitedBody);
            responseBody = NextResponseSchema.parse({
                ...decision,
                host_message: settings.show_host_messages ? decision.host_message : '',
                provider: 'adaptive_fallback',
                model: 'local-adaptive-v1',
                latency_ms: Date.now() - startedAt,
                fallback_used: true,
            });
        }
        if (settings.persist_events) {
            await Promise.allSettled([
                persistResolvedEvent(limitedBody),
                persistDecision(limitedBody, responseBody),
            ]);
        }
        return json(response, 200, responseBody);
    }
    catch (error) {
        console.error(`[${requestId}]`, error);
        return json(response, 400, {
            error: 'No se pudo preparar la próxima carta.',
            request_id: requestId,
        });
    }
});
server.listen(config.port, '0.0.0.0', () => {
    console.log(`Game Master API escuchando en el puerto ${config.port}.`);
});
//# sourceMappingURL=server.js.map