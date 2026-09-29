---
description: Remediate the skills of a target assistant so they emit real user-formatted output, with assistant logic isolated from core code.
---

# Skill Remediation

Remediate the skills of the `$ARGUMENTS` assistant so that every skill returns
real, user-facing, formatted output instead of raw JSON, mocked data, or
simulated results, and so that adding a new assistant in future never requires
editing core code.

The system already contains a generic presentation contract. This task is about
making the target assistant's skills comply with it, and about pushing every
piece of assistant-specific knowledge out of the core and into the skill layer.
Do not invent a second contract. Find and reuse the existing one.

## The isolation rule

This is the point of the exercise, and it is what every other section serves.

Core code — executors, routers, the tool registry, the shared type package, the
UI renderer — must contain **zero** knowledge of any individual assistant or
skill. It may know that a result carries a list of presentation blocks. It must
not know what those blocks are called, what they contain, which assistant
produced them, or how to lay one out.

All assistant-specific knowledge — the analysis, the vocabulary, the scoring, the
report layout, the storage location, the confirmation rules — lives inside the
skill's own source. If you find yourself wanting to add a field name, a skill id,
an assistant name, or a switch statement to a core file, that is the bug: push
it down into the skill instead.

New assistants must be addable by dropping in files under
`services/tool-executor/src/data/skills/<domain>/` and registering them in that
domain's index. Touching a core file for that purpose means the isolation is
broken.

## 1. Establish the baseline before changing anything

Never start without a known-good baseline, because you will otherwise be unable
to tell your own regressions from pre-existing failures.

1. Find the assistant's catalog entry and its full skill list, including any
   lower-order tools it delegates to.
2. Run the whole relevant test suite and record the result.
3. If anything fails, confirm it fails at baseline too:
   `git stash push -m baseline-check`, run the suite, `git stash pop`.
   Pre-existing failures are out of scope. Failures you introduced are yours.
4. Exercise every skill through the running system and save the responses.
   Save these. You will diff against them at the end.

Use the live system, not mocks, for every verification step in this document.
The UI is at `http://localhost:8080`; the direct executor is at
`http://localhost:3500`.

- Through the UI path (this is what users get, and it is the only path that
  exercises the full envelope chain):
  `POST http://localhost:8080/api/workers/assistants/<assistantId>/tools/execute`
  with `{"name":"<skill-id>","arguments":{...}}`
- Directly, for isolating a skill from transport concerns:
  `POST http://localhost:3500/api/tool-executor/tools/<skill-id>/execute`
  with an `X-Assistant-Id` header.

## 2. Find what is actually broken

For each skill, determine, with evidence, whether it:

- emits a raw JSON blob, or a schema/metadata dump, instead of something a
  person would want to read;
- fabricates its result — returns plausible-looking data that was never derived
  from the real input, hardcodes a result, fakes a downstream call, or reports
  `success: true` when nothing actually happened;
- swallows a failure. Look especially at skills that delegate to lower-order
  tools: check whether a failed nested call is caught and then discarded, so the
  outer skill still reports success. That is the single most damaging defect in
  this codebase, because it is invisible from the outside.
- returns a success status for work it did not do, or an error status for work
  it did do correctly;
- writes shape that disagrees with its own declared `outputSchema`.

Read the skill's source in the repo, not its description. Descriptions lie.

## 3. Real output, not simulated output

The acceptance bar is that every value in the output can be traced to the real
input or to real computation over it.

Derive, don't fake:

- Any measurement, score, count, or classification must be computed from the
  supplied input. If the skill reports "meter consistency 87%", that number must
  come from actually counting syllables in the lines provided.
- Never seed a "random" result from a fixed list, a date, or a counter. If
  output must be deterministic, make it a deterministic function of the input,
  and say in the report that it is derived from the input rather than from an
  external data source.
- Never insert decorative content that is not supported by the input. Content
  that is there to look like output is a mock, and mocks are the thing you were
  sent to remove.

Be honest about the boundary of real data:

- If a skill would need an external data source and none is configured, it must
  report that plainly and mark itself not-connected. It must **not** invent
  plausible numbers and attribute them to the missing source.
- A useful report derived from local analysis of the real input is legitimate.
  Label its scope accurately — state which data is computed locally and which
  would have come from outside. Do not let the user believe a local analysis is
  a measured market fact.
- Distinguish these cases in the output: worked fully, partially worked,
  and could not run. Do not collapse them.

Generate, then inspect the generated text for mechanical defects. Automated
generation drifts in predictable ways, and the defects are embarrassing and
obvious to a human reader:

- broken grammar or agreement (generated filler frequently mismatches number or
  article with its slot);
- the same line repeated where variety is expected;
- placeholder text, lorem ipsum, or TODO markers;
- empty or near-empty sections;
- duplicated headers or a title repeated immediately before its own body;
- mangled formatting, truncation, or unescaped delimiters.

Fix the generator, not the instance. If output is wrong, the template or the
word bank is wrong. Never hand-patch a single result.

## 4. Conform every skill to the generic presentation contract

Locate the contract before writing anything — it already exists in the shared
type package and the UI renderer. Read both.

Every skill, on **every** path including validation failures, partial results,
and not-connected results, must emit presentation blocks carrying the generic
block fields defined by the contract. Render a block body yourself so the
generic renderer never needs to know the domain.

Declare the presentation field in the skill's `outputSchema` and make it
required, so a skill that forgets to render is caught rather than silently shown
as a JSON dump.

Keep the block body free of any heading that merely restates the block title.
The renderer already displays the title, so repeating it wastes the user's first
line and looks like a rendering bug.

## 5. Honest delegation

For any skill that composes lower-order tools:

- propagate the nested result faithfully. If a nested call fails, the outer
  result must say so; it must not report success.
- report coverage explicitly — which lower-order tools ran, which were
  unavailable, and which inputs that leaves unassessed.
- gate anything that acts on the user's behalf behind explicit confirmation.
  Dry runs are safe to nest; live ones are not. Confirm the exact input flag
  names the confirmation path in this codebase uses — they are not always the
  ones you would guess, and using the wrong one silently disables the gate.
- verify delegation works end-to-end on the live system. A delegation that
  reports "neither lower-order tool could be executed" is a defect even when the
  surrounding report renders perfectly. Check the coverage number, not just the
  presence of a report.

## 6. Runtime validation

There is a runtime validator that checks results against the skill's own declared
`outputSchema`. Wire it into the dispatch path if it is not already, and keep it
generic — it validates against the schema the skill declares, so it needs no
knowledge of any particular skill.

Use it as a detector. After deploying, check the executor logs for validation
failures across the whole registry, not only the target assistant. It will
surface pre-existing shape mismatches elsewhere; those are worth reporting even
when they are out of scope, and fixing one is cheap when the validator points at
it.

Note that a declared `type` that does not match a value — an object that is
sometimes `null`, for example — is a real defect even when nothing crashes.

## 7. Verify what the user actually sees

A passing skill is not a passing UI. Verify the rendered result.

Render each saved live response through the real UI component, in a scratch
harness placed inside the frontend package, and assert on the output text:

- no raw JSON keys, no JSON envelope, no schema or field labels;
- no `undefined`, `NaN`, or `[object Object]`;
- no duplicated title, no error text leaking into a success render;
- the rendered result is substantial enough to be the real answer.

Two traps, both of which cost real time:

- a harness run from outside the frontend package will pick up the wrong copy of
  React and fail with an error about objects not being valid as a React child.
  Run it from inside the package and bundle it with the frontend's own bundler.
- a harness that shells out to execute skill source will not have the nested-tool
  callback the real executor injects, so delegation will appear broken in the
  harness while working fine in production. Treat delegation as unverified until
  confirmed on the live system.

Delete the scratch harness when finished.

## 8. Tests

Fix tests when the contract legitimately changed, and only then. Be honest about
which is which in your report.

- Source-string assertions — asserting a skill's source contains a particular
  identifier or literal — break on any rewrite and prove nothing about behavior.
  Replace them with assertions that execute the skill and check its result.
- Tests that encode a behavior you deliberately removed are not the obstacle;
  the old behavior is. Update the test to the new contract, and say in your
  report that you did and why.
- Check naming-convention tests before renaming a skill's display name. These
  suites often carry a transitional allowlist of pre-existing names; a rename
  that looks like an improvement can silently break one. Prefer restoring the
  allowlisted name.

Run the full suite at the end, not just the files you touched.

## 9. Build, deploy, confirm

Typecheck every package you touched. Rebuild and redeploy. Re-execute every skill
through the live UI path and re-render, so the final evidence comes from the
deployed system rather than from your local build.

Clean up scratch files, confirm the working tree contains only intended changes,
and remove temporary verification directories.

## 10. Report

Report, specifically:

- per skill, what was wrong and what it now does;
- the evidence that output is real — show the derivation, not just a status;
- any skill that cannot produce real output and why, and what it reports instead;
- validation findings outside the target assistant, flagged rather than silently
  fixed or silently ignored;
- pre-existing test failures you confirmed are pre-existing;
- any change in the working tree that is unrelated to this task — leave those
  alone and say so, rather than reverting or absorbing them.

Do not commit unless asked.
