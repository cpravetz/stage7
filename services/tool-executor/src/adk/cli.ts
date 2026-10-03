/**
 * `adk:validate` — checks every Assistant blueprint against the checklist.
 *
 * Run from the tool-executor package:
 *
 *     npm run adk:validate              # all Assistants
 *     npm run adk:validate -- career    # one Assistant
 *
 * Exits non-zero when any Assistant has an error-level finding, so it can gate
 * a build. Warnings are printed and do not fail the run.
 */

import { buildCatalog } from './bootstrap';
import { validateCatalog } from './catalog';
import { formatReport } from './validate';

function main(): number {
  const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));

  let catalog;
  try {
    catalog = buildCatalog();
  } catch (error) {
    // A folder that will not load is a validation failure in itself; reporting
    // it as a crash would hide which Assistant is at fault.
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }

  const reports = validateCatalog(catalog).filter(
    (report) => requested.length === 0 || requested.includes(report.assistantId),
  );

  if (reports.length === 0) {
    process.stderr.write(
      `no Assistant matched ${requested.join(', ')}; known ids: ${[...catalog.order].join(', ')}\n`,
    );
    return 1;
  }

  let errors = 0;
  let warnings = 0;
  for (const report of reports) {
    process.stdout.write(`${formatReport(report)}\n`);
    for (const finding of report.findings) {
      if (finding.severity === 'error') errors += 1;
      else warnings += 1;
    }
  }

  const checked = reports.length;
  process.stdout.write(
    `\n${checked} Assistant${checked === 1 ? '' : 's'} checked, ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}.\n`,
  );
  return errors > 0 ? 1 : 0;
}

process.exitCode = main();
