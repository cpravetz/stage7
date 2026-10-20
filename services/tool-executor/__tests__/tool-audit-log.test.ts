import fs from 'fs'
import os from 'os'
import path from 'path'
import { ToolAuditLog } from '../src/services/ToolAuditLog'
import type { AuditEventType } from '../src/types/mcp-discovery'

const TEST_DIR = path.join(os.tmpdir(), `stage7-audit-test-${process.pid}-${Math.random().toString(36).slice(2)}`)

beforeAll(() => {
  process.env.TOOL_AUDIT_LOG_DIR = TEST_DIR
})

beforeEach(() => {
  fs.rmSync(path.join(TEST_DIR, 'audit.jsonl'), { force: true })
})

afterAll(() => {
  delete process.env.TOOL_AUDIT_LOG_DIR
  fs.rmSync(TEST_DIR, { recursive: true, force: true })
})

function makeLog(): ToolAuditLog {
  return new ToolAuditLog()
}

describe('ToolAuditLog', () => {
  it('record returns an entry and recent() returns it newest first', () => {
    const log = makeLog()
    const e1 = log.record({ type: 'mcp.discovery' as AuditEventType, message: 'first' })
    const e2 = log.record({ type: 'permission.granted' as AuditEventType, message: 'second' })
    const recent = log.recent(10)
    expect(recent.map((e) => e.message)).toEqual(['second', 'first'])
    expect(recent.map((e) => e.type)).toContain('permission.granted')
  })

  it('record never throws even with missing optional fields', () => {
    const log = makeLog()
    expect(() =>
      log.record({ type: 'tool.call' as AuditEventType, message: 'minimal' }),
    ).not.toThrow()
  })

  it('byTool filters by toolId', () => {
    const log = makeLog()
    log.record({ type: 'tool.call' as AuditEventType, message: 'a', toolId: 't1' })
    log.record({ type: 'tool.call' as AuditEventType, message: 'b', toolId: 't2' })
    log.record({ type: 'tool.call' as AuditEventType, message: 'c', toolId: 't1' })
    expect(log.byTool('t1').map((e) => e.message)).toEqual(['c', 'a'])
    expect(log.byTool('t2').map((e) => e.message)).toEqual(['b'])
  })

  it('byType filters by type', () => {
    const log = makeLog()
    log.record({ type: 'permission.granted' as AuditEventType, message: 'g' })
    log.record({ type: 'permission.denied' as AuditEventType, message: 'd' })
    expect(log.byType('permission.granted' as AuditEventType).map((e) => e.message)).toEqual(['g'])
  })

  it('all is bounded', () => {
    const log = makeLog()
    for (let i = 0; i < 5; i++) log.record({ type: 'mcp.discovery' as AuditEventType, message: `m${i}` })
    expect(log.all(3).length).toBeLessThanOrEqual(3)
    expect(log.all().length).toBe(5)
  })

  it('entries getter exposes in-memory entries when dir not writable', () => {
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {
      throw new Error('not writable');
    });
    const log = new ToolAuditLog()
    mkdirSpy.mockRestore()
    const e = log.record({ type: 'tool.revoked' as AuditEventType, message: 'revoked' })
    expect(log.entries.map((x) => x.id)).toContain(e.id)
    expect(log.entries.length).toBe(1)
  })
})
