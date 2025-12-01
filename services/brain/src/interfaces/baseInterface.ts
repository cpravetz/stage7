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

    abstract chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, responseType?: string, tokenLimit?: number, schema?: any }): Promise<string>;

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
    public async ensureJsonResponse(response: string, allowPartialRecovery: boolean = false, service?: BaseService, originalPrompt?: string): Promise<string | null> {
        console.log('[baseInterface] Ensuring JSON response');
        console.log('[baseInterface] Original response:', response);
        if (!response || response.trim() === '') {
            console.error('[baseInterface] Empty response received');
            return null;
        }

        let cleanedResponse = response.trim();

        // Per user request, find the first '{' or '[' and the last '}' or ']'.
        const firstBrace = cleanedResponse.indexOf('{');
        const firstBracket = cleanedResponse.indexOf('[');

        let start = -1;
        let endChar = '';

        // Find the first opening bracket to determine the type of JSON (object or array)
        if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
            start = firstBrace;
            endChar = '}';
        } else if (firstBracket !== -1) {
            start = firstBracket;
            endChar = ']';
        }

        if (start !== -1) {
            // Find the last corresponding closing bracket
            const end = cleanedResponse.lastIndexOf(endChar);

            if (end > start) {
                // Trim the string to only include the content between the first and last brackets
                cleanedResponse = cleanedResponse.substring(start, end + 1);
            } else {
                // If no closing bracket is found, just trim the beginning
                cleanedResponse = cleanedResponse.substring(start);
            }
        }

        // First, try to parse the trimmed response as-is
        try {
            const parsed = JSON.parse(cleanedResponse);
            console.log('[baseInterface] Response is valid JSON after trimming.');
            return JSON.stringify(parsed, null, 2);
        } catch (e) {
            console.log('[baseInterface] Initial JSON parse failed after trimming, attempting robust extraction and repair...');
        }

        // NEW: Attempt to repair common JSON issues before extraction
        try {
            cleanedResponse = this.repairCommonJsonIssues(cleanedResponse);
            console.log('[baseInterface] Applied common JSON repair strategies.');
        } catch (repairError) {
            console.warn(`[baseInterface] Error during common JSON repair: ${repairError instanceof Error ? repairError.message : String(repairError)}`);
            // Continue with original cleanedResponse if repair fails
        }

        // Attempt robust extraction from the already trimmed response
        let extractedJsonCandidate = this.extractJsonFromText(cleanedResponse);

        if (extractedJsonCandidate) {
            cleanedResponse = extractedJsonCandidate;
        } else {
            console.log('[baseInterface] No clear JSON block extracted, returning null.');
            return null;
        }

        // Now, try to parse the (extracted or generally repaired) response
        try {
            const parsed = JSON.parse(cleanedResponse);
            console.log('[baseInterface] Response is valid JSON after extraction/repair.');
            return JSON.stringify(parsed, null, 2);
        } catch (e) {
            if (service) {
                try {
                    console.log('[baseInterface] Local JSON repair failed, attempting LLM-assisted repair...');
                    const repairPrompt = `The following text is supposed to be a single valid JSON object, but it is malformed. Please fix it. Your entire response must be a single, valid JSON object. Do not include any explanations, markdown, or code blocks - just the raw JSON object.\n\nBROKEN JSON:\n${cleanedResponse}`;
                    const repairedJson = await this.chat(service, [{ role: 'user', content: repairPrompt }], { responseType: 'json' });
                    // Final validation of the LLM-repaired JSON
                    JSON.parse(repairedJson);
                    return repairedJson;
                } catch (llmError) {
                    const errorMessage = llmError instanceof Error ? llmError.message : String(llmError);
                    console.error(`[baseInterface] LLM-assisted repair failed: ${errorMessage}`);
                }
            }
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error(`[baseInterface] Final JSON parse failed after all attempts: ${errorMessage}`);
            console.error('[baseInterface] Malformed JSON that caused final failure:', cleanedResponse.substring(0, 500) + '...');
            // Throw error so Brain can handle blacklisting and retry
            throw new Error('Unrecoverable JSON: ' + errorMessage);
        }
    }

    private repairCommonJsonIssues(text: string): string {
        let repaired = text.trim();

        console.log('[baseInterface] Starting JSON repair on text length:', repaired.length);

        // NEW: Remove non-printable ASCII characters (except common JSON escapes)
        // This regex keeps alphanumeric, common punctuation, and valid JSON escape sequences.
        // It removes characters like form feed, vertical tab, etc., which can break JSON.
        repaired = repaired.replace(/[^ -~]/g, ''); // Keep printable ASCII, newlines, tabs, backslashes
        // Remove markdown code blocks
        repaired = repaired.replace(/```(?:json)?/g, '');
        repaired = repaired.replace(/```\s*$/g, '');

        // Remove markdown headers and analysis sections that models often add
        repaired = repaired.replace(/^###?\s+[A-Z][A-Z\s]*:?\s*\n/gm, '');
        repaired = repaired.replace(/^#{1,6}\s+.*$/gm, '');

        // Remove common markdown patterns that interfere with JSON
        repaired = repaired.replace(/^\*\*[^*]+\*\*?:?\s*/gm, '');
        repaired = repaired.replace(/^-?\s*\*\*[^*]+\*\*?:?\s*/gm, '');
        repaired = repaired.replace(/^[0-9]+\.\s*\*\*[^*]+\*\*?:?\s*/gm, '');

        // Remove "end of response" markers
        repaired = repaired.replace(/###?\s*"?end of response"?\s*$/gmi, '');

        repaired =  repaired.replace(/("(?:[^"\\]|\\.)*"|\d+|true|false|null)(\s*\n\s*)(?=")/g, '$1,$2');

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
        repaired = repaired.replace(/([{,])\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

        // Fix single quotes to double quotes (but be careful with content)
        repaired = repaired.replace(/'/g, '"');

        // Fix common escape issues
        repaired = repaired.replace(/\\"/g, '"');

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
            repaired = repaired.replace(/([^"\\]\\"[^"]*)$/, '$1"');
        }

        // Fix trailing commas before closing brackets/braces (again, after bracket fixes)
        repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

        // Validate bracket balance after all fixes
        const finalOpenBrackets = (repaired.match(/\[/g) || []).length;
        const finalCloseBrackets = (repaired.match(/\]/g) || []).length;
        const finalOpenBraces = (repaired.match(/\{/g) || []).length;
        const finalCloseBraces = (repaired.match(/\}/g) || []).length;

        console.log(`[baseInterface] Final bracket counts - Open: [${finalOpenBrackets}] {${finalOpenBraces}}, Close: ]${finalCloseBraces} }${finalCloseBraces}`);

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
                        if (typeof parsed === 'object' && parsed !== null && parsed.type) {
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
            /\{(?:[^\{\}]|\{(?:[^\{\}]|\{[^\{\}]*})*})*\}/g,
            // Match complete arrays with proper nesting
            /\[(?:[^\[\]]|\[(?:[^\[\]]|\{[^\{\}]*})*\])*\]/g
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
                        if (typeof parsed === 'object' && parsed !== null) {
                            console.log('[baseInterface] Extracted JSON (fallback)');
                            return JSON.stringify(parsed, null, 2);
                        }
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

    /**
     * Remove non-printable/control characters from a string while preserving Unicode letters/punctuation.
     * This avoids removing non-ASCII characters (e.g., emoji, non-Latin scripts) but strips control chars
     * that can break browser APIs like `btoa`.
     */
    protected sanitizeString(input: string): string {
        if (!input || typeof input !== 'string') return input;
        // Remove C0 and C1 control characters (U+0000..U+001F, U+007F..U+009F)
        return input.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    }

    /**
     * Recursively sanitize a response payload. For responseType 'json' or 'text' we sanitize strings;
     * for other (binary) types we return the original value unmodified.
     */
    protected sanitizeResponse(response: any, responseType?: string): any {
        if (response === null || response === undefined) return response;

        const isJsonType = responseType === 'json' || responseType === 'application/json' || responseType === 'text/json';
        const isTextType = responseType === 'text' || responseType === 'text/plain' || typeof response === 'string';

        if (isTextType && typeof response === 'string') {
            return this.sanitizeString(response);
        }

        if (isJsonType || (typeof response === 'object' && !Buffer.isBuffer(response))) {
            // Recursively sanitize strings inside objects/arrays
            const sanitizeRec = (obj: any): any => {
                if (obj === null || obj === undefined) return obj;
                if (typeof obj === 'string') return this.sanitizeString(obj);
                if (Array.isArray(obj)) return obj.map(item => sanitizeRec(item));
                if (typeof obj === 'object') {
                    const out: any = {};
                    for (const k of Object.keys(obj)) {
                        try {
                            out[k] = sanitizeRec(obj[k]);
                        } catch (e) {
                            out[k] = obj[k];
                        }
                    }
                    return out;
                }
                return obj;
            };

            try {
                // If response is a JSON string, parse, sanitize, and re-stringify
                if (typeof response === 'string') {
                    const parsed = JSON.parse(response);
                    return JSON.stringify(sanitizeRec(parsed), null, 2);
                }
                return sanitizeRec(response);
            } catch (e) {
                // If parsing fails, fall back to sanitizing the raw string form
                if (typeof response === 'string') return this.sanitizeString(response);
                return response;
            }
        }

        // For binary data or unknown types, return as-is
        return response;
    }


}