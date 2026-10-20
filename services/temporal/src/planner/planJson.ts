/**
 * Tolerant JSON handling for planner responses.
 *
 * Local instruction-tuned models frequently return a plan that is complete and
 * semantically correct but structurally broken: a container is closed twice
 * (`...}]}},{...`), a comma is left before a closing bracket, or the response
 * is cut off before its last bracket. Those responses used to be discarded
 * whole, which burned a full model round trip per defect and eventually
 * exhausted the completion deadline.
 *
 * The repair pass below fixes structure only. It never invents, drops, or
 * rewrites a value, so the repaired document is still the model's own answer
 * and is still validated by the plan schema afterwards.
 */

export interface JsonStructureRepair {
  text: string;
  repairs: string[];
}

export interface PlanJsonParse {
  value: unknown;
  repaired: boolean;
  repairs: string[];
}

const OPENING_BRACKETS: Record<string, string> = { '{': '}', '[': ']' };

function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1] !== undefined) return fenced[1].trim();
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

/**
 * Repairs the structural defects that JSON-emitting models produce most
 * often: a container closed twice, a trailing or duplicated comma, a missing
 * closing bracket, and an unterminated string.
 */
export function repairJsonStructure(input: string): JsonStructureRepair {
  const repairs: string[] = [];
  const out: string[] = [];
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastSignificant = -1;

  const previousSignificant = (from: number): number => {
    let index = from;
    while (index >= 0 && /\s/.test(out[index] as string)) index -= 1;
    return index;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] as string;

    if (inString) {
      out.push(char);
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
        lastSignificant = out.length - 1;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out.push(char);
      lastSignificant = out.length - 1;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      out.push(char);
      lastSignificant = out.length - 1;
      continue;
    }

    if (char === '}' || char === ']') {
      const expectedOpening = char === '}' ? '{' : '[';
      const openBracket = stack[stack.length - 1];
      if (openBracket !== expectedOpening) {
        // The model closed a container that was never open, or closed it
        // twice. Drop the stray bracket and keep the document open.
        repairs.push(`dropped unmatched "${char}" at offset ${index}`);
        continue;
      }
      if (lastSignificant >= 0 && out[lastSignificant] === ',') {
        out[lastSignificant] = ' ';
        repairs.push(`removed trailing "," before "${char}" at offset ${index}`);
        lastSignificant = previousSignificant(lastSignificant - 1);
      }
      stack.pop();
      out.push(char);
      lastSignificant = out.length - 1;
      continue;
    }

    if (char === ',') {
      if (lastSignificant >= 0 && out[lastSignificant] === ',') {
        repairs.push(`dropped duplicate "," at offset ${index}`);
        continue;
      }
      out.push(char);
      lastSignificant = out.length - 1;
      continue;
    }

    out.push(char);
    if (!/\s/.test(char)) lastSignificant = out.length - 1;
  }

  if (inString) {
    if (escaped && out.length > 0) {
      out[out.length - 1] = ' ';
    }
    out.push('"');
    repairs.push('closed an unterminated string');
  }

  while (stack.length > 0) {
    const opening = stack.pop() as string;
    out.push(OPENING_BRACKETS[opening] as string);
    repairs.push(`closed unterminated "${opening}"`);
  }

  return { text: out.join(''), repairs };
}

function parseCandidate(candidate: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(candidate) };
  } catch {
    return null;
  }
}

/**
 * Extracts the plan object from a model response and repairs its structure
 * when the model closed a container twice or left the document unterminated.
 */
export function parsePlanJson(content: string): PlanJsonParse {
  const trimmed = stripCodeFence(content).replace(/"outout"\s*:/g, '"outcome":');

  const direct = parseCandidate(trimmed);
  if (direct) return { value: direct.value, repaired: false, repairs: [] };

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Planner response did not contain a JSON plan object');
  }

  const sliced = trimmed.slice(start, end + 1);
  const slicedParse = parseCandidate(sliced);
  if (slicedParse) return { value: slicedParse.value, repaired: false, repairs: [] };

  const repair = repairJsonStructure(sliced);
  if (repair.repairs.length > 0) {
    const repairedParse = parseCandidate(repair.text);
    if (repairedParse) {
      return { value: repairedParse.value, repaired: true, repairs: repair.repairs };
    }
  }

  throw new Error(
    `Planner response did not contain valid plan JSON: ${describeParseFailure(sliced)}`
    + (repair.repairs.length > 0 ? ` (structural repairs attempted: ${repair.repairs.join('; ')})` : ''),
  );
}

function describeParseFailure(candidate: string): string {
  try {
    JSON.parse(candidate);
    return 'no parse error';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
