/**
 * Phase 2: Runtime FOREACH Detection and Insertion
 * 
 * This module provides runtime detection of FOREACH needs during step execution.
 * It integrates with the Step execution logic to dynamically insert FOREACH loops
 * when array outputs are consumed by steps expecting scalar inputs.
 */

import { PluginOutput, InputValue } from '@cktmcs/shared';
import { Step } from '../agents/Step';

export interface ForeachModification {
    type: 'insert_foreach';
    sourceStep: number;
    sourceOutput: string;
    targetStep: number;
    targetInput: string;
    arrayValue: any[];
}

export interface RuntimeTypeInfo {
    actionVerb: string;
    inputDefinitions: Array<{
        name: string;
        type: string;
        aliases?: string[];
    }>;
    outputDefinitions: Array<{
        name: string;
        type: string;
    }>;
}

export class RuntimeForeachDetector {
    private capabilitiesManagerUrl: string;
    private authToken?: string;

    constructor(capabilitiesManagerUrl: string, authToken?: string) {
        this.capabilitiesManagerUrl = capabilitiesManagerUrl.replace(/\/$/, '');
        this.authToken = authToken;
    }

    /**
     * Analyze step outputs and detect if upcoming steps need FOREACH wrapping
     */
    async detectForeachNeeds(
        executedStep: any,
        stepOutputs: Record<string, any>,
        upcomingSteps: any[]
    ): Promise<ForeachModification[]> {
        const modifications: ForeachModification[] = [];
        const stepNumber = executedStep.number;

        console.log(`[RuntimeForeachDetector] Analyzing outputs from step ${stepNumber}`);

        // Check each output for array types
        for (const [outputName, outputValue] of Object.entries(stepOutputs)) {
            if (!Array.isArray(outputValue)) {
                continue;
            }

            console.log(`[RuntimeForeachDetector] Step ${stepNumber}: Output '${outputName}' is array with ${outputValue.length} items`);

            // Check upcoming steps that consume this array
            for (const upcomingStep of upcomingSteps) {
                const inputs = upcomingStep.inputs || {};

                for (const [inputName, inputDef] of Object.entries(inputs)) {
                    if (typeof inputDef !== 'object' || !inputDef) continue;

                    // Type guard to ensure inputDef has the expected properties
                    const typedInputDef = inputDef as { sourceStep?: number; outputName?: string; value?: any; valueType?: string };

                    // Check if this input references our array output
                    if (typedInputDef.sourceStep === stepNumber && typedInputDef.outputName === outputName) {
                        const needsForeach = await this.checkIfForeachNeeded(
                            upcomingStep,
                            inputName,
                            outputValue
                        );

                        if (needsForeach) {
                            modifications.push({
                                type: 'insert_foreach',
                                sourceStep: stepNumber,
                                sourceOutput: outputName,
                                targetStep: upcomingStep.number,
                                targetInput: inputName,
                                arrayValue: outputValue
                            });

                            console.log(`[RuntimeForeachDetector] FOREACH needed: Step ${upcomingStep.number} input '${inputName}' needs FOREACH for array from step ${stepNumber}`);
                        }
                    }
                }
            }
        }

        return modifications;
    }

    /**
     * Check if a specific input needs FOREACH wrapping based on type information
     */
    private async checkIfForeachNeeded(
        step: any,
        inputName: string,
        arrayValue: any[]
    ): Promise<boolean> {
        const actionVerb = step.actionVerb?.toUpperCase();
        if (!actionVerb) return false;

        try {
            // Fetch type information from CapabilitiesManager
            const typeInfo = await this.getPluginTypeInfo(actionVerb);
            if (!typeInfo) {
                console.warn(`[RuntimeForeachDetector] No type info found for ${actionVerb}, assuming FOREACH needed`);
                return true;
            }

            // Find the input definition
            const inputDef = typeInfo.inputDefinitions.find(def => 
                def.name === inputName || (def.aliases && def.aliases.includes(inputName))
            );

            if (!inputDef) {
                console.warn(`[RuntimeForeachDetector] Input '${inputName}' not found in ${actionVerb} definition, assuming FOREACH needed`);
                return true;
            }

            const expectedType = inputDef.type.toLowerCase();
            
            // If input expects scalar but we have array, FOREACH is needed
            if (['string', 'number', 'object', 'boolean'].includes(expectedType)) {
                console.log(`[RuntimeForeachDetector] ${actionVerb}.${inputName} expects '${expectedType}' but got array - FOREACH needed`);
                return true;
            } else if (['array', 'list'].includes(expectedType)) {
                console.log(`[RuntimeForeachDetector] ${actionVerb}.${inputName} expects array - no FOREACH needed`);
                return false;
            }

            // Unknown type, assume FOREACH needed
            console.warn(`[RuntimeForeachDetector] Unknown type '${expectedType}' for ${actionVerb}.${inputName}, assuming FOREACH needed`);
            return true;

        } catch (error) {
            console.error(`[RuntimeForeachDetector] Error checking FOREACH need for ${actionVerb}:`, error);
            return true; // Default to FOREACH when in doubt
        }
    }

    /**
     * Fetch plugin type information from CapabilitiesManager
     */
    private async getPluginTypeInfo(actionVerb: string): Promise<RuntimeTypeInfo | null> {
        try {
            const url = `${this.capabilitiesManagerUrl}/plugins/types/${actionVerb}`;
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            if (this.authToken) {
                headers['Authorization'] = `Bearer ${this.authToken}`;
            }

            const response = await fetch(url, { headers });

            if (response.status === 404) {
                return null; // Plugin not found
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();

        } catch (error) {
            console.error(`[RuntimeForeachDetector] Failed to fetch type info for ${actionVerb}:`, error);
            return null;
        }
    }

    /**
     * Generate a FOREACH step structure for runtime insertion
     */
    generateForeachStep(
        modification: ForeachModification,
        targetStep: any,
        maxStepNumber: number
    ): any {
        const foreachStepNumber = maxStepNumber + 1;

        // Create subplan with the target step (renumbered to 1)
        const subPlan = [{
            ...targetStep,
            number: 1,
            inputs: {
                ...targetStep.inputs,
                [modification.targetInput]: {
                    outputName: 'item',
                    sourceStep: 0 // Special reference to FOREACH item
                }
            }
        }];

        // Create FOREACH step
        const foreachStep = {
            number: foreachStepNumber,
            actionVerb: 'FOREACH',
            description: `Iterate over '${modification.sourceOutput}' from step ${modification.sourceStep}`,
            inputs: {
                array: {
                    outputName: modification.sourceOutput,
                    sourceStep: modification.sourceStep
                },
                steps: {
                    value: subPlan,
                    valueType: 'array'
                }
            },
            outputs: targetStep.outputs || {},
            recommendedRole: 'Coordinator'
        };

        return foreachStep;
    }
}

/**
 * Create a RuntimeForeachDetector instance from environment variables
 */
export function createRuntimeForeachDetector(): RuntimeForeachDetector {
    const capabilitiesManagerUrl = process.env.CAPABILITIES_MANAGER_URL || 'http://capabilitiesmanager:5060';
    const authToken = process.env.AUTH_TOKEN;
    
    return new RuntimeForeachDetector(capabilitiesManagerUrl, authToken);
}
