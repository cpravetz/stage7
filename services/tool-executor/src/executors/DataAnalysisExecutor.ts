import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, CredentialProvider } from '../services/CredentialProvider';

export type DataAnalysisType = 'summary' | 'trend' | 'correlation' | 'distribution';
export type ColumnType = 'number' | 'date' | 'string' | 'bool';

export interface DataAnalysisOptions {
  dataset: string | Array<Record<string, unknown>>;
  analysisType?: DataAnalysisType;
  /** Column used as the independent variable for `trend`. Defaults to the first date/number column. */
  xColumn?: string;
  /** Column used as the dependent variable for `trend`. Defaults to the first remaining numeric column. */
  yColumn?: string;
  /** Column to describe for `distribution`. Defaults to the first numeric column. */
  targetColumn?: string;
  topValuesLimit?: number;
}

export interface NumericStats {
  count: number;
  nullCount: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  stddev: number | null;
  p25: number | null;
  p75: number | null;
}

export interface CategoricalStats {
  count: number;
  nullCount: number;
  distinctCount: number;
  topValues: Array<{ value: string; count: number }>;
}

export interface ColumnSummary {
  name: string;
  type: ColumnType;
  numeric?: NumericStats;
  categorical?: CategoricalStats;
}

export interface TrendResult {
  xColumn: string;
  yColumn: string;
  slope: number;
  intercept: number;
  rSquared: number;
  direction: 'increasing' | 'decreasing' | 'flat';
  points: number;
}

export interface CorrelationPair {
  columnA: string;
  columnB: string;
  coefficient: number;
  strength: 'strong' | 'moderate' | 'weak';
}

export interface HistogramBin {
  min: number;
  max: number;
  count: number;
}

export interface DistributionResult {
  column: string;
  binCount: number;
  binningMethod: 'freedman-diaconis' | 'sturges';
  bins: HistogramBin[];
  skewness: number | null;
  skewnessInterpretation: string;
}

export interface DataAnalysisSummary {
  columns: ColumnSummary[];
  trend?: TrendResult;
  correlations?: CorrelationPair[];
  skippedCorrelations?: string[];
  distribution?: DistributionResult;
}

export interface DataAnalysisResult {
  success: boolean;
  summary?: DataAnalysisSummary;
  insights: string[];
  analysisType: DataAnalysisType;
  rowCount: number;
  columnCount: number;
  error?: string;
}

type Row = Record<string, unknown>;

const NULLISH = new Set(['', 'null', 'n/a', 'na', 'none', 'undefined', '-']);
const TRUE_VALUES = new Set(['true', 'yes', 'y', '1']);
const FALSE_VALUES = new Set(['false', 'no', 'n', '0']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

class AnalysisError extends Error {}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function isNullish(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && NULLISH.has(value.trim().toLowerCase())) return true;
  return false;
}

/**
 * RFC 4180 style CSV parser: handles quoted fields containing commas, escaped
 * double quotes (""), and embedded newlines. Ragged rows are preserved as-is
 * by the caller.
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  let sawAnyChar = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    // Skip entirely blank lines.
    if (row.length > 1 || row[0] !== '') {
      rows.push(row);
    }
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      sawAnyChar = true;
      i++;
      continue;
    }
    if (ch === ',') {
      pushField();
      sawAnyChar = true;
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      sawAnyChar = false;
      i++;
      continue;
    }
    field += ch;
    sawAnyChar = true;
    i++;
  }

  if (inQuotes) {
    throw new AnalysisError('CSV parse error: unterminated quoted field');
  }
  if (field !== '' || row.length > 0 || sawAnyChar) {
    pushRow();
  }

  return rows;
}

function looksLikeCsv(text: string): boolean {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  return firstLine.includes(',');
}

function coerceCsvValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) return Number(trimmed);
  const lowered = trimmed.toLowerCase();
  if (TRUE_VALUES.has(lowered) || FALSE_VALUES.has(lowered)) return lowered === 'true' || lowered === 'yes' || lowered === 'y' || lowered === '1';
  return raw;
}

function rowsToRecords(rows: string[][]): Row[] {
  if (rows.length === 0) {
    throw new AnalysisError('Dataset is empty');
  }
  const header = rows[0].map((h, idx) => {
    const name = h.trim();
    return name === '' ? `column_${idx + 1}` : name;
  });
  const seen = new Set<string>();
  for (let i = 0; i < header.length; i++) {
    if (seen.has(header[i])) {
      let suffix = 2;
      while (seen.has(`${header[i]}_${suffix}`)) suffix++;
      header[i] = `${header[i]}_${suffix}`;
    }
    seen.add(header[i]);
  }

  const records: Row[] = [];
  for (let r = 1; r < rows.length; r++) {
    const record: Row = {};
    // Ragged rows are tolerated: short rows get nulls, long rows get extras.
    for (let c = 0; c < header.length; c++) {
      record[header[c]] = c < rows[r].length ? coerceCsvValue(rows[r][c]) : null;
    }
    for (let c = header.length; c < rows[r].length; c++) {
      record[`column_${c + 1}`] = coerceCsvValue(rows[r][c]);
    }
    records.push(record);
  }
  return records;
}

function parseDataset(dataset: unknown): Row[] {
  if (Array.isArray(dataset)) {
    if (dataset.length === 0) {
      throw new AnalysisError('Dataset array is empty');
    }
    const flat = dataset.every((item) => item === null || typeof item !== 'object' || Array.isArray(item));
    if (flat) {
      throw new AnalysisError('Dataset array must contain objects (records), not primitives');
    }
    return dataset.map((item) => item as Row);
  }

  if (typeof dataset !== 'string') {
    throw new AnalysisError(`Unsupported dataset type '${typeof dataset}'; expected a JSON/CSV string or an array of objects`);
  }

  const text = dataset.trim();
  if (text === '') {
    throw new AnalysisError('Dataset is empty');
  }

  const firstChar = text[0];
  if (firstChar === '[' || firstChar === '{') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new AnalysisError(`JSON parse failed: ${reason}`);
    }
    if (Array.isArray(parsed)) {
      return parseDataset(parsed);
    }
    if (parsed && typeof parsed === 'object') {
      // Accept { rows: [...] } or { data: [...] } shapes.
      const container = parsed as Record<string, unknown>;
      for (const key of ['rows', 'data', 'records', 'items']) {
        if (Array.isArray(container[key])) {
          return parseDataset(container[key]);
        }
      }
      throw new AnalysisError('JSON object must contain a "rows" or "data" array of records');
    }
    throw new AnalysisError('JSON dataset must be an array of objects');
  }

  if (looksLikeCsv(text)) {
    return rowsToRecords(parseCsvRows(text));
  }

  throw new AnalysisError('Unrecognised dataset format: expected JSON (array/object) or CSV text');
}

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || NULLISH.has(trimmed.toLowerCase())) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  return null;
}

function toDateMs(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || NULLISH.has(trimmed.toLowerCase())) return null;
  if (!DATE_PATTERN.test(trimmed)) return null;
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? null : ms;
}

function toBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== 'string') return null;
  const lowered = value.trim().toLowerCase();
  if (TRUE_VALUES.has(lowered)) return true;
  if (FALSE_VALUES.has(lowered)) return false;
  return null;
}

function inferColumnType(values: unknown[]): ColumnType {
  const present = values.filter((v) => !isNullish(v));
  if (present.length === 0) return 'string';

  if (present.every((v) => toBool(v) !== null)) {
    // Only call it a bool when at least one value is a genuine boolean or a
    // true/false word; numeric 0/1 columns stay numbers.
    const hasBooleanish = present.some((v) => typeof v === 'boolean' || (typeof v === 'string' && /^(true|false|yes|no|y|n)$/i.test(v.trim())));
    if (hasBooleanish) return 'bool';
  }
  if (present.every((v) => toNumber(v) !== null)) return 'number';
  if (present.every((v) => toDateMs(v) !== null)) return 'date';
  return 'string';
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Sample standard deviation (n - 1). Returns null when undefined (n < 2). */
function sampleStddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) * (v - m), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

function numericStats(values: unknown[]): NumericStats {
  const numbers = values.map(toNumber).filter((v): v is number => v !== null);
  const sorted = [...numbers].sort((a, b) => a - b);
  return {
    count: numbers.length,
    nullCount: values.length - numbers.length,
    mean: numbers.length > 0 ? mean(numbers) : null,
    median: numbers.length > 0 ? median(numbers) : null,
    min: numbers.length > 0 ? sorted[0] : null,
    max: numbers.length > 0 ? sorted[sorted.length - 1] : null,
    stddev: sampleStddev(numbers),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
  };
}

function categoricalStats(values: unknown[], topLimit: number): CategoricalStats {
  const counts = new Map<string, number>();
  let nullCount = 0;
  for (const value of values) {
    if (isNullish(value)) {
      nullCount++;
      continue;
    }
    const key = value instanceof Date ? value.toISOString() : String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const topValues = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(1, topLimit))
    .map(([value, count]) => ({ value, count }));
  return { count: values.length - nullCount, nullCount, distinctCount: counts.size, topValues };
}

function round(value: number, digits = 4): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Analyses
// ---------------------------------------------------------------------------

function leastSquares(xs: number[], ys: number[]): { slope: number; intercept: number; rSquared: number } {
  const n = xs.length;
  const meanX = mean(xs);
  const meanY = mean(ys);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx === 0) {
    throw new AnalysisError('Cannot compute a trend: the independent variable is constant');
  }
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const rSquared = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, rSquared };
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const meanX = mean(xs);
  const meanY = mean(ys);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx === 0 || syy === 0) return null; // constant column
  return sxy / Math.sqrt(sxx * syy);
}

function sampleSkewness(values: number[]): number | null {
  const n = values.length;
  if (n < 3) return null;
  const m = mean(values);
  const m2 = values.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / n;
  if (m2 === 0) return null;
  const m3 = values.reduce((acc, v) => acc + Math.pow(v - m, 3), 0) / n;
  const g1 = m3 / Math.pow(m2, 1.5);
  // Adjust for sample bias (the standard G1 correction factor).
  return Math.sqrt((n * (n - 1))) / (n - 2) * g1;
}

function buildHistogram(sortedValues: number[]): { bins: HistogramBin[]; method: 'freedman-diaconis' | 'sturges' } {
  const n = sortedValues.length;
  const min = sortedValues[0];
  const max = sortedValues[n - 1];

  if (min === max) {
    return { bins: [{ min, max, count: n }], method: 'sturges' };
  }

  const sturges = Math.ceil(Math.log2(n) + 1);
  let binCount = sturges;
  let method: 'freedman-diaconis' | 'sturges' = 'sturges';

  const q1 = quantile(sortedValues, 0.25) as number;
  const q3 = quantile(sortedValues, 0.75) as number;
  const iqr = q3 - q1;
  if (iqr > 0) {
    const width = (2 * iqr) / Math.cbrt(n);
    if (width > 0) {
      const fd = Math.ceil((max - min) / width);
      if (fd >= 1 && fd <= 200) {
        binCount = fd;
        method = 'freedman-diaconis';
      }
    }
  }

  binCount = Math.min(Math.max(binCount, 1), 200);
  const binWidth = (max - min) / binCount;
  const bins: HistogramBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const lo = min + i * binWidth;
    const hi = i === binCount - 1 ? max : min + (i + 1) * binWidth;
    bins.push({ min: round(lo), max: round(hi), count: 0 });
  }
  for (const value of sortedValues) {
    let index = Math.floor((value - min) / binWidth);
    if (index >= binCount) index = binCount - 1;
    if (index < 0) index = 0;
    bins[index].count++;
  }
  return { bins, method };
}

function describeSkewness(skew: number | null): string {
  if (skew === null) return 'Insufficient data to measure skewness.';
  if (Math.abs(skew) < 0.5) return 'Roughly symmetric.';
  if (Math.abs(skew) < 1) return skew > 0 ? 'Moderately right-skewed.' : 'Moderately left-skewed.';
  return skew > 0 ? 'Strongly right-skewed (long tail towards high values).' : 'Strongly left-skewed (long tail towards low values).';
}

function strengthOf(r: number): 'strong' | 'moderate' | 'weak' {
  const a = Math.abs(r);
  if (a >= 0.7) return 'strong';
  if (a >= 0.4) return 'moderate';
  return 'weak';
}

function collectColumns(rows: Row[]): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return columns;
}

function columnValues(rows: Row[], column: string): unknown[] {
  return rows.map((row) => row[column]);
}

function numericColumnNames(columns: string[], types: Map<string, ColumnType>): string[] {
  return columns.filter((c) => types.get(c) === 'number');
}

export class DataAnalysisExecutor {
  private credentialProvider = CredentialProvider;

  async execute(options: DataAnalysisOptions, _credentials: ToolCredentials): Promise<DataAnalysisResult> {
    const analysisType: DataAnalysisType = options.analysisType || 'summary';
    logger.info({ analysisType }, 'Data analysis started');

    if (!['summary', 'trend', 'correlation', 'distribution'].includes(analysisType)) {
      return { success: false, insights: [], analysisType, rowCount: 0, columnCount: 0, error: `Unsupported analysisType '${String(analysisType)}'` };
    }

    let rows: Row[];
    try {
      rows = parseDataset(options.dataset);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn({ analysisType, error }, 'Data analysis failed to parse the dataset');
      return { success: false, insights: [], analysisType, rowCount: 0, columnCount: 0, error };
    }

    if (rows.length === 0) {
      return { success: false, insights: [], analysisType, rowCount: 0, columnCount: 0, error: 'Dataset contains no rows' };
    }

    const columns = collectColumns(rows);
    if (columns.length === 0) {
      return { success: false, insights: [], analysisType, rowCount: rows.length, columnCount: 0, error: 'Dataset contains no columns' };
    }

    const topLimit = typeof options.topValuesLimit === 'number' && options.topValuesLimit > 0 ? options.topValuesLimit : 5;
    const rawByColumn = new Map<string, unknown[]>();
    const types = new Map<string, ColumnType>();
    const columnSummaries: ColumnSummary[] = [];

    for (const column of columns) {
      const values = columnValues(rows, column);
      rawByColumn.set(column, values);
      const type = inferColumnType(values);
      types.set(column, type);
      const summary: ColumnSummary = { name: column, type };
      if (type === 'number' || type === 'date') {
        summary.numeric = numericStats(type === 'date' ? values.map((v) => toDateMs(v)) : values);
      } else {
        summary.categorical = categoricalStats(values, topLimit);
      }
      columnSummaries.push(summary);
    }

    const numericColumns = numericColumnNames(columns, types);
    const dateColumns = columns.filter((c) => types.get(c) === 'date');
    const summary: DataAnalysisSummary = { columns: columnSummaries };
    const insights: string[] = [];

    insights.push(`Dataset has ${rows.length} row${rows.length === 1 ? '' : 's'} and ${columns.length} column${columns.length === 1 ? '' : 's'}: ${columns.join(', ')}.`);

    for (const cs of columnSummaries) {
      if (cs.type === 'number' && cs.numeric) {
        const n = cs.numeric;
        insights.push(
          `${cs.name} is numeric: mean ${round(n.mean as number)}, median ${round(n.median as number)}, min ${round(n.min as number)}, max ${round(n.max as number)}, stddev ${n.stddev === null ? 'n/a' : round(n.stddev)}, ${n.nullCount} missing value${n.nullCount === 1 ? '' : 's'}.`
        );
        if (n.stddev === null && n.count > 0) {
          insights.push(`${cs.name} has fewer than two numeric values, so its standard deviation is undefined.`);
        }
      } else if (cs.categorical) {
        const c = cs.categorical;
        const top = c.topValues.slice(0, 3).map((t) => `${t.value} (${t.count})`).join(', ');
        insights.push(`${cs.name} is ${cs.type}: ${c.distinctCount} distinct value${c.distinctCount === 1 ? '' : 's'}${top ? `, most common: ${top}` : ''}${c.nullCount ? `, ${c.nullCount} missing` : ''}.`);
      }
    }

    try {
      if (analysisType === 'trend') {
        let xColumn = options.xColumn;
        let yColumn = options.yColumn;
        if (!yColumn) {
          yColumn = numericColumns[0];
        }
        if (!xColumn) {
          const candidates = [...dateColumns, ...numericColumns].filter((c) => c !== yColumn);
          xColumn = candidates[0];
        }
        if (!yColumn || !xColumn) {
          throw new AnalysisError('Trend analysis requires at least one numeric column; specify xColumn and yColumn');
        }
        if (!columns.includes(xColumn) || !columns.includes(yColumn)) {
          throw new AnalysisError(`Unknown column: ${!columns.includes(xColumn) ? xColumn : yColumn}`);
        }
        if (xColumn === yColumn) {
          throw new AnalysisError('xColumn and yColumn must be different');
        }

        const pairs: Array<{ x: number; y: number }> = [];
        const xs: number[] = [];
        const ys: number[] = [];
        const rawX = rawByColumn.get(xColumn) as unknown[];
        const rawY = rawByColumn.get(yColumn) as unknown[];
        for (let i = 0; i < rows.length; i++) {
          const xv = types.get(xColumn) === 'date' ? toDateMs(rawX[i]) : toNumber(rawX[i]);
          const yv = types.get(yColumn) === 'date' ? toDateMs(rawY[i]) : toNumber(rawY[i]);
          if (xv === null || yv === null) continue;
          pairs.push({ x: xv, y: yv });
          xs.push(xv);
          ys.push(yv);
        }
        if (pairs.length < 2) {
          throw new AnalysisError('Trend analysis needs at least two rows with numeric values in both columns');
        }

        const { slope, intercept, rSquared } = leastSquares(xs, ys);
        const scaleX = Math.max(...xs) - Math.min(...xs);
        const direction: TrendResult['direction'] =
          scaleX === 0 ? 'flat' : slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'flat';
        summary.trend = { xColumn, yColumn, slope: round(slope, 6), intercept: round(intercept, 6), rSquared: round(rSquared, 6), direction, points: pairs.length };

        const perPeriod = pairs.length > 1 ? Math.abs(slope * (scaleX / (pairs.length - 1))) : 0;
        const strength = rSquared >= 0.7 ? 'strong' : rSquared >= 0.4 ? 'moderate' : 'weak';
        insights.push(
          `${yColumn} shows a ${direction} ${strength} trend against ${xColumn}: slope ${round(slope, 4)} per ${xColumn} unit, r² = ${round(rSquared, 4)}, intercept ${round(intercept, 4)}.`
        );
        insights.push(`${yColumn} changes by about ${round(perPeriod, 4)} per consecutive observation across ${pairs.length} usable rows.`);
      }

      if (analysisType === 'correlation') {
        if (numericColumns.length < 2) {
          throw new AnalysisError('Correlation requires at least two numeric columns');
        }
        const pairs: CorrelationPair[] = [];
        const skipped: string[] = [];
        for (let i = 0; i < numericColumns.length; i++) {
          for (let j = i + 1; j < numericColumns.length; j++) {
            const a = numericColumns[i];
            const b = numericColumns[j];
            const rawA = rawByColumn.get(a) as unknown[];
            const rawB = rawByColumn.get(b) as unknown[];
            const xs: number[] = [];
            const ys: number[] = [];
            for (let r = 0; r < rows.length; r++) {
              const av = toNumber(rawA[r]);
              const bv = toNumber(rawB[r]);
              if (av === null || bv === null) continue;
              xs.push(av);
              ys.push(bv);
            }
            const r = pearson(xs, ys);
            if (r === null) {
              skipped.push(`${a} vs ${b}`);
              continue;
            }
            pairs.push({ columnA: a, columnB: b, coefficient: round(r, 6), strength: strengthOf(r) });
          }
        }
        summary.correlations = pairs;
        summary.skippedCorrelations = skipped;
        if (pairs.length === 0) {
          insights.push('No variable pairs could be correlated; every candidate column is constant.');
        }
        for (const pair of pairs) {
          insights.push(
            `${pair.columnA} and ${pair.columnB} have a ${pair.strength} ${pair.coefficient >= 0 ? 'positive' : 'negative'} correlation (Pearson r = ${round(pair.coefficient, 4)}).`
          );
        }
        for (const skip of skipped) {
          insights.push(`Skipped correlation ${skip} because at least one column is constant (zero variance).`);
        }
      }

      if (analysisType === 'distribution') {
        const column = options.targetColumn || numericColumns[0];
        if (!column) {
          throw new AnalysisError('Distribution analysis requires at least one numeric column; specify targetColumn');
        }
        if (!columns.includes(column)) {
          throw new AnalysisError(`Unknown column '${column}'`);
        }
        const raw = rawByColumn.get(column) as unknown[];
        const values = raw.map(toNumber).filter((v): v is number => v !== null).sort((a, b) => a - b);
        if (values.length === 0) {
          throw new AnalysisError(`Column '${column}' has no numeric values to bin`);
        }
        const { bins, method } = buildHistogram(values);
        const skewness = sampleSkewness(values);
        const interpretation = describeSkewness(skewness);
        summary.distribution = {
          column,
          binCount: bins.length,
          binningMethod: method,
          bins,
          skewness: skewness === null ? null : round(skewness, 6),
          skewnessInterpretation: interpretation,
        };
        const busiest = [...bins].sort((a, b) => b.count - a.count)[0];
        insights.push(
          `${column} spans ${round(values[0])} to ${round(values[values.length - 1])} with ${bins.length} ${method} bins; the busiest bin is ${busiest.min}–${busiest.max} (${busiest.count} value${busiest.count === 1 ? '' : 's'}).`
        );
        insights.push(`${column} skewness is ${skewness === null ? 'not computable' : round(skewness, 4)}: ${interpretation}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn({ analysisType, error }, 'Data analysis step failed');
      return { success: false, insights, analysisType, rowCount: rows.length, columnCount: columns.length, error };
    }

    logger.info({ analysisType, rowCount: rows.length, columnCount: columns.length }, 'Data analysis completed');
    return { success: true, summary, insights, analysisType, rowCount: rows.length, columnCount: columns.length };
  }
}
