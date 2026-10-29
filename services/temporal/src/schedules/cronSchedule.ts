const FIELD_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];
const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
const WEEKDAYS: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

function isValidField(
  field: string,
  minimum: number,
  maximum: number,
  names: Record<string, number> = {},
  allowQuestion = false,
): boolean {
  if (allowQuestion && field === '?') return true;
  return field.split(',').every((part) => {
    const [rangePart, stepPart, ...extra] = part.split('/');
    if (extra.length > 0) return false;
    if (stepPart !== undefined && (!/^\d+$/.test(stepPart) || Number(stepPart) < 1)) return false;
    if (rangePart === '*') return true;
    const bounds = rangePart.split('-').map((bound) => {
      if (/^\d+$/.test(bound)) return Number(bound);
      return names[bound.toUpperCase()];
    });
    if (bounds.length > 2 || bounds.some((bound) => bound === undefined)) return false;
    const start = bounds[0]!;
    const end = bounds.length === 2 ? bounds[1]! : start;
    return start >= minimum && end <= maximum && start <= end;
  });
}

export function isValidCronSchedule(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  return fields.length === FIELD_RANGES.length
    && fields.every((field, index) => {
      const range = FIELD_RANGES[index];
      if (!range) return false;
      if (index === 3) return isValidField(field, range[0], range[1], MONTHS);
      if (index === 4) return isValidField(field, range[0], range[1], WEEKDAYS, true);
      if (index === 2) return isValidField(field, range[0], range[1], {}, true);
      return isValidField(field, range[0], range[1]);
    });
}
