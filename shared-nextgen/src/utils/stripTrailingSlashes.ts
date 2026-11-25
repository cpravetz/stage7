/**
 * Removes trailing slashes without a regex: string-manipulation regexes over
 * uncontrolled input (URL paths) trip ReDoS scanners, and a loop is linear.
 */
export function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}
