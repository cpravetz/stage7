import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SynthesizedSkillRef } from '@stage7-nextgen/shared';

export interface SynthesizedSkillInput {
  assistantId: string;
  skillsDir: string;
  skillId: string;
  name: string;
  description?: string;
  language: 'bash' | 'python' | 'typescript' | 'javascript';
  code: string;
  validatedAt?: Date;
}

export interface SynthesizedSkillWriteResult {
  ref: SynthesizedSkillRef;
  path: string;
  hash: string;
}

export function writeSynthesizedSkill(input: SynthesizedSkillInput): SynthesizedSkillWriteResult {
  const ext = input.language === 'python' ? 'py' : input.language === 'bash' ? 'sh' : 'ts';
  const fileName = `${input.skillId}.${ext}`;
  const relPath = join('skills', fileName);
  const fullPath = join(input.skillsDir, fileName);
  mkdirSync(dirname(fullPath), { recursive: true });

  const hash = createHash('sha256').update(input.code).digest('hex');
  const validatedAt = input.validatedAt ?? new Date();

  const header = `/**\n * @synthesized true\n * @skillId ${input.skillId}\n * @hash ${hash}\n * @validatedAt ${validatedAt.toISOString()}\n */\n`;
  writeFileSync(fullPath, header + input.code, 'utf8');

  const ref: SynthesizedSkillRef = {
    skillId: input.skillId,
    name: input.name,
    description: input.description,
    source: 'synthesized',
    path: relPath,
    hash,
    createdAt: new Date(),
    validatedAt,
    language: input.language,
  };

  return { ref, path: relPath, hash };
}
