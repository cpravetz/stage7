import { BaseService, ExchangeType } from '../services/baseService';
import { LLMConversationType } from '@cktmcs/shared';

export type ConvertParamsType = {
    service?: BaseService;
    prompt?: string;
    modelName?: string;
    [key: string]: any;
    contentType: string;
};

/**
 * Base interface for all LLM service interfaces.
 * Provides common functionality for JSON response handling and message trimming.
 * 
 * IMPORTANT: This class should only handle GENERIC JSON malformation issues.
 * Domain-specific schema validation (like PLAN validation) belongs in individual plugins.
 */
export abstract class BaseInterface {
    protected serviceName: string;
    public interfaceName: string; // For backward compatibility
    protected converters: Map<LLMConversationType, any>; // For backward compatibility

    constructor(serviceName: string) {
        this.serviceName = serviceName;
        this.interfaceName = serviceName; // Default to serviceName
        this.converters = new Map(); // Initialize converters map
    }

    abstract chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, responseType?: string }): Promise<string>;

    abstract convert(service: BaseService, conversionType: LLMConversationType, convertParams: ConvertParamsType): Promise<any>;

    /**
     * Helper method to ensure a response is in valid JSON format.
     *
     * This method guarantees that when JSON is requested, valid JSON is returned.
     * It handles both syntax and content issues:
     * 1. Basic cleaning (markdown removal, trailing commas, etc.)
     * 2. Bracket balancing for truncated responses
     * 3. Content extraction from mixed text/JSON responses
     * 4. LLM-assisted content validation and repair
     *
     * @param response The response from the LLM.
     * @param allowPartialRecovery Whether to allow partial recovery attempts.
     * @param service Optional service for LLM-assisted validation.
     * @param originalPrompt Optional original prompt for context-aware validation.
     * @returns Valid JSON string or throws an error.
     */
    public ensureJsonResponse(response: string, allowPartialRecovery: boolean = false): string {
        console.log('[baseInterface] Ensuring JSON response');
        console.log('[baseInterface] Original response:', response);
        if (!response || response.trim() === '') {
            throw new Error('[baseInterface] Empty response received');
        }

        let cleanedResponse = response.trim();

        // First, try to parse the original response as-is
        try {
            const parsed = JSON.parse(cleanedResponse);
            console.log('[baseInterface] Response is valid JSON after cleaning.');
            return JSON.stringify(parsed, null, 2);
        } catch (e) {
            // Only if parsing fails, try basic cleaning
            console.log('[baseInterface] Initial JSON parse failed, attempting basic cleaning...');
        }

        // Remove markdown code blocks
        cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '');

        // Remove comments
        cleanedResponse = cleanedResponse.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

        // Basic JSON fixes
        cleanedResponse = cleanedResponse.replace(/,(\s*[}\]])/g, '$1'); // trailing commas
        cleanedResponse = cleanedResponse.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3'); // unquoted keys

        try {
            const parsed = JSON.parse(cleanedResponse);
            console.log('[baseInterface] Response is valid JSON after cleaning.');
            return JSON.stringify(parsed, null, 2);
        } catch (e) {
            if (!allowPartialRecovery) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                console.log(`[baseInterface] JSON parse failed: ${errorMessage}`);
                console.log('[baseInterface] malformed JSON:', cleanedResponse);
                throw new Error(`JSON_PARSE_ERROR: ${errorMessage}`);
            }

            // Only attempt recovery if explicitly requested
            return this.attemptJsonRecovery(cleanedResponse);
        }
    }

    private attemptJsonRecovery(response: string): string {
        console.log('[baseInterface] Attempting JSON repair...');

        try {
            // Step 1: Try to repair common JSON issues without losing content
            let repaired = this.repairCommonJsonIssues(response);

            // Step 2: Try parsing the repaired JSON
            const parsed = JSON.parse(repaired);
            console.log('[baseInterface] JSON repair successful');
            return JSON.stringify(parsed, null, 2);

        } catch (e) {
            console.log('[baseInterface] JSON repair failed:', e instanceof Error ? e.message : String(e));
            console.log('[baseInterface] Attempting content extraction...');

            // Step 3: Try to extract JSON blocks from the response
            const extracted = this.extractJsonFromText(response);
            if (extracted) {
                return extracted;
            }



            console.error('[baseInterface] All JSON recovery attempts failed for:', response.substring(0, 200) + '...');
            throw new Error('JSON_RECOVERY_FAILED: Could not repair or extract valid JSON');
        }
    }

    private repairCommonJsonIssues(text: string): string {
        let repaired = text.trim();

        console.log('[baseInterface] Starting JSON repair on text length:', repaired.length);

        // Remove markdown code blocks
        repaired = repaired.replace(/```(?:json)?\s*\n?/g, '');
        repaired = repaired.replace(/```\s*$/g, '');

        // Remove markdown headers and analysis sections that models often add
        repaired = repaired.replace(/^###?\s+[A-Z][A-Z\s]*:?\s*\n/gm, '');
        repaired = repaired.replace(/^#{1,6}\s+.*$/gm, '');

        // Remove common markdown patterns that interfere with JSON
        repaired = repaired.replace(/^\*\*[^*]+\*\*:?\s*/gm, '');
        repaired = repaired.replace(/^-\s+\*\*[^*]+\*\*:?\s*/gm, '');
        repaired = repaired.replace(/^[0-9]+\.\s+\*\*[^*]+\*\*:?\s*/gm, '');

        // Remove "end of response" markers
        repaired = repaired.replace(/###?\s*"?end of response"?\s*$/gmi, '');

        // Only remove prefixes/suffixes if they're clearly not part of JSON
        // Be more conservative to avoid removing valid content
        repaired = repaired.replace(/^[^{[]*?(?=[{[])/g, ''); // Remove text before first { or [ (non-greedy)
        repaired = repaired.replace(/(?<=[}\]])[^}\]]*$/g, ''); // Remove text after last } or ] (non-greedy)

        // Fix trailing commas (handle multi-line)
        repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

        // Fix set notation to proper JSON objects (e.g., {"key"} -> {"key": "key"})
        // Handle single item sets first
        repaired = repaired.replace(/{\s*"([^"]+)"\s*}/g, '{"$1": "$1"}');
        
        // Handle multi-item sets with variable number of items
        repaired = repaired.replace(/{\s*"([^"]+)"(?:\s*,\s*"([^"]+)")*\s*}/g, (match, ...args) => {
            const items = args.slice(0, -2).filter(Boolean); // Remove regex match metadata
            const obj: { [key: string]: string } = {};
            items.forEach(item => obj[item] = item);
            return JSON.stringify(obj);
        });

        // Fix unquoted keys (simple cases) - handle multi-line
        repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

        // Fix single quotes to double quotes (but be careful with content)
        repaired = repaired.replace(/'/g, '"');

        // Fix common escape issues
        repaired = repaired.replace(/\\"/g, '\\"');

        // Remove duplicate commas
        repaired = repaired.replace(/,+/g, ',');

        // Fix missing commas between objects/arrays (handle multi-line)
        repaired = repaired.replace(/}(\s*){/g, '},$1{');
        repaired = repaired.replace(/](\s*)\[/g, '],$1[');

        // Additional fixes for multi-line JSON issues
        // Fix missing commas after values (common LLM issue)
        repaired = repaired.replace(/("(?:[^"\\]|\\.)*"|\d+|true|false|null)(\s*\n\s*)(")/g, '$1,$2$3');
        repaired = repaired.replace(/}(\s*\n\s*)"([^"]+)":/g, '},$1"$2":');

        // Fix missing closing brackets - common LLM truncation issue
        // Count opening and closing brackets to detect imbalance
        const openBrackets = (repaired.match(/\[/g) || []).length;
        const closeBrackets = (repaired.match(/\]/g) || []).length;
        const openBraces = (repaired.match(/\{/g) || []).length;
        const closeBraces = (repaired.match(/\}/g) || []).length;

        console.log(`[baseInterface] Bracket counts - Open: [${openBrackets}] {${openBraces}}, Close: ]${closeBrackets} }${closeBraces}`);

        // Add missing closing brackets (arrays first, then objects)
        if (openBrackets > closeBrackets) {
            const missingBrackets = openBrackets - closeBrackets;
            repaired += ']'.repeat(missingBrackets);
            console.log(`[baseInterface] Added ${missingBrackets} missing closing bracket(s)`);
        }

        if (openBraces > closeBraces) {
            const missingBraces = openBraces - closeBraces;
            repaired += '}'.repeat(missingBraces);
            console.log(`[baseInterface] Added ${missingBraces} missing closing brace(s)`);
        }


        // Additional common JSON fixes
        // Fix incomplete string literals at the end (common truncation issue)
        if (repaired.match(/[^"\\]"[^"]*$/)) {
            console.log('[baseInterface] Detected incomplete string at end - attempting fix');
            repaired = repaired.replace(/([^"\\]"[^"]*)$/, '$1"');
        }

        // Fix trailing commas before closing brackets/braces (again, after bracket fixes)
        repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

        // Validate bracket balance after all fixes
        const finalOpenBrackets = (repaired.match(/\[/g) || []).length;
        const finalCloseBrackets = (repaired.match(/\]/g) || []).length;
        const finalOpenBraces = (repaired.match(/\{/g) || []).length;
        const finalCloseBraces = (repaired.match(/\}/g) || []).length;

        console.log(`[baseInterface] Final bracket counts - Open: [${finalOpenBrackets}] {${finalOpenBraces}}, Close: ]${finalCloseBrackets} }${finalCloseBraces}`);

        if (finalOpenBrackets !== finalCloseBrackets || finalOpenBraces !== finalCloseBraces) {
            console.log('[baseInterface] Warning: Bracket imbalance still exists after repair');
        }
        console.log('[baseInterface] JSON repair completed, new length:', repaired.length);

        return repaired;
    }





    private extractJsonFromText(text: string): string | null {
        console.log('[baseInterface] Attempting to extract JSON from text...');

        // First, try to find JSON that looks like a complete response (has "type" field)
        const responsePatterns = [
            // Look for objects that contain "type" field - these are likely complete responses
            /\{\s*"type"\s*:\s*"[^"]+"\s*,[\s\S]*?\}/g,
            /\{\s*'type'\s*:\s*'[^']+'\s*,[\s\S]*?\}/g
        ];

        for (const pattern of responsePatterns) {
            const matches = text.match(pattern);
            if (matches) {
                console.log(`[baseInterface] Found ${matches.length} potential complete responses`);

                // Try the longest match first (most likely to be complete)
                const sortedMatches = matches.sort((a, b) => b.length - a.length);

                for (const match of sortedMatches) {
                    try {
                        const parsed = JSON.parse(match);
                        if (parsed.type) {
                            console.log('[baseInterface] Successfully extracted complete response with type:', parsed.type);
                            return JSON.stringify(parsed, null, 2);
                        }
                    } catch (e) {
                        console.log('[baseInterface] Failed to parse potential response:', e instanceof Error ? e.message : String(e));
                        continue;
                    }
                }
            }
        }

        // Fallback: look for any valid JSON, but prefer larger objects
        console.log('[baseInterface] No complete responses found, trying general JSON extraction...');
        const generalPatterns = [
            // Match complete objects with proper nesting
            /\{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*\}/g,
            // Match complete arrays with proper nesting
            /\[(?:[^\[\]]|\[(?:[^\[\]]|\[[^\[\]]*\])*\])*\]/g
        ];

        for (const pattern of generalPatterns) {
            const matches = text.match(pattern);
            if (matches) {
                // Filter out small objects that are likely fragments
                const largeMatches = matches.filter(match => match.length > 50);
                const sortedMatches = largeMatches.sort((a, b) => b.length - a.length);

                for (const match of sortedMatches) {
                    try {
                        const parsed = JSON.parse(match);
                        console.log('[baseInterface] Extracted JSON (fallback)');
                        return JSON.stringify(parsed, null, 2);
                    } catch (e) {
                        continue;
                    }
                }
            }
        }

        console.log('[baseInterface] No valid JSON found in text');
        return null;
    }

    protected trimMessages(messages: ExchangeType, maxTokens: number): ExchangeType {
        console.debug("Starting trimMessages")
        const targetTokens = Math.floor(maxTokens / 2);
        let estimatedTokens = 0;
        const trimmedMessages: ExchangeType = [];

        // Estimate tokens (4 characters ~= 1 token)
        const estimateTokens = (text: string) => Math.ceil(text.length / 4);

        // Iterate through messages in reverse order
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            let messageTokens = 0;

            if (typeof message.content === 'string') {
                messageTokens = estimateTokens(message.content);
            } else if (Array.isArray((message as any).content)) {
                messageTokens = ((message as any).content as any[]).reduce((sum: number, part: any) => {
                    if (typeof part === 'string') {
                        return sum + estimateTokens(part);
                    } else if (part.type === 'text' && typeof part.text === 'string') {
                        return sum + estimateTokens(part.text);
                    }
                    return sum + 10; // Estimate for non-text content
                }, 0);
            }

            if (estimatedTokens + messageTokens <= targetTokens) {
                trimmedMessages.unshift(message);
                estimatedTokens += messageTokens;
            } else {
                break;
            }
        }

        return trimmedMessages.length > 0 ? trimmedMessages : [messages[messages.length - 1]];
    }
}

