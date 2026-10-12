import { describe, expect, it } from 'vitest';
import { missionIdFromWorkflowId } from './missionId';

describe('missionIdFromWorkflowId', () => {
  it('removes only the Temporal workflow prefix and preserves a prefixed mission id', () => {
    expect(missionIdFromWorkflowId('mission-mission-1791769632096'))
      .toBe('mission-1791769632096');
  });

  it('handles workflow ids whose mission id does not start with the prefix', () => {
    expect(missionIdFromWorkflowId('mission-1791769632096'))
      .toBe('1791769632096');
  });
});
