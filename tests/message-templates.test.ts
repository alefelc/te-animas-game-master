import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('plantillas del mensaje de ritmo', () => {
  it('limita variables y prohíbe formas dobles', () => {
    const prompt = readFileSync('src/prompt.ts', 'utf8');

    expect(prompt).toContain('{{actor}}');
    expect(prompt).toContain('{{target_object}}');
    expect(prompt).toContain('Nunca escribas alternativas dobles');
    expect(prompt).toContain('hacerlo o hacerla');
  });
});
