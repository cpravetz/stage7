import axios from 'axios';

interface MissingInputContext {
    pluginName: string;
    actionVerb: string;
    missingInputs: string[];
    availableInputs: Record<string, any>;
    stepContext: {
        goal: string;
        previousSteps: any[];
        currentStepDescription: string;
    };
}

interface ResolvedInput {
    inputName: string;
    value?: string;
    outputName?: string;
    valueType: string;
    source: 'brain' | 'previous_step' | 'default';
}

export class InputResolver {
    private brainUrl: string;

    constructor() {
        this.brainUrl = process.env.BRAIN_URL || 'http://brain:5070';
    }

    /**
     * Resolve missing inputs using Brain assistance and context analysis
     */
    async resolveMissingInputs(context: MissingInputContext): Promise<ResolvedInput[]> {
        const resolvedInputs: ResolvedInput[] = [];

        for (const inputName of context.missingInputs) {
            try {
                const resolved = await this.resolveInput(inputName, context);
                if (resolved) {
                    resolvedInputs.push(resolved);
                }
            } catch (error) {
                console.warn(`Failed to resolve input ${inputName}:`, error);
                // Continue with other inputs
            }
        }

        return resolvedInputs;
    }

    /**
     * Resolve a single input using various strategies
     */
    private async resolveInput(inputName: string, context: MissingInputContext): Promise<ResolvedInput | null> {
        // Strategy 1: Check if we can derive from previous steps
        const fromPreviousStep = this.findInputFromPreviousSteps(inputName, context);
        if (fromPreviousStep) {
            return fromPreviousStep;
        }

        // Strategy 2: Use Brain to generate appropriate input
        const fromBrain = await this.generateInputWithBrain(inputName, context);
        if (fromBrain) {
            return fromBrain;
        }

        // Strategy 3: Use default values for common inputs
        const defaultValue = this.getDefaultValue(inputName, context.actionVerb);
        if (defaultValue) {
            return {
                inputName,
                value: defaultValue,
                valueType: 'string',
                source: 'default'
            };
        }

        return null;
    }

    /**
     * Find input value from previous steps' outputs
     */
    private findInputFromPreviousSteps(inputName: string, context: MissingInputContext): ResolvedInput | null {
        for (let i = context.stepContext.previousSteps.length - 1; i >= 0; i--) {
            const step = context.stepContext.previousSteps[i];
            const outputs = step.outputs || {};

            // Direct match
            if (outputs[inputName]) {
                return {
                    inputName,
                    outputName: inputName,
                    valueType: 'string',
                    source: 'previous_step'
                };
            }

            // Semantic match for common patterns
            const semanticMatch = this.findSemanticMatch(inputName, outputs);
            if (semanticMatch) {
                return {
                    inputName,
                    outputName: semanticMatch,
                    valueType: 'string',
                    source: 'previous_step'
                };
            }
        }

        return null;
    }

    /**
     * Find semantic matches between input names and available outputs
     */
    private findSemanticMatch(inputName: string, outputs: Record<string, any>): string | null {
        const inputLower = inputName.toLowerCase();
        const outputKeys = Object.keys(outputs);

        // Common semantic mappings
        const semanticMappings: Record<string, string[]> = {
            'url': ['link', 'website', 'address', 'endpoint'],
            'searchterm': ['query', 'keywords', 'search', 'term'],
            'text': ['content', 'data', 'input', 'message'],
            'code': ['script', 'program', 'source'],
            'filename': ['file', 'path', 'name']
        };

        // Check direct semantic mappings
        for (const [canonical, alternatives] of Object.entries(semanticMappings)) {
            if (inputLower === canonical || alternatives.includes(inputLower)) {
                // Find matching output
                for (const outputKey of outputKeys) {
                    const outputLower = outputKey.toLowerCase();
                    if (outputLower === canonical || alternatives.includes(outputLower)) {
                        return outputKey;
                    }
                }
            }
        }

        // Fuzzy matching for similar names
        for (const outputKey of outputKeys) {
            if (this.calculateSimilarity(inputLower, outputKey.toLowerCase()) > 0.7) {
                return outputKey;
            }
        }

        return null;
    }

    /**
     * Calculate string similarity using Levenshtein distance
     */
    private calculateSimilarity(str1: string, str2: string): number {
        const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + indicator
                );
            }
        }

        const maxLength = Math.max(str1.length, str2.length);
        return maxLength === 0 ? 1 : (maxLength - matrix[str2.length][str1.length]) / maxLength;
    }

    /**
     * Generate input value using Brain
     */
    private async generateInputWithBrain(inputName: string, context: MissingInputContext): Promise<ResolvedInput | null> {
        try {
            const prompt = this.buildBrainPrompt(inputName, context);

            // Use axios directly since we're not extending BaseEntity
            const response = await axios.post(`${this.brainUrl}/chat`, {
                messages: [{ role: 'user', content: prompt }],
                conversationType: 'TextToText',
                temperature: 0.1
            }, {
                timeout: 30000, // 30 second timeout
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data?.response) {
                const generatedValue = response.data.response.trim();

                // Validate the generated value
                if (this.validateGeneratedInput(inputName, generatedValue, context.actionVerb)) {
                    return {
                        inputName,
                        value: generatedValue,
                        valueType: this.inferValueType(inputName, generatedValue),
                        source: 'brain'
                    };
                }
            }
        } catch (error) {
            console.warn(`Brain failed to generate input for ${inputName}:`, error);
        }

        return null;
    }

    /**
     * Build prompt for Brain to generate missing input
     */
    private buildBrainPrompt(inputName: string, context: MissingInputContext): string {
        return `You are helping to resolve a missing input for a plugin execution.

CONTEXT:
- Plugin: ${context.pluginName} (${context.actionVerb})
- Missing Input: ${inputName}
- Goal: ${context.stepContext.goal}
- Current Step: ${context.stepContext.currentStepDescription}

AVAILABLE CONTEXT:
${JSON.stringify(context.availableInputs, null, 2)}

PREVIOUS STEPS:
${context.stepContext.previousSteps.map((step, i) => `Step ${i + 1}: ${step.actionVerb} - ${step.description}`).join('\n')}

Please provide a specific, concrete value for the "${inputName}" input that would be appropriate for this ${context.actionVerb} operation.

For example:
- If inputName is "url", provide a real web address like "https://example.com"
- If inputName is "searchTerm", provide specific search keywords
- If inputName is "text", provide relevant text content

Return ONLY the value, no explanation:`;
    }

    /**
     * Validate generated input value
     */
    private validateGeneratedInput(inputName: string, value: string, actionVerb: string): boolean {
        if (!value || value.length < 2) return false;

        // Specific validations based on input type
        if (inputName.toLowerCase().includes('url')) {
            return value.startsWith('http') || value.includes('.');
        }

        if (inputName.toLowerCase().includes('email')) {
            return value.includes('@');
        }

        // General validation - avoid placeholder text
        const placeholderPatterns = [
            /example/i, /placeholder/i, /todo/i, /tbd/i, /xxx/i, /\[.*\]/
        ];

        return !placeholderPatterns.some(pattern => pattern.test(value));
    }

    /**
     * Infer value type from input name and value
     */
    private inferValueType(inputName: string, value: string): string {
        if (inputName.toLowerCase().includes('count') || inputName.toLowerCase().includes('limit')) {
            return 'number';
        }

        if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
            return 'boolean';
        }

        if (value.startsWith('[') || value.startsWith('{')) {
            return value.startsWith('[') ? 'array' : 'object';
        }

        return 'string';
    }

    /**
     * Get default values for common inputs
     */
    private getDefaultValue(inputName: string, actionVerb: string): string | null {
        const defaults: Record<string, Record<string, string>> = {
            'SCRAPE': {
                'selector': 'body',
                'limit': '10'
            },
            'SEARCH': {
                'limit': '10'
            },
            'TEXT_ANALYSIS': {
                'analysisType': 'summary'
            }
        };

        return defaults[actionVerb]?.[inputName] || null;
    }
}
