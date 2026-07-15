import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { config } from './config.js';
import { buildDirectorInput } from './prompt.js';
import {
  ModelDecisionSchema,
  type ModelDecision,
  type NextRequest,
} from './schemas.js';

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
    throw new Error('OPENAI_API_KEY no está configurada.');
  }

  const response = await client.responses.parse({
    model: options.model,
    input: buildDirectorInput(request, options.customPrompt),
    text: {
      format: zodTextFormat(ModelDecisionSchema, 'game_master_decision'),
    },
    max_output_tokens: 350,
  }, {
    signal: AbortSignal.timeout(options.timeoutMs),
  });

  if (!response.output_parsed) {
    throw new Error('El modelo no devolvió una decisión utilizable.');
  }

  return response.output_parsed;
}
