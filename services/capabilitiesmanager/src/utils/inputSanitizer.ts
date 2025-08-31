import { InputValue, PluginParameterType } from '@cktmcs/shared';

/**
 * Regular expressions for common validation patterns
 */
const VALIDATION_PATTERNS = {
    // Only alphanumeric characters, underscores, and hyphens
    SAFE_STRING: /^[a-zA-Z0-9_-]+$/,
    // Basic email format
    EMAIL: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
    // URL format
    URL: /^https?:\/\/\S+$/i,
    // Path format (supports both Unix and Windows)
    PATH: /^[a-zA-Z0-9/_\-\.:\\]+$/,
    // JSON string
    JSON_STRING: /^\s*[\{\[]/,
    // Numeric string
    NUMERIC: /^-?\d*\.?\d+$/
};

/**
 * Maps plugin verbs to specific sanitization rules
 */
const PLUGIN_SPECIFIC_RULES: Record<string, Record<string, (value: any) => any>> = {
    'TEXT_ANALYSIS': {
        'text': (value: string) => {
            if (typeof value !== 'string') return String(value);
            // Remove null characters and other problematic control chars
            return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        }
    },
    'FILE_OPS': {
        'path': (value: string) => {
            if (typeof value !== 'string') return String(value);
            // Normalize path separators and remove dangerous characters
            return value.replace(/\\/g, '/').replace(/[<>:"|?*]/g, '_');
        }
    }
};

/**
 * Sanitizes a single input value based on its type and plugin-specific rules
 */
export function sanitizeInputValue(
    input: InputValue,
    pluginVerb: string,
    trace_id: string
): InputValue {
    const source_component = 'inputSanitizer.sanitizeInputValue';
    let sanitizedValue = input.value;
    const inputName = input.inputName;

    try {
        // Check for plugin-specific rules first
        if (PLUGIN_SPECIFIC_RULES[pluginVerb]?.[inputName]) {
            sanitizedValue = PLUGIN_SPECIFIC_RULES[pluginVerb][inputName](sanitizedValue);
            console.log(`[${trace_id}] ${source_component}: Applied plugin-specific sanitization for ${pluginVerb}.${inputName}`);
        }

        // Apply type-based sanitization
        switch (input.valueType) {
            case PluginParameterType.STRING:
                if (typeof sanitizedValue !== 'string') {
                    sanitizedValue = String(sanitizedValue);
                }
                // Only remove null bytes, which are a common source of issues.
                sanitizedValue = sanitizedValue.replace(/\x00/g, '');
                break;

            case PluginParameterType.NUMBER:
                if (typeof sanitizedValue === 'string') {
                    if (VALIDATION_PATTERNS.NUMERIC.test(sanitizedValue)) {
                        sanitizedValue = Number(sanitizedValue);
                    }
                }
                break;

            case PluginParameterType.BOOLEAN:
                if (typeof sanitizedValue === 'string') {
                    sanitizedValue = sanitizedValue.toLowerCase() === 'true';
                }
                break;

            case PluginParameterType.OBJECT:
                if (typeof sanitizedValue === 'string' && VALIDATION_PATTERNS.JSON_STRING.test(sanitizedValue)) {
                    try {
                        sanitizedValue = JSON.parse(sanitizedValue);
                    } catch (e) {
                        console.warn(`[${trace_id}] ${source_component}: Failed to parse JSON string for ${inputName}, keeping original`);
                    }
                }
                break;

            case PluginParameterType.ARRAY:
                if (typeof sanitizedValue === 'string') {
                    if (VALIDATION_PATTERNS.JSON_STRING.test(sanitizedValue)) {
                        try {
                            const parsed = JSON.parse(sanitizedValue);
                            sanitizedValue = Array.isArray(parsed) ? parsed : [sanitizedValue];
                        } catch (e) {
                            sanitizedValue = [sanitizedValue];
                        }
                    } else {
                        // Split by common delimiters if it's a plain string
                        sanitizedValue = sanitizedValue.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
                    }
                }
                break;
        }

        return {
            ...input,
            value: sanitizedValue
        };
    } catch (error) {
        console.error(`[${trace_id}] ${source_component}: Error sanitizing ${inputName}:`, error);
        return input; // Return original if sanitization fails
    }
}

/**
 * Additional pre-execution validation checks
 */
export function performPreExecutionChecks(
    inputs: Map<string, InputValue>,
    pluginVerb: string,
    trace_id: string
): { isValid: boolean; issues: string[] } {
    const source_component = 'inputSanitizer.performPreExecutionChecks';
    const issues: string[] = [];

    // Check for common issues that might cause problems during execution
    for (const [key, input] of inputs.entries()) {
        const value = input.value;

        // Check for extremely large inputs that might cause memory issues
        if (typeof value === 'string' && value.length > 1000000) {
            issues.push(`Input '${key}' is very large (${value.length} characters). Consider chunking the data.`);
        }

        // Check for potentially problematic characters in string inputs
        if (typeof value === 'string') {
            // Basic check to avoid flagging base64 encoded data
            const isLikelyBase64 = /^[A-Za-z0-9+/=\s]+$/.test(value) && value.length % 4 === 0;
            if (!isLikelyBase64 && /[<>&;`$]/.test(value)) {
                issues.push(`Input '${key}' contains potentially unsafe characters.`);
            }
        }

        // Check for array size limits
        if (Array.isArray(value) && value.length > 10000) {
            issues.push(`Input '${key}' array is very large (${value.length} items). Consider processing in batches.`);
        }

        // Check for deeply nested objects that might cause stack overflow
        if (typeof value === 'object' && value !== null) {
            const depth = getObjectDepth(value);
            if (depth > 50) {
                issues.push(`Input '${key}' has deep nesting (depth: ${depth}). Consider flattening the structure.`);
            }
        }

        // Plugin-specific checks
        switch (pluginVerb) {
            case 'TEXT_ANALYSIS':
                if (key === 'text' && typeof value === 'string') {
                    const wordCount = value.split(/\s+/).length;
                    if (wordCount > 10000) {
                        issues.push(`Text input contains ${wordCount} words. Consider chunking for better analysis.`);
                    }
                }
                break;
            // Add more plugin-specific checks as needed
        }
    }

    if (issues.length > 0) {
        console.warn(`[${trace_id}] ${source_component}: Found ${issues.length} potential issues:`, issues);
    }

    return {
        isValid: issues.length === 0,
        issues
    };
}

/**
 * Helper function to get the depth of a nested object
 */
function getObjectDepth(obj: any, currentDepth = 0): number {
    if (currentDepth > 100) return currentDepth; // Prevent infinite recursion
    if (typeof obj !== 'object' || obj === null) return currentDepth;

    let maxDepth = currentDepth;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const depth = getObjectDepth(item, currentDepth + 1);
            maxDepth = Math.max(maxDepth, depth);
        }
    } else {
        for (const key in obj) {
            const depth = getObjectDepth(obj[key], currentDepth + 1);
            maxDepth = Math.max(maxDepth, depth);
        }
    }
    return maxDepth;
}
