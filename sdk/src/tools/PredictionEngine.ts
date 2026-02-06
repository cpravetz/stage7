import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class PredictionEngine extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        gameData: {
          type: 'object',
          description: 'Game data for outcome prediction',
          properties: {
            teams: { type: 'array', items: { type: 'string' } },
            players: { type: 'array', items: { type: 'string' } },
            historicalPerformance: { type: 'object' },
            currentForm: { type: 'object' },
            injuries: { type: 'object' },
            venue: { type: 'string' },
            weatherConditions: { type: 'object' }
          }
        }
      },
      required: ['gameData']
    };

    const outputSchema: JsonSchema = {
      type: 'object',
      properties: {
        outcomeForecasts: {
          type: 'object',
          description: 'Predicted game outcomes with probabilities',
          properties: {
            teamAWinProbability: { type: 'number' },
            teamBWinProbability: { type: 'number' },
            drawProbability: { type: 'number' },
            overUnderProbability: { type: 'number' },
            pointSpreadProbability: { type: 'number' }
          }
        },
        gameDynamics: { type: 'string', description: 'Analysis of game dynamics' },
        predictionReports: { type: 'string', description: 'Comprehensive prediction analysis report' },
        winProbabilities: { type: 'object', description: 'Detailed win probability analysis' }
      }
    };

    super({
      name: 'PredictionEngine',
      description: 'Models potential game outcomes and evaluates probabilities using statistical analysis. Provides outcome predictions with probability assessments and game dynamic analysis.',
      inputSchema,
      outputSchema,
      coreEngineClient
    });
  }

  public async generateForecasts(gameData: any, conversationId: string): Promise<any> {
    return this.execute({ gameData }, conversationId);
  }

  public async modelOutcomeProbabilities(gameData: any, conversationId: string): Promise<any> {
    return this.execute({ gameData }, conversationId);
  }

  public async analyzeGameDynamics(gameData: any, conversationId: string): Promise<any> {
    return this.execute({ gameData }, conversationId);
  }
}