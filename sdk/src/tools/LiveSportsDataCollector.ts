import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class LiveSportsDataCollector extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        gameData: {
          type: 'object',
          description: 'Live game specifications for data collection',
          properties: {
            sport: { type: 'string', enum: ['football', 'basketball', 'baseball', 'hockey', 'soccer', 'tennis'] },
            league: { type: 'string' },
            teams: { type: 'array', items: { type: 'string' } },
            gameId: { type: 'string', description: 'Unique game identifier' },
            dataTypes: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      required: ['gameData']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        liveSportsData: {
          type: 'object',
          description: 'Real-time sports data and live game statistics',
          properties: {
            currentScore: { type: 'object' },
            gameClock: { type: 'string' },
            playerStats: { type: 'object' },
            teamStats: { type: 'object' },
            gameEvents: { type: 'array', items: { type: 'object' } }
          }
        },
        liveReports: { type: 'string', description: 'Comprehensive live sports data report' },
        realTimeDatabaseUpdate: { type: 'object', description: 'Updated real-time database information' }
      }
    };

    super({
      name: 'LiveSportsDataCollector',
      description: 'Retrieves real-time sports data and live game statistics for in-game analysis. Provides real-time sports data with live statistics and game event tracking.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async gatherRealTimeData(gameData: any, conversationId: string): Promise<any> {
    return this.execute({ gameData }, conversationId);
  }

  public async processLiveStatistics(gameData: any, conversationId: string): Promise<any> {
    return this.execute({ gameData }, conversationId);
  }

  public async trackGameEvents(gameData: any, conversationId: string): Promise<any> {
    return this.execute({ gameData }, conversationId);
  }
}