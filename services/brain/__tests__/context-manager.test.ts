import { ContextManager } from '../src/services/ContextManager';

describe('ContextManager entity memory nudges', () => {
  it('formats active entity memories as concise prompt-head content', () => {
    const nudge = new ContextManager().formatMemoryNudges([{
      summary: 'Current contract review',
      preferences: ['Concise reports'],
      constraints: ['Use current law'],
      decisions: ['Escalate unusual indemnity terms'],
    }]);

    expect(nudge).toContain('Relevant entity memory');
    expect(nudge).toContain('Preference: Concise reports');
    expect(nudge).toContain('Constraint: Use current law');
    expect(nudge).toContain('Decision: Escalate unusual indemnity terms');
  });

  it('does not inject an empty nudge', () => {
    expect(new ContextManager().formatMemoryNudges([])).toBe('');
  });
});
