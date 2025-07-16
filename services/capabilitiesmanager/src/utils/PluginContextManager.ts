/**
 * Plugin Context Manager
 *
 * Manages intelligent delivery of plugin information to LLMs,
 * optimizing for relevance and token efficiency.
 */

import axios from 'axios';

export interface ContextConstraints {
    maxTokens: number;
    maxPlugins: number;
    requiredCapabilities?: string[];
    excludedPlugins?: string[];
    priorityKeywords?: string[];
}

export interface PluginSummary {
    verb: string;
    description: string;
    requiredInputs: string[];
    optionalInputs: string[];
    outputs: string[];
    category: string;
    relevanceScore: number;
    tokenCount: number;
}

export interface PluginContext {
    relevantPlugins: PluginSummary[];
    totalTokens: number;
    confidence: number;
    reasoning: string;
    formattedString: string;
}

export interface UsageMetrics {
    executionTime: number;
    success: boolean;
    errorType?: string;
    userFeedback?: number; // 1-5 rating
}

export interface PluginMetadata {
    id: string;
    verb: string;
    description: string;
    explanation?: string;
    inputDefinitions: Array<{
        name: string;
        type: string;
        description: string;
        required: boolean;
    }>;
    outputDefinitions: Array<{
        name: string;
        type: string;
        description: string;
    }>;
    metadata?: {
        category?: string;
        tags?: string[];
    };
    usageStats?: {
        totalUses: number;
        successRate: number;
        avgExecutionTime: number;
        lastUsed: Date;
    };
}

export class PluginContextManager {
    private pluginCache: Map<string, PluginMetadata> = new Map();
    private usageStats: Map<string, UsageMetrics[]> = new Map();
    private cacheExpiry: number = 0;
    private readonly CACHE_TTL_MS = 300000; // 5 minutes

    constructor(private capabilitiesManagerUrl: string) {}

    /**
     * Generate optimized plugin context for LLM consumption
     */
    async generateContext(goal: string, constraints: ContextConstraints): Promise<PluginContext> {
        await this.ensureCacheValid();
        
        const allPlugins = Array.from(this.pluginCache.values());
        const scoredPlugins = this.scorePluginRelevance(goal, allPlugins, constraints);
        const selectedPlugins = this.selectOptimalPlugins(scoredPlugins, constraints);
        
        const formattedString = this.formatPluginsForLLM(selectedPlugins);
        const totalTokens = this.estimateTokenCount(formattedString);
        
        return {
            relevantPlugins: selectedPlugins,
            totalTokens,
            confidence: this.calculateConfidence(selectedPlugins, goal),
            reasoning: this.generateReasoning(selectedPlugins, goal, constraints),
            formattedString
        };
    }

    /**
     * Update usage statistics for learning and optimization
     */
    async updateUsageStats(pluginId: string, success: boolean, metrics: UsageMetrics): Promise<void> {
        if (!this.usageStats.has(pluginId)) {
            this.usageStats.set(pluginId, []);
        }
        
        const stats = this.usageStats.get(pluginId)!;
        stats.push(metrics);
        
        // Keep only last 100 entries per plugin
        if (stats.length > 100) {
            stats.splice(0, stats.length - 100);
        }
        
        // Update cached metadata
        const plugin = this.pluginCache.get(pluginId);
        if (plugin) {
            this.updatePluginUsageStats(plugin, metrics);
        }
    }

    /**
     * Refresh plugin cache from CapabilitiesManager
     */
    async refreshCache(): Promise<void> {
        try {
            const response = await axios.get(`http://${this.capabilitiesManagerUrl}/availablePlugins`, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            const plugins = response.data;
            this.pluginCache.clear();
            
            for (const plugin of plugins) {
                const metadata: PluginMetadata = {
                    id: plugin.id,
                    verb: plugin.verb,
                    description: plugin.description || '',
                    explanation: plugin.explanation,
                    inputDefinitions: plugin.inputDefinitions || [],
                    outputDefinitions: plugin.outputDefinitions || [],
                    metadata: plugin.metadata,
                    usageStats: {
                        totalUses: 0,
                        successRate: 1.0,
                        avgExecutionTime: 1000,
                        lastUsed: new Date()
                    }
                };
                
                this.pluginCache.set(plugin.id, metadata);
            }
            
            this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;
        } catch (error) {
            console.error('[PluginContextManager] Failed to refresh cache:', error);
            throw error;
        }
    }

    private async ensureCacheValid(): Promise<void> {
        if (Date.now() > this.cacheExpiry || this.pluginCache.size === 0) {
            await this.refreshCache();
        }
    }

    private scorePluginRelevance(goal: string, plugins: PluginMetadata[], constraints: ContextConstraints): PluginSummary[] {
        const goalLower = goal.toLowerCase();
        const priorityKeywords = constraints.priorityKeywords?.map(k => k.toLowerCase()) || [];
        
        return plugins.map(plugin => {
            let score = 0;
            
            // Keyword matching in description
            const description = (plugin.description + ' ' + (plugin.explanation || '')).toLowerCase();
            const words = goalLower.split(/\s+/);
            
            for (const word of words) {
                if (description.includes(word)) {
                    score += 2;
                }
            }
            
            // Priority keyword bonus
            for (const keyword of priorityKeywords) {
                if (description.includes(keyword)) {
                    score += 5;
                }
            }
            
            // Category matching
            const category = plugin.metadata?.category || 'utility';
            if (goalLower.includes(category)) {
                score += 3;
            }
            
            // Usage statistics bonus
            const usageStats = plugin.usageStats;
            if (usageStats) {
                score += Math.min(usageStats.successRate * 2, 2);
                score += Math.min(usageStats.totalUses / 10, 1);
            }
            
            // Required capabilities check
            if (constraints.requiredCapabilities) {
                const hasRequired = constraints.requiredCapabilities.some(cap => 
                    description.includes(cap.toLowerCase())
                );
                if (hasRequired) score += 10;
            }
            
            return {
                verb: plugin.verb,
                description: this.summarizeDescription(plugin),
                requiredInputs: plugin.inputDefinitions.filter(i => i.required).map(i => i.name),
                optionalInputs: plugin.inputDefinitions.filter(i => !i.required).map(i => i.name),
                outputs: plugin.outputDefinitions.map(o => o.name),
                category,
                relevanceScore: score,
                tokenCount: this.estimateTokenCount(this.summarizeDescription(plugin))
            };
        }).sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    private selectOptimalPlugins(scoredPlugins: PluginSummary[], constraints: ContextConstraints): PluginSummary[] {
        const selected: PluginSummary[] = [];
        let totalTokens = 0;
        
        for (const plugin of scoredPlugins) {
            if (selected.length >= constraints.maxPlugins) break;
            if (totalTokens + plugin.tokenCount > constraints.maxTokens) break;
            if (constraints.excludedPlugins?.includes(plugin.verb)) continue;
            
            selected.push(plugin);
            totalTokens += plugin.tokenCount;
        }
        
        return selected;
    }

    private summarizeDescription(plugin: PluginMetadata): string {
        const base = plugin.description || plugin.explanation || '';
        // Keep descriptions under 50 words
        const words = base.split(/\s+/);
        if (words.length <= 50) return base;
        return words.slice(0, 50).join(' ') + '...';
    }

    private formatPluginsForLLM(plugins: PluginSummary[]): string {
        const lines: string[] = [];
        
        for (const plugin of plugins) {
            const inputs = plugin.requiredInputs.length > 0 
                ? ` (required inputs: ${plugin.requiredInputs.join(', ')})`
                : '';
            lines.push(`- ${plugin.verb}: ${plugin.description}${inputs}`);
        }
        
        return lines.join('\n');
    }

    private estimateTokenCount(text: string): number {
        // Rough estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }

    private calculateConfidence(plugins: PluginSummary[], goal: string): number {
        if (plugins.length === 0) return 0;
        
        const avgRelevance = plugins.reduce((sum, p) => sum + p.relevanceScore, 0) / plugins.length;
        return Math.min(avgRelevance / 10, 1.0);
    }

    private generateReasoning(plugins: PluginSummary[], goal: string, constraints: ContextConstraints): string {
        const topPlugin = plugins[0];
        if (!topPlugin) return 'No relevant plugins found';
        
        return `Selected ${plugins.length} plugins based on relevance to "${goal}". ` +
               `Top match: ${topPlugin.verb} (score: ${topPlugin.relevanceScore.toFixed(1)})`;
    }

    private updatePluginUsageStats(plugin: PluginMetadata, metrics: UsageMetrics): void {
        if (!plugin.usageStats) {
            plugin.usageStats = {
                totalUses: 0,
                successRate: 1.0,
                avgExecutionTime: 1000,
                lastUsed: new Date()
            };
        }
        
        const stats = plugin.usageStats;
        stats.totalUses++;
        stats.lastUsed = new Date();
        
        // Update success rate (exponential moving average)
        const alpha = 0.1;
        stats.successRate = (1 - alpha) * stats.successRate + alpha * (metrics.success ? 1 : 0);
        
        // Update average execution time
        stats.avgExecutionTime = (1 - alpha) * stats.avgExecutionTime + alpha * metrics.executionTime;
    }
}
