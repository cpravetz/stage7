/**
 * Backwards-compatible barrel.
 *
 * The Skill factories moved into the Agent Development Kit proper, alongside the
 * tier, schema-version and trigger rules that govern what they produce. This
 * module keeps the historical import path working so nothing outside the ADK
 * has to care where the implementation lives.
 */

export * from '../../adk/code-skill-factory';
