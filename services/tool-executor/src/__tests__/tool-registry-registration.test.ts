import { Tool } from '../types'
import { ToolRegistry } from '../services/ToolRegistry'
import { createCodeSkill } from '../data/skills/code-skill-factory'

describe('ToolRegistry.register() — lowerOrderTools → isSkill:false enforcement', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry()
  })

  function makeCodeSkill(options: {
    id: string
    name: string
    isSkill?: boolean
    lowerOrderTools?: string[]
    sourceCode?: string
  }): Tool {
    return createCodeSkill({
      id: options.id,
      name: options.name,
      description: 'Test tool for registration enforcement',
      manifest: {
        sourceCode: options.sourceCode ?? 'console.log("test")',
        ...(options.lowerOrderTools ? { lowerOrderTools: options.lowerOrderTools } : {}),
      },
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
      isSkill: options.isSkill,
    })
  }

  describe('scenario a — lower-order tool forced to isSkill:false even if isSkill not explicitly set', () => {
    it('forces isSkill to false when the lower-order tool has no isSkill property set', () => {
      // createCodeSkill defaults isSkill to true; delete it to simulate "not explicitly set"
      const lowerTool = makeCodeSkill({ id: 'lower-a', name: 'Lower A' })
      delete (lowerTool as { isSkill?: boolean }).isSkill

      const higherTool = makeCodeSkill({
        id: 'higher-a',
        name: 'Higher A',
        lowerOrderTools: ['lower-a'],
      })

      registry.register(lowerTool)
      registry.register(higherTool)

      const registered = registry.get('lower-a')
      expect(registered?.isSkill).toBe(false)
    })
  })

  describe('scenario b — isSkill:true with lowerOrderTools reference throws registration error', () => {
    it('throws when lower-order tool is isSkill:true and referenced in lowerOrderTools', () => {
      const lowerTool = makeCodeSkill({ id: 'lower-b', name: 'Lower B', isSkill: true })

      const higherTool = makeCodeSkill({
        id: 'higher-b',
        name: 'Higher B',
        lowerOrderTools: ['lower-b'],
      })

      registry.register(lowerTool)
      expect(() => registry.register(higherTool)).toThrow(/Registration conflict/)
    })

    it('throws when lower-order tool is isSkill:true regardless of registration order (higher first)', () => {
      const lowerTool = makeCodeSkill({ id: 'lower-b2', name: 'Lower B2', isSkill: true })

      const higherTool = makeCodeSkill({
        id: 'higher-b2',
        name: 'Higher B2',
        lowerOrderTools: ['lower-b2'],
      })

      registry.register(higherTool)
      expect(() => registry.register(lowerTool)).toThrow(/Registration conflict/)
    })
  })

  describe('scenario c — tool not referenced in lowerOrderTools keeps isSkill:true', () => {
    it('preserves isSkill:true for a standalone tool with no lowerOrderTools references', () => {
      const standaloneTool = makeCodeSkill({ id: 'standalone-c', name: 'Standalone C', isSkill: true })

      registry.register(standaloneTool)

      const registered = registry.get('standalone-c')
      expect(registered?.isSkill).toBe(true)
    })

    it('preserves isSkill:true for a higher-order tool that references lower-order tools', () => {
      const lowerTool = makeCodeSkill({ id: 'lower-c', name: 'Lower C', isSkill: false })
      const higherTool = makeCodeSkill({
        id: 'higher-c',
        name: 'Higher C',
        isSkill: true,
        lowerOrderTools: ['lower-c'],
      })

      registry.register(lowerTool)
      registry.register(higherTool)

      expect(registry.get('lower-c')?.isSkill).toBe(false)
      expect(registry.get('higher-c')?.isSkill).toBe(true)
    })
  })

  describe('scenario d — enforcement works regardless of registration order', () => {
    it('forces isSkill:false when higher-order tool registered first, lower-order registered second', () => {
      const lowerTool = makeCodeSkill({ id: 'lower-d1', name: 'Lower D1', isSkill: false })
      const higherTool = makeCodeSkill({
        id: 'higher-d1',
        name: 'Higher D1',
        lowerOrderTools: ['lower-d1'],
      })

      registry.register(higherTool)
      registry.register(lowerTool)

      expect(registry.get('lower-d1')?.isSkill).toBe(false)
    })

    it('forces isSkill:false when lower-order tool registered first, higher-order registered second', () => {
      const lowerTool = makeCodeSkill({ id: 'lower-d2', name: 'Lower D2', isSkill: false })
      const higherTool = makeCodeSkill({
        id: 'higher-d2',
        name: 'Higher D2',
        lowerOrderTools: ['lower-d2'],
      })

      registry.register(lowerTool)
      registry.register(higherTool)

      expect(registry.get('lower-d2')?.isSkill).toBe(false)
    })
  })

  describe('scenario e — isSkill:undefined referenced in lowerOrderTools gets forced to isSkill:false', () => {
    it('forces isSkill to false when isSkill is explicitly undefined', () => {
      const lowerTool = makeCodeSkill({ id: 'lower-e', name: 'Lower E' })
      ;(lowerTool as { isSkill?: boolean }).isSkill = undefined

      const higherTool = makeCodeSkill({
        id: 'higher-e',
        name: 'Higher E',
        lowerOrderTools: ['lower-e'],
      })

      registry.register(lowerTool)
      registry.register(higherTool)

      const registered = registry.get('lower-e')
      expect(registered?.isSkill).toBe(false)
    })
  })
})
