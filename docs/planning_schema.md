```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Combined Planning Response Schema",
  "description": "Schema for responses from planning-related LLM calls, which can be a plan, a direct answer, or a plugin recommendation.",
  "oneOf": [
    {
      "title": "Plan Response",
      "description": "A plan consisting of an array of steps.",
      "$ref": "#/definitions/PlanArray"
    },
    {
      "title": "Direct Answer Response",
      "description": "A direct textual answer to the query.",
      "$ref": "#/definitions/DirectAnswer"
    },
    {
      "title": "Plugin Recommendation Response",
      "description": "A recommendation for a new plugin to be developed.",
      "$ref": "#/definitions/PluginRecommendation"
    }
  ],
  "definitions": {
    "PlanStep": {
      "type": "object",
      "properties": {
        "number": {"type": "integer", "minimum": 1, "description": "Unique step number"},
        "actionVerb": {"type": "string", "description": "The action to be performed in this step. It may be one of the plugin actionVerbs or a new actionVerb for a new type of task."},
        "description": {"type": "string", "description": "A thorough description of the task to be performed in this step so that an agent or LLM can execute without needing external context beyond the inputs and output specification."},
        "inputs": {
          "type": "object",
          "patternProperties": {
            "^[a-zA-Z][a-zA-Z0-9_]*$": {
              "type": "object",
              "properties": {
                "value": {"type": "string", "description": "Constant string value for this input"},
                "valueType": {"type": "string", "enum": ["string", "number", "boolean", "array", "object", "plan", "plugin", "any"], "description": "The natural type of the Constant input value"},
                "outputName": {"type": "string", "description": "Reference to an output from a previous step at the same level or higher"},
                "sourceStep": {"type": "integer", "minimum": 0, "description": "The step number that produces the output for this input. Use 0 to refer to an input from the parent step."},
                "args": {"type": "object", "description": "Additional arguments for the input"}
              },
              "oneOf": [
                {"required": ["value", "valueType"]},
                {"required": ["outputName", "sourceStep"]}
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
              "oneOf": [
                {"type": "string", "description": "Thorough description of the expected output"},
                {
                  "type": "object",
                  "properties": {
                    "description": {"type": "string", "description": "Thorough description of the expected output"},
                    "isDeliverable": {"type": "boolean", "description": "Whether this output is a final deliverable for the user"},
                    "filename": {"type": "string", "description": "User-friendly filename for the deliverable"}
                  },
                  "required": ["description"],
                  "additionalProperties": false
                }
              ]
            }
          },
          "additionalProperties": false
        },
        "recommendedRole": {"type": "string", "description": "Suggested role type for the agent executing this step. Allowed values are Coordinator, Researcher, Coder, Creative, Critic, Executor, and Domain Expert"}
      },
      "required": ["number", "actionVerb", "inputs", "outputs"],
      "additionalProperties": false
    },
    "PlanArray": {
      "type": "array",
      "items": { "$ref": "#/definitions/PlanStep" },
      "description": "A list of sequential steps to accomplish a goal."
    },
    "DirectAnswer": {
      "type": "object",
      "properties": {
        "direct_answer": {
          "type": "string",
          "description": "A direct answer or result, to be used only if the goal can be fully accomplished in a single step without requiring a plan."
        }
      },
      "required": ["direct_answer"],
      "additionalProperties": false
    },
    "PluginRecommendation": {
      "type": "object",
      "properties": {
        "plugin": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "description": "The ID of the new plugin to be developed."
            },
            "description": {
              "type": "string",
              "description": "A detailed description of the new plugin's functionality."
            }
          },
          "required": ["id", "description"],
          "additionalProperties": false
        }
      },
      "required": ["plugin"],
      "additionalProperties": false
    }
  }
}
```