import { TaskPerformanceMetrics } from '@cktmcs/shared';

/**
 * Self-correction module for generating lessons learned based on agent performance data
 */

export interface PerformanceAnalysis {
    agentId: string;
    currentTask: string;
    overallPerformance: {
        averageSuccessRate: number;
        totalTasks: number;
        averageQualityScore: number;
    };
    taskSpecificPerformance?: TaskPerformanceMetrics;
    recentFailures: string[];
    strengths: string[];
    weaknesses: string[];
}

export interface LessonLearned {
    lesson: string;
    reasoning: string;
    priority: 'high' | 'medium' | 'low';
    category: 'technical' | 'process' | 'quality' | 'efficiency';
}

/**
 * Analyze agent performance data and identify areas for improvement
 */
export function analyzePerformance(
    agentId: string,
    currentTask: string,
    performanceData: Map<string, TaskPerformanceMetrics>,
    recentStepResults?: Array<{ actionVerb: string; success: boolean; error?: string }>
): PerformanceAnalysis {
    const performanceArray = Array.from(performanceData.values());
    
    // Calculate overall performance metrics
    const totalTasks = performanceArray.reduce((sum, metrics) => sum + metrics.taskCount, 0);
    const averageSuccessRate = performanceArray.length > 0 
        ? performanceArray.reduce((sum, metrics) => sum + metrics.successRate, 0) / performanceArray.length
        : 0;
    const averageQualityScore = performanceArray.length > 0
        ? performanceArray.reduce((sum, metrics) => sum + metrics.qualityScore, 0) / performanceArray.length
        : 50;

    // Get task-specific performance if available
    const taskSpecificPerformance = performanceData.get(currentTask);

    // Identify recent failures from step results
    const recentFailures: string[] = [];
    if (recentStepResults) {
        recentStepResults
            .filter(result => !result.success)
            .forEach(result => {
                if (result.error) {
                    recentFailures.push(`${result.actionVerb}: ${result.error}`);
                } else {
                    recentFailures.push(`${result.actionVerb}: Failed without specific error`);
                }
            });
    }

    // Identify strengths (tasks with high success rates)
    const strengths: string[] = [];
    performanceData.forEach((metrics, task) => {
        if (metrics.successRate > 80 && metrics.taskCount > 2) {
            strengths.push(`Excellent performance in ${task} (${metrics.successRate.toFixed(1)}% success rate)`);
        }
    });

    // Identify weaknesses (tasks with low success rates or quality scores)
    const weaknesses: string[] = [];
    performanceData.forEach((metrics, task) => {
        if (metrics.successRate < 60 && metrics.taskCount > 1) {
            weaknesses.push(`Low success rate in ${task} (${metrics.successRate.toFixed(1)}%)`);
        }
        if (metrics.qualityScore < 40 && metrics.taskCount > 1) {
            weaknesses.push(`Poor quality in ${task} (score: ${metrics.qualityScore.toFixed(1)})`);
        }
    });

    return {
        agentId,
        currentTask,
        overallPerformance: {
            averageSuccessRate,
            totalTasks,
            averageQualityScore
        },
        taskSpecificPerformance,
        recentFailures,
        strengths,
        weaknesses
    };
}

/**
 * Generate a lesson learned based on performance analysis
 */
export function generateLessonLearned(analysis: PerformanceAnalysis): LessonLearned | null {
    const { currentTask, taskSpecificPerformance, recentFailures, weaknesses, overallPerformance } = analysis;

    // Priority 1: Address recent failures
    if (recentFailures.length > 0) {
        const mostCommonFailure = recentFailures[0]; // Take the first/most recent failure
        
        // Extract actionVerb and error from the failure
        const [actionVerb, error] = mostCommonFailure.split(': ');
        
        let lesson = '';
        let category: LessonLearned['category'] = 'technical';
        
        // Generate specific lessons based on common error patterns
        if (error.toLowerCase().includes('timeout')) {
            lesson = `When executing ${actionVerb} tasks, always set appropriate timeout values and implement retry logic for network operations.`;
            category = 'technical';
        } else if (error.toLowerCase().includes('missing') || error.toLowerCase().includes('required')) {
            lesson = `Before executing ${actionVerb} tasks, carefully validate that all required inputs are present and properly formatted.`;
            category = 'process';
        } else if (error.toLowerCase().includes('format') || error.toLowerCase().includes('parse')) {
            lesson = `When working with ${actionVerb} tasks, ensure data is properly formatted and validated before processing.`;
            category = 'technical';
        } else if (error.toLowerCase().includes('permission') || error.toLowerCase().includes('access')) {
            lesson = `For ${actionVerb} tasks, verify access permissions and authentication before attempting operations.`;
            category = 'technical';
        } else {
            lesson = `When ${actionVerb} tasks fail, implement proper error handling and provide clear error messages for debugging.`;
            category = 'process';
        }

        return {
            lesson,
            reasoning: `Recent failure in ${actionVerb}: ${error}`,
            priority: 'high',
            category
        };
    }

    // Priority 2: Address task-specific performance issues
    if (taskSpecificPerformance && taskSpecificPerformance.successRate < 70 && taskSpecificPerformance.taskCount > 2) {
        return {
            lesson: `Improve ${currentTask} task execution by implementing more thorough input validation and error handling. Consider breaking complex ${currentTask} operations into smaller, more manageable steps.`,
            reasoning: `Low success rate in ${currentTask}: ${taskSpecificPerformance.successRate.toFixed(1)}% over ${taskSpecificPerformance.taskCount} attempts`,
            priority: 'high',
            category: 'process'
        };
    }

    // Priority 3: Address quality issues
    if (taskSpecificPerformance && taskSpecificPerformance.qualityScore < 50 && taskSpecificPerformance.taskCount > 1) {
        return {
            lesson: `Focus on improving the quality of ${currentTask} outputs by double-checking results, providing more detailed explanations, and ensuring completeness before marking tasks as complete.`,
            reasoning: `Low quality score in ${currentTask}: ${taskSpecificPerformance.qualityScore.toFixed(1)}`,
            priority: 'medium',
            category: 'quality'
        };
    }

    // Priority 4: Address general weaknesses
    if (weaknesses.length > 0) {
        const weakness = weaknesses[0];
        const taskName = weakness.split(' ')[weakness.split(' ').length - 1].replace(/[()%]/g, '');
        
        return {
            lesson: `Strengthen performance in areas of weakness by studying successful examples and implementing best practices for consistent execution.`,
            reasoning: weakness,
            priority: 'medium',
            category: 'process'
        };
    }

    // Priority 5: Efficiency improvements for good performers
    if (overallPerformance.averageSuccessRate > 80) {
        return {
            lesson: `Continue maintaining high performance standards while looking for opportunities to optimize task execution speed and resource usage.`,
            reasoning: `Strong overall performance (${overallPerformance.averageSuccessRate.toFixed(1)}% success rate) with room for efficiency improvements`,
            priority: 'low',
            category: 'efficiency'
        };
    }

    // No specific lesson needed
    return null;
}

/**
 * Main function to generate a lesson learned from performance data
 */
export function generateSelfCorrectionLesson(
    agentId: string,
    currentTask: string,
    performanceData: Map<string, TaskPerformanceMetrics>,
    recentStepResults?: Array<{ actionVerb: string; success: boolean; error?: string }>
): LessonLearned | null {
    const analysis = analyzePerformance(agentId, currentTask, performanceData, recentStepResults);
    return generateLessonLearned(analysis);
}
