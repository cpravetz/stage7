import { PluginContextManager, ContextConstraints, PluginMetadata, UsageMetrics, PluginSummary } from '../src/utils/PluginContextManager';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.MockedFunction<typeof axios>;

describe('PluginContextManager', () => {
    const MOCK_CAPABILITIES_MANAGER_URL = 'http://mock-capabilities-manager';
    let manager: PluginContextManager;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new PluginContextManager(MOCK_CAPABILITIES_MANAGER_URL);
        // Reset cache expiry to ensure refreshCache is called initially
        (manager as any).cacheExpiry = 0;
        (manager as any).pluginCache.clear();
        (manager as any).usageStats.clear();

        // Default mock for refreshCache's axios call
        mockedAxios.get.mockResolvedValue({ data: [] });
    });

    describe('constructor', () => {
        it('should initialize with the provided capabilitiesManagerUrl', () => {
            expect((manager as any).capabilitiesManagerUrl).toBe(MOCK_CAPABILITIES_MANAGER_URL);
            expect((manager as any).pluginCache).toBeInstanceOf(Map);
            expect((manager as any).usageStats).toBeInstanceOf(Map);
        });
    });

    describe('refreshCache', () => {
        it('should fetch plugins from capabilitiesManagerUrl and populate cache', async () => {
            const mockPlugins = [
                {
                    id: 'plugin1',
                    verb: 'VERB1',
                    description: 'Desc1',
                    inputDefinitions: [{ name: 'input1', required: true }],
                    outputDefinitions: [{ name: 'output1' }],
                    metadata: { category: 'test' }
                },
                {
                    id: 'plugin2',
                    verb: 'VERB2',
                    description: 'Desc2',
                    explanation: 'Exp2',
                    inputDefinitions: [],
                    outputDefinitions: [],
                },
            ];
            mockedAxios.get.mockResolvedValueOnce({ data: mockPlugins });

            await manager.refreshCache();

            expect(mockedAxios.get).toHaveBeenCalledWith(
                `http://${MOCK_CAPABILITIES_MANAGER_URL}/availablePlugins`,
                expect.objectContaining({ timeout: 10000 })
            );
            expect((manager as any).pluginCache.size).toBe(2);
            expect((manager as any).pluginCache.get('plugin1')).toEqual(expect.objectContaining({
                id: 'plugin1',
                verb: 'VERB1',
                description: 'Desc1',
                inputDefinitions: [{ name: 'input1', required: true }],
                outputDefinitions: [{ name: 'output1' }],
                metadata: { category: 'test' },
                usageStats: expect.any(Object),
            }));
            expect((manager as any).cacheExpiry).toBeGreaterThan(Date.now());
        });

        it('should handle refreshCache failure gracefully', async () => {
            mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            await expect(manager.refreshCache()).rejects.toThrow('Network error');
            expect(consoleErrorSpy).toHaveBeenCalledWith('[PluginContextManager] Failed to refresh cache:', expect.any(Error));
            expect((manager as any).pluginCache.size).toBe(0);
            consoleErrorSpy.mockRestore();
        });
    });

    describe('ensureCacheValid', () => {
        it('should call refreshCache if cache is expired', async () => {
            const refreshCacheSpy = jest.spyOn(manager, 'refreshCache');
            (manager as any).cacheExpiry = Date.now() - 1000; // Expired
            (manager as any).pluginCache.set('dummy', {} as PluginMetadata); // Not empty

            await (manager as any).ensureCacheValid();
            expect(refreshCacheSpy).toHaveBeenCalled();
        });

        it('should call refreshCache if cache is empty', async () => {
            const refreshCacheSpy = jest.spyOn(manager, 'refreshCache');
            (manager as any).cacheExpiry = Date.now() + 100000; // Not expired
            (manager as any).pluginCache.clear(); // Empty

            await (manager as any).ensureCacheValid();
            expect(refreshCacheSpy).toHaveBeenCalled();
        });

        it('should not call refreshCache if cache is valid and not empty', async () => {
            const refreshCacheSpy = jest.spyOn(manager, 'refreshCache');
            (manager as any).cacheExpiry = Date.now() + 100000; // Not expired
            (manager as any).pluginCache.set('dummy', {} as PluginMetadata); // Not empty

            await (manager as any).ensureCacheValid();
            expect(refreshCacheSpy).not.toHaveBeenCalled();
        });
    });

    describe('updateUsageStats', () => {
        let mockPlugin: PluginMetadata;

        beforeEach(() => {
            mockPlugin = {
                id: 'test-plugin',
                verb: 'TEST_VERB',
                description: 'A test plugin',
                inputDefinitions: [],
                outputDefinitions: [],
                usageStats: {
                    totalUses: 0,
                    successRate: 1.0,
                    avgExecutionTime: 100,
                    lastUsed: new Date(0)
                }
            };
            (manager as any).pluginCache.set('test-plugin', mockPlugin);
        });

        it('should add new usage metrics', async () => {
            const metrics: UsageMetrics = { executionTime: 50, success: true };
            await manager.updateUsageStats('test-plugin', true, metrics);
            expect((manager as any).usageStats.get('test-plugin')).toEqual([metrics]);
        });

        it('should update plugin metadata usage stats', async () => {
            const metrics1: UsageMetrics = { executionTime: 50, success: true };
            await manager.updateUsageStats('test-plugin', true, metrics1);

            const metrics2: UsageMetrics = { executionTime: 150, success: false };
            await manager.updateUsageStats('test-plugin', false, metrics2);

            expect(mockPlugin.usageStats?.totalUses).toBe(2);
            expect(mockPlugin.usageStats?.successRate).toBeCloseTo(0.91); // (0.9 * 1.0) + (0.1 * 1) = 1.0; (0.9 * 1.0) + (0.1 * 0) = 0.9; (0.9 * 0.9) + (0.1 * 0) = 0.81
            expect(mockPlugin.usageStats?.avgExecutionTime).toBeCloseTo(109); // (0.9 * 100) + (0.1 * 50) = 95; (0.9 * 95) + (0.1 * 150) = 85.5 + 15 = 100.5
            expect(mockPlugin.usageStats?.lastUsed).toBeInstanceOf(Date);
        });

        it('should keep only the last 100 entries', async () => {
            for (let i = 0; i < 105; i++) {
                await manager.updateUsageStats('test-plugin', true, { executionTime: i, success: true });
            }
            expect((manager as any).usageStats.get('test-plugin')?.length).toBe(100);
            expect((manager as any).usageStats.get('test-plugin')?.[0].executionTime).toBe(5);
        });
    });

    describe('scorePluginRelevance', () => {
        const mockPlugins: PluginMetadata[] = [
            {
                id: 'p1', verb: 'SEARCH', description: 'Search the web for information', inputDefinitions: [], outputDefinitions: [],
                metadata: { category: 'information' }, usageStats: { totalUses: 10, successRate: 0.9, avgExecutionTime: 100, lastUsed: new Date() }
            },
            {
                id: 'p2', verb: 'CALCULATE', description: 'Perform mathematical calculations', inputDefinitions: [], outputDefinitions: [],
                metadata: { category: 'math' }, usageStats: { totalUses: 5, successRate: 0.7, avgExecutionTime: 50, lastUsed: new Date() }
            },
            {
                id: 'p3', verb: 'WRITE_FILE', description: 'Write content to a file', inputDefinitions: [], outputDefinitions: [],
                metadata: { category: 'filesystem' }, usageStats: { totalUses: 20, successRate: 0.95, avgExecutionTime: 200, lastUsed: new Date() }
            },
            {
                id: 'p4', verb: 'FETCH_DATA', description: 'Retrieve data from a database', inputDefinitions: [], outputDefinitions: [],
                metadata: { category: 'data' }, usageStats: { totalUses: 1, successRate: 0.5, avgExecutionTime: 500, lastUsed: new Date() }
            },
        ];

        it('should score plugins based on goal keywords', () => {
            const goal = 'I need to find information on the internet';
            const constraints: ContextConstraints = { maxTokens: 1000, maxPlugins: 10 };
            const scored = (manager as any).scorePluginRelevance(goal, mockPlugins, constraints);

            const searchPlugin = scored.find(p => p.verb === 'SEARCH');
            expect(searchPlugin?.relevanceScore).toBeGreaterThan(0);
            expect(scored[0].verb).toBe('SEARCH'); // SEARCH should be highest
        });

        it('should apply bonus for priority keywords', () => {
            const goal = 'Perform a complex calculation';
            const constraints: ContextConstraints = { maxTokens: 1000, maxPlugins: 10, priorityKeywords: ['complex'] };
            const scored = (manager as any).scorePluginRelevance(goal, mockPlugins, constraints);

            const calculatePlugin = scored.find(p => p.verb === 'CALCULATE');
            expect(calculatePlugin?.relevanceScore).toBeGreaterThan(0);
            expect(scored[0].verb).toBe('CALCULATE');
        });

        it('should apply bonus for category matching', () => {
            const goal = 'I need to do some math';
            const constraints: ContextConstraints = { maxTokens: 1000, maxPlugins: 10 };
            const scored = (manager as any).scorePluginRelevance(goal, mockPlugins, constraints);

            const calculatePlugin = scored.find(p => p.verb === 'CALCULATE');
            expect(calculatePlugin?.relevanceScore).toBeGreaterThan(0);
            expect(scored[0].verb).toBe('CALCULATE');
        });

        it('should apply bonus for usage statistics', () => {
            const goal = 'any';
            const constraints: ContextConstraints = { maxTokens: 1000, maxPlugins: 10 };
            const scored = (manager as any).scorePluginRelevance(goal, mockPlugins, constraints);

            // p3 (WRITE_FILE) has highest successRate and totalUses, should score higher
            const p3 = scored.find(p => p.verb === 'WRITE_FILE');
            const p4 = scored.find(p => p.verb === 'FETCH_DATA');
            expect(p3!.relevanceScore).toBeGreaterThan(p4!.relevanceScore);
        });

        it('should apply bonus for required capabilities', () => {
            const goal = 'I need to write a file';
            const constraints: ContextConstraints = { maxTokens: 1000, maxPlugins: 10, requiredCapabilities: ['file'] };
            const scored = (manager as any).scorePluginRelevance(goal, mockPlugins, constraints);

            const writeFilePlugin = scored.find(p => p.verb === 'WRITE_FILE');
            expect(writeFilePlugin?.relevanceScore).toBeGreaterThan(10); // Should get a significant boost
            expect(scored[0].verb).toBe('WRITE_FILE');
        });

        it('should return plugins sorted by relevance score', () => {
            const goal = 'search and calculate';
            const constraints: ContextConstraints = { maxTokens: 1000, maxPlugins: 10 };
            const scored = (manager as any).scorePluginRelevance(goal, mockPlugins, constraints);

            expect(scored[0].verb).toBe('SEARCH');
            expect(scored[1].verb).toBe('CALCULATE');
        });
    });

    describe('selectOptimalPlugins', () => {
        const scoredPlugins: PluginSummary[] = [
            { verb: 'P1', description: 'Desc1', requiredInputs: [], optionalInputs: [], outputs: [], category: 'cat', relevanceScore: 10, tokenCount: 10 },
            { verb: 'P2', description: 'Desc2', requiredInputs: [], optionalInputs: [], outputs: [], category: 'cat', relevanceScore: 9, tokenCount: 20 },
            { verb: 'P3', description: 'Desc3', requiredInputs: [], optionalInputs: [], outputs: [], category: 'cat', relevanceScore: 8, tokenCount: 30 },
            { verb: 'P4', description: 'Desc4', requiredInputs: [], optionalInputs: [], outputs: [], category: 'cat', relevanceScore: 7, tokenCount: 40 },
        ];

        it('should select plugins up to maxPlugins limit', () => {
            const constraints: ContextConstraints = { maxTokens: 1000, maxPlugins: 2 };
            const selected = (manager as any).selectOptimalPlugins(scoredPlugins, constraints);
            expect(selected.length).toBe(2);
            expect(selected.map(p => p.verb)).toEqual(['P1', 'P2']);
        });

        it('should select plugins up to maxTokens limit', () => {
            const constraints: ContextConstraints = { maxTokens: 35, maxPlugins: 10 }; // P1(10) + P2(20) = 30. P3(30) would exceed.
            const selected = (manager as any).selectOptimalPlugins(scoredPlugins, constraints);
            expect(selected.length).toBe(2);
            expect(selected.map(p => p.verb)).toEqual(['P1', 'P2']);
        });

        it('should exclude specified plugins', () => {
            const constraints: ContextConstraints = { maxTokens: 1000, maxPlugins: 10, excludedPlugins: ['P2'] };
            const selected = (manager as any).selectOptimalPlugins(scoredPlugins, constraints);
            expect(selected.length).toBe(3);
            expect(selected.map(p => p.verb)).toEqual(['P1', 'P3', 'P4']);
        });

        it('should return empty array if no plugins can be selected', () => {
            const constraints: ContextConstraints = { maxTokens: 5, maxPlugins: 1 };
            const selected = (manager as any).selectOptimalPlugins(scoredPlugins, constraints);
            expect(selected.length).toBe(0);
        });
    });

    describe('summarizeDescription', () => {
        it('should truncate description to 50 words', () => {
            const longDesc = Array(60).fill('word').join(' ');
            const plugin: PluginMetadata = { id: 'p', verb: 'V', description: longDesc, inputDefinitions: [], outputDefinitions: [] };
            const summarized = (manager as any).summarizeDescription(plugin);
            expect(summarized.split(' ').length).toBe(51); // 50 words + '...' 
            expect(summarized).toContain('...');
        });

        it('should not truncate short description', () => {
            const shortDesc = 'This is a short description.';
            const plugin: PluginMetadata = { id: 'p', verb: 'V', description: shortDesc, inputDefinitions: [], outputDefinitions: [] };
            const summarized = (manager as any).summarizeDescription(plugin);
            expect(summarized).toBe(shortDesc);
        });

        it('should use explanation if description is empty', () => {
            const plugin: PluginMetadata = { id: 'p', verb: 'V', description: '', explanation: 'This is an explanation.', inputDefinitions: [], outputDefinitions: [] };
            const summarized = (manager as any).summarizeDescription(plugin);
            expect(summarized).toBe('This is an explanation.');
        });
    });

    describe('formatPluginsForLLM', () => {
        it('should format plugins correctly for LLM', () => {
            const plugins: PluginSummary[] = [
                { verb: 'P1', description: 'Desc1', requiredInputs: ['req1'], optionalInputs: [], outputs: [], category: 'cat', relevanceScore: 1, tokenCount: 1 },
                { verb: 'P2', description: 'Desc2', requiredInputs: [], optionalInputs: ['opt1'], outputs: [], category: 'cat', relevanceScore: 1, tokenCount: 1 },
            ];
            const formatted = (manager as any).formatPluginsForLLM(plugins);
            expect(formatted).toBe(
                '- P1: Desc1 (required inputs: req1)\n' +
                '- P2: Desc2'
            );
        });

        it('should handle empty required inputs', () => {
            const plugins: PluginSummary[] = [
                { verb: 'P1', description: 'Desc1', requiredInputs: [], optionalInputs: [], outputs: [], category: 'cat', relevanceScore: 1, tokenCount: 1 },
            ];
            const formatted = (manager as any).formatPluginsForLLM(plugins);
            expect(formatted).toBe('- P1: Desc1');
        });
    });

    describe('estimateTokenCount', () => {
        it('should estimate token count correctly', () => {
            expect((manager as any).estimateTokenCount('hello')).toBe(2); // 5/4 = 1.25 -> 2
            expect((manager as any).estimateTokenCount('hello world')).toBe(3); // 11/4 = 2.75 -> 3
            expect((manager as any).estimateTokenCount('')).toBe(0);
        });
    });

    describe('calculateConfidence', () => {
        it('should calculate confidence based on average relevance', () => {
            const plugins: PluginSummary[] = [
                { verb: 'P1', description: '', requiredInputs: [], optionalInputs: [], outputs: [], category: 'cat', relevanceScore: 5, tokenCount: 1 },
                { verb: 'P2', description: '', requiredInputs: [], optionalInputs: [], outputs: [], category: 'cat', relevanceScore: 10, tokenCount: 1 },
            ];
            expect((manager as any).calculateConfidence(plugins, 'goal')).toBe(0.75); // (5+10)/2 = 7.5; 7.5/10 = 0.75
        });

        it('should return 0 if no plugins', () => {
            expect((manager as any).calculateConfidence([], 'goal')).toBe(0);
        });

        it('should cap confidence at 1.0', () => {
            const plugins: PluginSummary[] = [
                { verb: 'P1', description: '', requiredInputs: [], optionalInputs: [], outputs: [], category: 'cat', relevanceScore: 15, tokenCount: 1 },
            ];
            expect((manager as any).calculateConfidence(plugins, 'goal')).toBe(1.0); // 15/10 = 1.5 -> 1.0
        });
    });

    describe('generateReasoning', () => {
        it('should generate reasoning string', () => {
            const plugins: PluginSummary[] = [
                { verb: 'P1', description: '', requiredInputs: [], optionalInputs: [], outputs: [], category: 'cat', relevanceScore: 10, tokenCount: 1 },
            ];
            const constraints: ContextConstraints = { maxTokens: 100, maxPlugins: 1 };
            const reasoning = (manager as any).generateReasoning(plugins, 'test goal', constraints);
            expect(reasoning).toBe('Selected 1 plugins based on relevance to "test goal". Top match: P1 (score: 10.0)');
        });

        it('should return no relevant plugins message if empty', () => {
            const constraints: ContextConstraints = { maxTokens: 100, maxPlugins: 1 };
            const reasoning = (manager as any).generateReasoning([], 'test goal', constraints);
            expect(reasoning).toBe('No relevant plugins found');
        });
    });

    describe('generateContext', () => {
        it('should generate full plugin context', async () => {
            const mockPlugins = [
                {
                    id: 'plugin1', verb: 'VERB1', description: 'Search the web', inputDefinitions: [], outputDefinitions: [],
                    metadata: { category: 'information' }, usageStats: { totalUses: 10, successRate: 0.9, avgExecutionTime: 100, lastUsed: new Date() }
                },
            ];
            mockedAxios.get.mockResolvedValueOnce({ data: mockPlugins });

            const goal = 'find information';
            const constraints: ContextConstraints = { maxTokens: 100, maxPlugins: 1 };

            const context = await manager.generateContext(goal, constraints);

            expect(context.relevantPlugins.length).toBe(1);
            expect(context.relevantPlugins[0].verb).toBe('VERB1');
            expect(context.totalTokens).toBeGreaterThan(0);
            expect(context.confidence).toBeGreaterThan(0);
            expect(context.reasoning).toContain('VERB1');
            expect(context.formattedString).toContain('- VERB1: Search the web');
        });
    });
});
