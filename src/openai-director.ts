import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z as z3 } from "zod/v3";
import { config } from "./config.js";
import { buildDirectorInput } from "./prompt.js";
import {
  ModelDecisionSchema,
  type ModelDecision,
  type NextRequest,
} from "./schemas.js";

// openai/helpers/zod is typed against the Zod v3 compatibility surface.
// The rest of the application keeps using the canonical Zod v4 contracts.
const OpenAIModelDecisionSchema = z3.object({
  selected_card_id: z3.string().min(1),
  phase: z3.enum([
    "warmup",
    "build",
    "intimate",
    "intense",
    "recovery",
    "peak",
    "closing",
  ]),
  strategy: z3.enum([
    "continue_scene",
    "escalate",
    "slow_down",
    "balance_players",
    "intimate_question",
    "humor_break",
    "change_style",
    "prepare_climax",
    "close_session",
  ]),
  target_tension: z3.number().int().min(0).max(100),
  target_energy: z3.number().int().min(0).max(100),
  host_message: z3.string().max(140),
  confidence: z3.number().min(0).max(1),
});

const DiagnosticProbeSchema = z3.object({
  ok: z3.literal(true),
  marker: z3.literal("TE_ANIMAS_AI_OK"),
});

const client = config.openaiApiKey
  ? new OpenAI({ apiKey: config.openaiApiKey })
  : null;

export async function chooseWithOpenAI(
  request: NextRequest,
  options: {
    model: string;
    timeoutMs: number;
    customPrompt?: string | null;
  },
): Promise<ModelDecision> {
  if (!client) {
    throw new Error("OPENAI_API_KEY no está configurada.");
  }

  const response = await client.responses.parse(
    {
      model: options.model,
      input: buildDirectorInput(request, options.customPrompt),
      text: {
        format: zodTextFormat(OpenAIModelDecisionSchema, "game_master_decision"),
      },
      max_output_tokens: 350,
    },
    {
      signal: AbortSignal.timeout(options.timeoutMs),
    },
  );

  if (!response.output_parsed) {
    throw new Error("El modelo no devolvió una decisión utilizable.");
  }

  // Revalidate the SDK result with the application's canonical Zod v4 contract.
  return ModelDecisionSchema.parse(response.output_parsed);
}

export interface OpenAiProbeResult {
  ok: true;
  model: string;
  marker: string;
  latency_ms: number;
  response_id: string | null;
}

export async function probeOpenAIModel(
  model: string,
  timeoutMs: number,
): Promise<OpenAiProbeResult> {
  if (!client) {
    throw new Error("OPENAI_API_KEY no está configurada.");
  }

  const startedAt = Date.now();
  const response = await client.responses.parse(
    {
      model,
      input: [
        {
          role: "system",
          content:
            "Sos una prueba técnica. Respondé únicamente con el objeto estructurado solicitado.",
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
    },
    { signal: AbortSignal.timeout(timeoutMs) },
  );

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
