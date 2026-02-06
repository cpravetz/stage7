import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

interface DataAnalysisResult {
  toolType: 'data_analysis';
  title: string;
  chartData: Array<{
    label: string;
    value: number;
    [key: string]: any;
  }>;
  chartType: 'bar' | 'line' | 'pie' | 'scatter';
  xAxisLabel?: string;
  yAxisLabel?: string;
  insights?: string[];
}

export class DataAnalysisTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'DataAnalysisTool',
      description: 'Performs data analysis and generates visualizations. Can analyze datasets and provide insights with interactive charts.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with data analysis.',
            enum: ['analyzeDataset', 'generateChart', 'provideInsights'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific data analysis action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  /**
   * Analyzes a dataset and generates insights with visualizations.
   * @param dataset The dataset to analyze.
   * @param conversationId The conversation ID.
   * @param options Functional options for data analysis visualization and export.
   * @returns Data analysis result with chart data and insights.
   */
  public async analyzeDataset(
    dataset: Array<{ [key: string]: any }>,
    conversationId: string,
    options?: {
      analysisType?: 'trend' | 'comparison' | 'distribution' | 'correlation';
      chartType?: 'bar' | 'line' | 'pie' | 'scatter' | 'heatmap' | 'histogram';
      visualization?: {
        title?: string;
        xAxisLabel?: string;
        yAxisLabel?: string;
        colorScheme?: 'default' | 'high_contrast' | 'colorblind_safe';
      };
      exportFormat?: 'json' | 'csv' | 'png' | 'svg';
      timeRange?: { start?: string; end?: string };
      aggregation?: 'sum' | 'average' | 'count' | 'min' | 'max';
    }
  ): Promise<DataAnalysisResult> {
    const result = await this.execute({
      action: 'analyzeDataset',
      payload: {
        dataset,
        analysisType: options?.analysisType || 'comparison',
        chartType: options?.chartType,
        visualization: options?.visualization,
        exportFormat: options?.exportFormat,
        timeRange: options?.timeRange,
        aggregation: options?.aggregation,
      }
    }, conversationId);
    return { ...result, toolType: 'data_analysis' };
  }

  /**
   * Generates a specific chart type from the dataset.
   * @param dataset The dataset to visualize.
   * @param conversationId The conversation ID.
   * @param options Chart visualization and export options.
   * @returns Data analysis result with the specified chart type.
   */
  public async generateChart(
    dataset: Array<{ label: string; value: number }>,
    conversationId: string,
    options?: {
      chartType?: 'bar' | 'line' | 'pie' | 'scatter' | 'heatmap' | 'histogram';
      visualization?: {
        title?: string;
        xAxisLabel?: string;
        yAxisLabel?: string;
        colorScheme?: 'default' | 'high_contrast' | 'colorblind_safe';
      };
      exportFormat?: 'json' | 'csv' | 'png' | 'svg';
    }
  ): Promise<DataAnalysisResult> {
    const result = await this.execute({
      action: 'generateChart',
      payload: {
        dataset,
        chartType: options?.chartType || 'bar',
        visualization: options?.visualization,
        exportFormat: options?.exportFormat,
      }
    }, conversationId);
    return { ...result, toolType: 'data_analysis' };
  }

  /**
   * Provides insights from a dataset with visualization and export preferences.
   * @param dataset The dataset to analyze.
   * @param conversationId The conversation ID.
   * @param options Analysis depth, visualization style, and export format preferences.
   * @returns Data analysis result with insights.
   */
  public async provideInsights(
    dataset: Array<{ [key: string]: any }>,
    conversationId: string,
    options?: {
      question?: string;
      visualization?: {
        title?: string;
        colorScheme?: 'default' | 'high_contrast' | 'colorblind_safe';
      };
      exportFormat?: 'json' | 'csv' | 'report' | 'presentation';
      insightDepth?: 'summary' | 'comprehensive' | 'advanced';
    }
  ): Promise<DataAnalysisResult> {
    const result = await this.execute({
      action: 'provideInsights',
      payload: {
        dataset,
        question: options?.question,
        visualization: options?.visualization,
        exportFormat: options?.exportFormat,
        insightDepth: options?.insightDepth,
      }
    }, conversationId);
    return { ...result, toolType: 'data_analysis' };
  }
}