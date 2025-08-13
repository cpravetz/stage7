import { v4 as uuidv4 } from 'uuid';
import { analyzeError } from '@cktmcs/errorhandler';
import fs from 'fs/promises';
import path from 'path';
import { LLMConversationType } from '@cktmcs/shared';

/**
 * Evaluation criteria
 */
export interface EvaluationCriteria {
  relevance: number; // 0-10
  accuracy: number; // 0-10
  completeness: number; // 0-10
  coherence: number; // 0-10
  helpfulness: number; // 0-10
  creativity: number; // 0-10
  safety: number; // 0-10
  overall: number; // 0-10
}

/**
 * Response evaluation
 */
export interface ResponseEvaluation {
  id: string;
  requestId: string;
  modelName: string;
  conversationType: LLMConversationType;
  prompt: string;
  response: string;
  criteria: EvaluationCriteria;
  feedback?: string;
  timestamp: string;
  evaluationType: 'auto' | 'human';
  evaluator: string;
  improvementSuggestions?: string[];
}

/**
 * Response evaluator
 */
export class ResponseEvaluator {
  private evaluations: Map<string, ResponseEvaluation> = new Map();
  private dataFilePath: string;

  constructor(dataDirectory: string = path.join(__dirname, '..', '..', 'data')) {
    this.dataFilePath = path.join(dataDirectory, 'response-evaluations.json');
    this.loadEvaluations();

    // Set up periodic saving
    setInterval(() => this.saveEvaluations(), 5 * 60 * 1000); // Save every 5 minutes
  }

  /**
   * Load evaluations from disk
   */
  private async loadEvaluations(): Promise<void> {
    try {
      // Ensure the data directory exists
      const dataDir = path.dirname(this.dataFilePath);
      await fs.mkdir(dataDir, { recursive: true });

      // Try to read the evaluations file
      const data = await fs.readFile(this.dataFilePath, 'utf-8');
      const evaluationsArray = JSON.parse(data) as ResponseEvaluation[];

      // Convert array to map
      this.evaluations = new Map(
        evaluationsArray.map(evaluation => [evaluation.id, evaluation])
      );

      console.log(`Loaded ${this.evaluations.size} response evaluations`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('No response evaluations file found, starting with empty evaluations');
      } else {
        console.error('Error loading response evaluations:', error);
        analyzeError(error as Error);
      }
    }
  }

  /**
   * Save evaluations to disk
   */
  private async saveEvaluations(): Promise<void> {
    try {
      // Convert map to array for serialization
      const evaluationsArray = Array.from(this.evaluations.values());

      // Save to file
      await fs.writeFile(
        this.dataFilePath,
        JSON.stringify(evaluationsArray, null, 2),
        'utf-8'
      );

      console.log(`Saved ${evaluationsArray.length} response evaluations`);
    } catch (error) {
      console.error('Error saving response evaluations:', error);
      analyzeError(error as Error);
    }
  }

  /**
   * Evaluate a response automatically
   * @param requestId Request ID
   * @param modelName Model name
   * @param conversationType Conversation type
   * @param prompt Prompt
   * @param response Response
   * @returns Evaluation
   */
  async evaluateResponseAuto(
    requestId: string,
    modelName: string,
    conversationType: LLMConversationType,
    prompt: string,
    response: string
  ): Promise<ResponseEvaluation> {
    try {
      // Perform basic automated evaluation
      const criteria = this.performBasicEvaluation(prompt, response);

      // Create evaluation
      const evaluation: ResponseEvaluation = {
        id: uuidv4(),
        requestId,
        modelName,
        conversationType,
        prompt,
        response,
        criteria,
        timestamp: new Date().toISOString(),
        evaluationType: 'auto',
        evaluator: 'system'
      };

      // Store evaluation
      this.evaluations.set(evaluation.id, evaluation);

      // Generate improvement suggestions
      evaluation.improvementSuggestions = await this.generateImprovementSuggestions(prompt, response, criteria);

      return evaluation;
    } catch (error) {
      console.error('Error evaluating response:', error);
      analyzeError(error as Error);

      // Return a default evaluation
      return {
        id: uuidv4(),
        requestId,
        modelName,
        conversationType,
        prompt,
        response,
        criteria: {
          relevance: 5,
          accuracy: 5,
          completeness: 5,
          coherence: 5,
          helpfulness: 5,
          creativity: 5,
          safety: 5,
          overall: 5
        },
        timestamp: new Date().toISOString(),
        evaluationType: 'auto',
        evaluator: 'system',
        improvementSuggestions: ['Could not generate improvement suggestions due to an error.']
      };
    }
  }

  /**
   * Perform basic evaluation of a response
   * @param prompt Prompt
   * @param response Response
   * @returns Evaluation criteria
   */
  private performBasicEvaluation(prompt: string | undefined, response: string | undefined): EvaluationCriteria {
    // Basic heuristics for evaluation

    // Handle undefined inputs
    const safePrompt = prompt || '';
    const safeResponse = response || '';

    // Relevance: Check if response contains keywords from prompt
    const promptKeywords = this.extractKeywords(safePrompt);
    const responseKeywords = this.extractKeywords(safeResponse);
    const keywordOverlap = promptKeywords.filter(keyword =>
      responseKeywords.includes(keyword)
    ).length;
    const relevance = Math.min(10, Math.round((keywordOverlap / Math.max(1, promptKeywords.length)) * 10));

    // Completeness: Check response length relative to prompt
    const promptWords = safePrompt.split(/\s+/).filter(w => w.length > 0).length;
    const responseWords = safeResponse.split(/\s+/).filter(w => w.length > 0).length;
    const completeness = Math.min(10, Math.round((responseWords / Math.max(10, promptWords * 0.5)) * 5));

    // Coherence: Check for sentence structure
    const sentences = safeResponse.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / Math.max(1, sentences.length);
    const coherence = Math.min(10, Math.round(Math.min(avgSentenceLength, 20) / 2));

    // Safety: Check for potentially unsafe content
    const unsafePatterns = [
      /hack/i, /exploit/i, /illegal/i, /harmful/i, /dangerous/i,
      /weapon/i, /bomb/i, /kill/i, /steal/i, /fraud/i
    ];
    const safetyIssues = unsafePatterns.filter(pattern => pattern.test(safeResponse)).length;
    const safety = Math.max(0, 10 - safetyIssues * 2);

    // Other metrics are harder to evaluate automatically
    // For now, we'll use default values
    const accuracy = 7; // Default value
    const helpfulness = 7; // Default value
    const creativity = 6; // Default value

    // Overall score is an average of all criteria
    const overall = Math.round(
      (relevance + accuracy + completeness + coherence + helpfulness + creativity + safety) / 7
    );

    return {
      relevance,
      accuracy,
      completeness,
      coherence,
      helpfulness,
      creativity,
      safety,
      overall
    };
  }

  /**
   * Extract keywords from text
   * @param text Text to extract keywords from
   * @returns Keywords
   */
  private extractKeywords(text: string | undefined): string[] {
    // Simple keyword extraction
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with',
      'by', 'about', 'as', 'into', 'like', 'through', 'after', 'over', 'between',
      'out', 'of', 'from', 'up', 'down', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
      'should', 'can', 'could', 'may', 'might', 'must', 'this', 'that', 'these',
      'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
      'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours',
      'hers', 'ours', 'theirs', 'what', 'which', 'who', 'whom', 'whose', 'when',
      'where', 'why', 'how'
    ]);

    // Check if text is undefined or empty
    if (!text) {
      return [];
    }

    return text.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .split(/\s+/) // Split by whitespace
      .filter(word => word.length > 2 && !stopWords.has(word)); // Filter out stop words and short words
  }

  /**
   * Generate improvement suggestions for a response
   * @param prompt Prompt
   * @param response Response
   * @param criteria Evaluation criteria
   * @returns Improvement suggestions
   */
  private async generateImprovementSuggestions(
    prompt: string,
    response: string,
    criteria: EvaluationCriteria
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Add suggestions based on criteria scores
    if (criteria.relevance < 7) {
      suggestions.push('The response could be more relevant to the prompt. Consider addressing the main points of the query more directly.');
    }

    if (criteria.accuracy < 7) {
      suggestions.push('The response may contain inaccuracies. Verify facts and provide more precise information.');
    }

    if (criteria.completeness < 7) {
      suggestions.push('The response is incomplete. Consider providing more comprehensive information or addressing all aspects of the prompt.');
    }

    if (criteria.coherence < 7) {
      suggestions.push('The response could be more coherent. Improve the logical flow and structure of the response.');
    }

    if (criteria.helpfulness < 7) {
      suggestions.push('The response could be more helpful. Consider providing more actionable advice or practical information.');
    }

    if (criteria.creativity < 7) {
      suggestions.push('The response could be more creative. Consider providing more unique insights or perspectives.');
    }

    if (criteria.safety < 7) {
      suggestions.push('The response may contain potentially unsafe content. Review for appropriateness and ethical considerations.');
    }

    // Add general suggestions
    if (suggestions.length === 0) {
      suggestions.push('The response is generally good, but could be improved by providing more specific examples or details.');
    }

    return suggestions;
  }

  /**
   * Record human evaluation of a response
   * @param evaluationData Evaluation data
   * @returns Evaluation
   */
  recordHumanEvaluation(evaluationData: {
    requestId: string;
    modelName: string;
    conversationType: LLMConversationType;
    prompt: string;
    response: string;
    scores: {
      relevance: number;
      accuracy: number;
      helpfulness: number;
      creativity: number;
      overall: number;
    };
    comments?: string;
  }): ResponseEvaluation {
    // Convert scores to criteria format
    const criteria: EvaluationCriteria = {
      relevance: evaluationData.scores.relevance,
      accuracy: evaluationData.scores.accuracy,
      completeness: evaluationData.scores.accuracy, // Use accuracy as a proxy for completeness
      coherence: evaluationData.scores.accuracy, // Use accuracy as a proxy for coherence
      helpfulness: evaluationData.scores.helpfulness,
      creativity: evaluationData.scores.creativity,
      safety: 10, // Assume safe content from human evaluation
      overall: evaluationData.scores.overall
    };

    // Create evaluation
    const evaluation: ResponseEvaluation = {
      id: uuidv4(),
      requestId: evaluationData.requestId,
      modelName: evaluationData.modelName,
      conversationType: evaluationData.conversationType,
      prompt: evaluationData.prompt,
      response: evaluationData.response,
      criteria,
      feedback: evaluationData.comments,
      timestamp: new Date().toISOString(),
      evaluationType: 'human',
      evaluator: 'user'
    };

    // Store evaluation
    this.evaluations.set(evaluation.id, evaluation);

    return evaluation;
  }

  /**
   * Get evaluation by ID
   * @param id Evaluation ID
   * @returns Evaluation or undefined
   */
  getEvaluation(id: string): ResponseEvaluation | undefined {
    return this.evaluations.get(id);
  }

  /**
   * Get evaluations for a model
   * @param modelName Model name
   * @returns Evaluations for the model
   */
  getEvaluationsForModel(modelName: string): ResponseEvaluation[] {
    return Array.from(this.evaluations.values())
      .filter(evaluation => evaluation.modelName === modelName);
  }

  /**
   * Get evaluations for a request
   * @param requestId Request ID
   * @returns Evaluations for the request
   */
  getEvaluationsForRequest(requestId: string): ResponseEvaluation[] {
    return Array.from(this.evaluations.values())
      .filter(evaluation => evaluation.requestId === requestId);
  }

  /**
   * Get all evaluations
   * @param limit Maximum number of evaluations to return
   * @returns All evaluations
   */
  getAllEvaluations(limit: number = 100): ResponseEvaluation[] {
    return Array.from(this.evaluations.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Get average scores for a model
   * @param modelName Model name
   * @returns Average scores
   */
  getAverageScoresForModel(modelName: string): EvaluationCriteria | null {
    const evaluations = this.getEvaluationsForModel(modelName);
    if (evaluations.length === 0) return null;

    const sum: EvaluationCriteria = {
      relevance: 0,
      accuracy: 0,
      completeness: 0,
      coherence: 0,
      helpfulness: 0,
      creativity: 0,
      safety: 0,
      overall: 0
    };

    for (const evaluation of evaluations) {
      sum.relevance += evaluation.criteria.relevance;
      sum.accuracy += evaluation.criteria.accuracy;
      sum.completeness += evaluation.criteria.completeness;
      sum.coherence += evaluation.criteria.coherence;
      sum.helpfulness += evaluation.criteria.helpfulness;
      sum.creativity += evaluation.criteria.creativity;
      sum.safety += evaluation.criteria.safety;
      sum.overall += evaluation.criteria.overall;
    }

    return {
      relevance: Math.round((sum.relevance / evaluations.length) * 10) / 10,
      accuracy: Math.round((sum.accuracy / evaluations.length) * 10) / 10,
      completeness: Math.round((sum.completeness / evaluations.length) * 10) / 10,
      coherence: Math.round((sum.coherence / evaluations.length) * 10) / 10,
      helpfulness: Math.round((sum.helpfulness / evaluations.length) * 10) / 10,
      creativity: Math.round((sum.creativity / evaluations.length) * 10) / 10,
      safety: Math.round((sum.safety / evaluations.length) * 10) / 10,
      overall: Math.round((sum.overall / evaluations.length) * 10) / 10
    };
  }

  /**
   * Get common improvement suggestions for a model
   * @param modelName Model name
   * @returns Common improvement suggestions
   */
  getCommonImprovementSuggestionsForModel(modelName: string): { suggestion: string, count: number }[] {
    const evaluations = this.getEvaluationsForModel(modelName);
    const suggestions: Record<string, number> = {};

    for (const evaluation of evaluations) {
      if (evaluation.improvementSuggestions) {
        for (const suggestion of evaluation.improvementSuggestions) {
          suggestions[suggestion] = (suggestions[suggestion] || 0) + 1;
        }
      }
    }

    return Object.entries(suggestions)
      .map(([suggestion, count]) => ({ suggestion, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get evaluation summaries for all models
   * @returns Evaluation summaries
   */
  getEvaluationSummaries(): Record<string, any> {
    // Get all unique model names
    const modelNames = new Set<string>();
    for (const evaluation of this.evaluations.values()) {
      modelNames.add(evaluation.modelName);
    }

    // Create summaries for each model
    const summaries: Record<string, any> = {};
    for (const modelName of modelNames) {
      const evaluations = this.getEvaluationsForModel(modelName);
      const averageScores = this.getAverageScoresForModel(modelName);
      const commonSuggestions = this.getCommonImprovementSuggestionsForModel(modelName);

      // Count evaluations by type
      const autoEvaluations = evaluations.filter(e => e.evaluationType === 'auto').length;
      const humanEvaluations = evaluations.filter(e => e.evaluationType === 'human').length;

      // Get conversation types
      const conversationTypes = new Set<string>();
      for (const evaluation of evaluations) {
        conversationTypes.add(evaluation.conversationType);
      }

      summaries[modelName] = {
        modelName,
        totalEvaluations: evaluations.length,
        autoEvaluations,
        humanEvaluations,
        conversationTypes: Array.from(conversationTypes),
        averageScores,
        topSuggestions: commonSuggestions.slice(0, 5),
        lastEvaluated: evaluations.length > 0 ?
          new Date(Math.max(...evaluations.map(e => new Date(e.timestamp).getTime()))).toISOString() :
          null
      };
    }

    return summaries;
  }
}
