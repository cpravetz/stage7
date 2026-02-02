```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Planning Response Schema",
  "description": "A plan consisting of an array of steps. This schema reflects the structure validated by the core Python PlanValidator.",
  "type": "array",
  "items": { "$ref": "#/definitions/PlanStep" },
  "definitions": {
    "PlanStep": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid",
          "description": "Unique step ID (UUID). This is required and used for dependency tracking."
        },
        "actionVerb": {
          "type": "string",
          "description": "The action to be performed. Can be a known plugin verb or a novel verb requiring further planning."
        },
        "description": {
          "type": "string",
          "description": "A thorough description of the task for this step, sufficient for an agent to execute it."
        },
        "inputs": {
          "type": "object",
          "patternProperties": {
            "^[a-zA-Z][a-zA-Z0-9_]*$": {
              "type": "object",
              "properties": {
                "value": {
                  "description": "Constant string value for this input. Note: Complex objects or arrays should be JSON-stringified."
                },
                "valueType": {
                  "type": "string",
                  "enum": ["string", "number", "boolean", "array", "object", "plan", "plugin", "any"],
                  "description": "The natural type of the constant 'value'."
                },
                "outputName": {
                  "type": "string",
                  "description": "The name of an output from a previous step."
                },
                "sourceStep": {
                  "type": "string",
                  "description": "The 'id' (UUID) of the step that produces the output. Use '0' to refer to an input from the parent context (e.g., the main inputs to ACCOMPLISH, or the 'item' from a FOREACH loop)."
                },
                "args": {
                  "type": "object",
                  "description": "Additional arguments for the input, rarely used."
                }
              },
              "oneOf": [
                { "required": ["value", "valueType"] },
                { "required": ["outputName", "sourceStep"] }
              ],
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        },
        "outputs": {
          "type": "object",
          "patternProperties": {
            "^[a-zA-Z][a-zA-Z0-9_]*$": {
              "type": "object",
              "properties": {
                "description": {
                  "type": "string",
                  "description": "Thorough description of the expected output."
                },
                "type": {
                  "type": "string",
                  "enum": ["string", "number", "boolean", "array", "object", "plan", "plugin", "any", "list", "list[string]", "list[number]", "list[boolean]", "list[object]", "list[any]"],
                  "description": "The data type of the output."
                },
                "isDeliverable": {
                  "type": "boolean",
                  "description": "Whether this output is a final deliverable for the user."
                },
                "filename": {
                  "type": "string",
                  "description": "User-friendly filename for the deliverable. If omitted for a deliverable, a name will be auto-generated."
                }
              },
              "required": ["description", "type"],
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        },
        "recommendedRole": {
          "type": "string",
          "description": "Suggested agent role. Allowed values (lowercase): coordinator, researcher, coder, creative, critic, executor, domain expert. This is sparsely used."
        }
      },
      "required": ["id", "actionVerb", "inputs", "outputs"],
      "additionalProperties": false
    }
  }
}
```
