import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { config } from "./config.js";
import { buildDirectorInput } from "./prompt.js";
import { ModelDecisionSchema, } from "./schemas.js";
const client = config.openaiApiKey
    ? new OpenAI({ apiKey: config.openaiApiKey })
    : null;
export async function chooseWithOpenAI(request, options) {
    if (!client) {
        throw new Error("OPENAI_API_KEY no está configurada.");
    }
    const response = await client.responses.parse({
        model: options.model,
        input: buildDirectorInput(request, options.customPrompt),
        text: {
            format: zodTextFormat(ModelDecisionSchema, "game_master_decision"),
        },
        max_output_tokens: 350,
    }, {
        signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (!response.output_parsed) {
        throw new Error("El modelo no devolvió una decisión utilizable.");
    }
    return response.output_parsed;
}
const DiagnosticProbeSchema = z.object({
    ok: z.literal(true),
    marker: z.literal("TE_ANIMAS_AI_OK"),
});
export async function probeOpenAIModel(model, timeoutMs) {
    if (!client) {
        throw new Error("OPENAI_API_KEY no está configurada.");
    }
    const startedAt = Date.now();
    const response = await client.responses.parse({
        model,
        input: [
            {
                role: "system",
                content: "Sos una prueba técnica. Respondé únicamente con el objeto estructurado solicitado.",
            },
            {
                role: "user",
                content: "Confirmá que la conexión funciona.",
            },
        ],
        text: {
            format: zodTextFormat(DiagnosticProbeSchema, "te_animas_ai_probe"),
        },
        max_output_tokens: 200,
    }, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.output_parsed) {
        throw new Error("OpenAI respondió, pero no devolvió la prueba estructurada.");
    }
    return {
        ok: true,
        model,
        marker: response.output_parsed.marker,
        latency_ms: Date.now() - startedAt,
        response_id: typeof response.id === "string" ? response.id : null,
    };
}
//# sourceMappingURL=openai-director.js.map