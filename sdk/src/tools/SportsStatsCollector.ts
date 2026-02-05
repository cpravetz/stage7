import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class SportsStatsCollector extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        dataSources: {
          type: 'object',
          description: 'Specifications for sports statistics data sources',
          properties: {
            sports: { type: 'array', items: { type: 'string' } },
            leagues: { type: 'array', items: { type: 'string' } },
            teams: { type: 'array', items: { type: 'string' } },
            players: { type: 'array', items: { type: 'string' } },
            timeRange: { type: 'string', description: 'Time range for statistics' },
            statCategories: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      required: ['dataSources']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        sportsStatistics: {
          type: 'object',
          description: 'Processed sports statistics data',
          properties: {
            teamStats: { type: 'object' },
            playerStats: { type: 'object' },
            leagueStats: { type: 'object' },
            qualityMetrics: { type: 'object' }
          }
        },
        statisticalReports: { type: 'string', description: 'Comprehensive statistical analysis report' },
        performanceDatabaseUpdate: { type: 'object', description: 'Updated performance database information' }
      }
    };

    super({
      name: 'SportsStatsCollector',
      description: 'Retrieves comprehensive sports statistics and performance data from multiple sources. Provides processed sports statistics with quality validation and performance metrics.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async gatherData(dataSources: any, conversationId: string): Promise<any> {
    return this.execute({ dataSources }, conversationId);
  }

  public async processSportsStats(dataSources: any, conversationId: string): Promise<any> {
    return this.execute({ dataSources }, conversationId);
  }
}