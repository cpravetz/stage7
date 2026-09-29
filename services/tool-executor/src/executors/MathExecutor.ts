import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, CredentialProvider } from '../services/CredentialProvider';

export interface MathOptions {
  expression?: string;
  values?: number[];
  operation?: 'sum' | 'mean' | 'median' | 'min' | 'max' | 'stddev';
}

export interface MathResult {
  success: boolean;
  result?: number;
  expression?: string;
  error?: string;
}

type TokenType = 'number' | 'operator' | 'lparen' | 'rparen' | 'comma' | 'identifier';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

const PUNCTUATION = ['+', '-', '*', '/', '%', '^', '(', ')', ','];

class MathError extends Error {}

/**
 * Allowed function names. Anything not in this map is rejected during parsing,
 * which is what makes identifier-based escapes (constructor, __proto__,
 * process, ...) impossible: no identifier ever reaches a lookup outside these
 * plain own-property records.
 */
const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: (x) => Math.abs(x),
  ceil: (x) => Math.ceil(x),
  floor: (x) => Math.floor(x),
  round: (x, digits) => {
    if (digits === undefined) return Math.round(x);
    if (!Number.isInteger(digits) || Math.abs(digits) > 15) {
      throw new MathError('round(x, n): n must be an integer between -15 and 15');
    }
    const factor = Math.pow(10, digits);
    // toPrecision(15) avoids the classic 1.005 -> 1 rounding artefact.
    return Math.round(Number((x * factor).toPrecision(15))) / factor;
  },
  sqrt: (x) => {
    if (x < 0) throw new MathError(`sqrt() is undefined for negative input (${x})`);
    return Math.sqrt(x);
  },
  cbrt: (x) => Math.cbrt(x),
  pow: (x, y) => Math.pow(x, y),
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  log: (x) => {
    if (x <= 0) throw new MathError(`log() is undefined for non-positive input (${x})`);
    return Math.log(x);
  },
  log2: (x) => {
    if (x <= 0) throw new MathError(`log2() is undefined for non-positive input (${x})`);
    return Math.log2(x);
  },
  log10: (x) => {
    if (x <= 0) throw new MathError(`log10() is undefined for non-positive input (${x})`);
    return Math.log10(x);
  },
  exp: (x) => Math.exp(x),
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  asin: (x) => {
    if (x < -1 || x > 1) throw new MathError(`asin() requires an argument between -1 and 1, received ${x}`);
    return Math.asin(x);
  },
  acos: (x) => {
    if (x < -1 || x > 1) throw new MathError(`acos() requires an argument between -1 and 1, received ${x}`);
    return Math.acos(x);
  },
  atan: (x) => Math.atan(x),
  atan2: (y, x) => Math.atan2(y, x),
  sign: (x) => Math.sign(x),
  hypot: (...args) => Math.hypot(...args),
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

const ALLOWED_NAMES = [...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS)].sort().join(', ');

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      const start = i;
      let seenDot = false;
      let seenExp = false;
      while (i < input.length) {
        const c = input[i];
        if (/[0-9]/.test(c)) {
          i++;
        } else if (c === '.' && !seenDot && !seenExp) {
          seenDot = true;
          i++;
        } else if ((c === 'e' || c === 'E') && !seenExp && i > start && /[0-9]/.test(input[i - 1])) {
          seenExp = true;
          i++;
          if (input[i] === '+' || input[i] === '-') i++;
          if (i >= input.length || !/[0-9]/.test(input[i])) {
            throw new MathError(`Malformed exponent in number starting at position ${start}`);
          }
        } else {
          break;
        }
      }
      const raw = input.slice(start, i);
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        throw new MathError(`Invalid number '${raw}' at position ${start}`);
      }
      tokens.push({ type: 'number', value: raw, position: start });
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      while (i < input.length && /[A-Za-z0-9_$]/.test(input[i])) i++;
      tokens.push({ type: 'identifier', value: input.slice(start, i), position: start });
      continue;
    }

    if (PUNCTUATION.includes(ch)) {
      const type: TokenType =
        ch === '(' ? 'lparen' : ch === ')' ? 'rparen' : ch === ',' ? 'comma' : 'operator';
      tokens.push({ type, value: ch, position: i });
      i++;
      continue;
    }

    throw new MathError(`Unexpected character '${ch}' at position ${i}`);
  }

  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): number {
    const value = this.parseExpression();
    if (this.pos < this.tokens.length) {
      const token = this.tokens[this.pos];
      throw new MathError(`Unexpected token '${token.value}' at position ${token.position}`);
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  // expression := term (('+' | '-') term)*
  private parseExpression(): number {
    let left = this.parseTerm();
    for (;;) {
      const token = this.peek();
      if (token && token.type === 'operator' && (token.value === '+' || token.value === '-')) {
        this.pos++;
        const right = this.parseTerm();
        left = token.value === '+' ? left + right : left - right;
      } else {
        return left;
      }
    }
  }

  // term := unary (('*' | '/' | '%') unary)*
  private parseTerm(): number {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token && token.type === 'operator' && (token.value === '*' || token.value === '/' || token.value === '%')) {
        this.pos++;
        const right = this.parseUnary();
        if (token.value === '*') {
          left = left * right;
        } else {
          if (right === 0) {
            throw new MathError(`Division by zero in '${token.value}' operation`);
          }
          left = token.value === '/' ? left / right : left % right;
        }
      } else {
        return left;
      }
    }
  }

  // unary := ('-' | '+') unary | power
  private parseUnary(): number {
    const token = this.peek();
    if (token && token.type === 'operator' && (token.value === '-' || token.value === '+')) {
      this.pos++;
      const value = this.parseUnary();
      return token.value === '-' ? -value : value;
    }
    return this.parsePower();
  }

  // power := primary ('^' unary)?   -- right associative, binds tighter than unary minus
  private parsePower(): number {
    const base = this.parsePrimary();
    const token = this.peek();
    if (token && token.type === 'operator' && token.value === '^') {
      this.pos++;
      const exponent = this.parseUnary();
      const result = Math.pow(base, exponent);
      if (!Number.isFinite(result)) {
        throw new MathError(`Result of ${base}^${exponent} is not a finite number`);
      }
      return result;
    }
    return base;
  }

  private parsePrimary(): number {
    const token = this.peek();
    if (!token) {
      throw new MathError('Unexpected end of expression');
    }

    if (token.type === 'number') {
      this.pos++;
      return Number(token.value);
    }

    if (token.type === 'lparen') {
      this.pos++;
      const value = this.parseExpression();
      const closing = this.peek();
      if (!closing || closing.type !== 'rparen') {
        throw new MathError(`Unclosed parenthesis opened at position ${token.position}`);
      }
      this.pos++;
      return value;
    }

    if (token.type === 'identifier') {
      this.pos++;
      const next = this.peek();
      const isCall = !!next && next.type === 'lparen';

      if (isCall) {
        const fn = Object.prototype.hasOwnProperty.call(FUNCTIONS, token.value)
          ? FUNCTIONS[token.value]
          : undefined;
        if (!fn) {
          throw new MathError(`Unknown function '${token.value}' at position ${token.position}`);
        }
        this.pos++; // consume '('
        const args: number[] = [];
        if (this.peek() && this.peek()!.type === 'rparen') {
          this.pos++;
        } else {
          for (;;) {
            args.push(this.parseExpression());
            const sep = this.peek();
            if (sep && sep.type === 'comma') {
              this.pos++;
              continue;
            }
            break;
          }
          const close = this.peek();
          if (!close || close.type !== 'rparen') {
            throw new MathError(`Unclosed parenthesis in call to '${token.value}' at position ${token.position}`);
          }
          this.pos++;
        }
        if (args.length === 0) {
          throw new MathError(`Function '${token.value}' requires at least one argument`);
        }
        const result = fn(...args);
        if (!Number.isFinite(result)) {
          throw new MathError(`Function '${token.value}' returned a non-finite result`);
        }
        return result;
      }

      if (Object.prototype.hasOwnProperty.call(CONSTANTS, token.value)) {
        return CONSTANTS[token.value];
      }
      throw new MathError(`Unexpected identifier '${token.value}' at position ${token.position}. Allowed names: ${ALLOWED_NAMES}`);
    }

    throw new MathError(`Unexpected token '${token.value}' at position ${token.position}`);
  }
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** True median: mean of the two middle values when the count is even. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Sample standard deviation (n - 1 denominator), which is the correct default
 * for summarising a sample of observations. For n < 2 the sample standard
 * deviation is undefined; we return 0 rather than NaN.
 */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) * (v - m), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export class MathExecutor {
  private credentialProvider = CredentialProvider;

  async execute(options: MathOptions, _credentials: ToolCredentials): Promise<MathResult> {
    const expression = typeof options.expression === 'string' ? options.expression.trim() : undefined;

    if (expression) {
      logger.info({ expression }, 'Math expression evaluation started');
      try {
        const tokens = tokenize(expression);
        if (tokens.length === 0) {
          return { success: false, error: 'Expression is empty', expression };
        }
        const result = new Parser(tokens).parse();
        if (!Number.isFinite(result)) {
          return { success: false, error: 'Result is not a finite number', expression };
        }
        logger.info({ expression, result }, 'Math expression evaluated');
        return { success: true, result, expression };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.warn({ expression, error }, 'Math expression evaluation failed');
        return { success: false, error, expression };
      }
    }

    if (Array.isArray(options.values) && options.operation) {
      const values = options.values;
      logger.info({ operation: options.operation, count: values.length }, 'Math list operation started');
      if (values.length === 0) {
        return { success: false, error: 'values must be a non-empty array of numbers' };
      }
      for (let i = 0; i < values.length; i++) {
        if (typeof values[i] !== 'number' || !Number.isFinite(values[i])) {
          return { success: false, error: `values[${i}] is not a finite number` };
        }
      }
      let result: number;
      switch (options.operation) {
        case 'sum':
          result = values.reduce((a, b) => a + b, 0);
          break;
        case 'mean':
          result = mean(values);
          break;
        case 'median':
          result = median(values);
          break;
        case 'min':
          result = Math.min(...values);
          break;
        case 'max':
          result = Math.max(...values);
          break;
        case 'stddev':
          result = stddev(values);
          break;
        default:
          return { success: false, error: `Unsupported operation: ${String(options.operation)}` };
      }
      if (!Number.isFinite(result)) {
        return { success: false, error: 'Result is not a finite number' };
      }
      logger.info({ operation: options.operation, result }, 'Math list operation completed');
      return { success: true, result, expression: `${options.operation}(${values.length} values)` };
    }

    return {
      success: false,
      error: "Provide either an 'expression' string, or both 'values' (number[]) and 'operation'.",
    };
  }
}
