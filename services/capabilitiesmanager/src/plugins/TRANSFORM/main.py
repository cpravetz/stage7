import json
import sys
import logging
import io
import re
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__)

class TransformError(Exception):
    """Custom exception for TRANSFORM plugin errors"""
    pass

def format_plugin_output(success: bool, name: str, result_type: str, description: str, result: Any, error: str = None) -> str:
    """Helper to format output as a list of PluginOutput dictionaries"""
    output = {
        "success": success,
        "name": name,
        "resultType": result_type,
        "resultDescription": description,
        "result": result,
        "mimeType": "application/json" if isinstance(result, (dict, list)) else "text/plain"
    }
    if error:
        output["error"] = error
    return json.dumps([output], indent=2)

def execute_transform(script: str, params: dict) -> dict:
    """Executes the transformation script locally."""
    logger.info(f"Executing transform with params: {params}")

    match = re.search(r"def\s+(\w+)\(.*\):", script)
    
    code_to_execute = ""
    if match:
        func_name = match.group(1)
        code_to_execute = f"""
import json
import sys

{script}

try:
    result = {func_name}(**{json.dumps(params)})
    print(json.dumps(result))
except Exception as e:
    print(f"Error calling transform function: {e}", file=sys.stderr)
"""
    else:
        # If no function definition is found, execute the script directly.
        # The 'params' dictionary is injected into the script's global scope.
        code_to_execute = f"""
import json
import sys

{script}
"""

    logger.info(f"Executing code locally (first 200 chars): {code_to_execute[:200]}...")

    old_stdout = sys.stdout
    old_stderr = sys.stderr
    redirected_stdout = io.StringIO()
    redirected_stderr = io.StringIO()
    sys.stdout = redirected_stdout
    sys.stderr = redirected_stderr

    try:
        exec(code_to_execute, {'json': json, 're': re, 'params': params})

        stdout = redirected_stdout.getvalue()
        stderr = redirected_stderr.getvalue()

        transform_result = stdout.strip()

        if stderr:
            logger.warning(f"Local execution returned stderr: {stderr}")

        return {"result": transform_result, "stdout": stdout, "stderr": stderr}

    except Exception as e:
        stderr = redirected_stderr.getvalue()
        logger.error(f"An error occurred during local transform execution: {e}. Stderr: {stderr}")
        raise TransformError(f"Local code execution failed: {e}. Stderr: {stderr}")
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        logger.info(f"TRANSFORM plugin received raw input: {input_data}")
        logger.info(f"TRANSFORM plugin received input: {len(input_data)} characters")

        inputs_raw = json.loads(input_data)
        logger.info(f"TRANSFORM plugin parsed inputs_raw: {inputs_raw}")
        
        inputs_dict = {}
        for key, val in inputs_raw.items():
            # Extract value if dict (assuming InputValue structure)
            if isinstance(val, dict) and 'value' in val:
                inputs_dict[key] = val['value']
            else:
                # This else branch should ideally not be hit if all inputs are InputValue objects
                logger.warning(f"Skipping invalid input item: {key} with value {val}. Expected InputValue structure.")
                inputs_dict[key] = val

        # Extract script and script_parameters directly from inputs_dict
        # They are already raw values due to the parsing above
        script = inputs_dict.get("script", "")
        script_parameters = inputs_dict.get("script_parameters", {})

        if not script:
            raise TransformError("Missing required 'script' input")

        params_to_execute = {}
        if isinstance(script_parameters, str):
            try:
                script_parameters = json.loads(script_parameters) if script_parameters.strip() else {}
            except json.JSONDecodeError:
                raise TransformError("Invalid JSON string for 'script_parameters'")

        if isinstance(script_parameters, dict):
            for param_name, param_value in script_parameters.items():
                if isinstance(param_value, dict) and 'outputName' in param_value:
                    input_name = param_value['outputName']
                    if input_name in inputs_dict:
                        value = inputs_dict[input_name]
                        if isinstance(value, str):
                            try:
                                value = json.loads(value)
                            except json.JSONDecodeError:
                                pass # Not a json string
                        params_to_execute[param_name] = value
                    else:
                        params_to_execute[param_name] = param_value # pass as is
                else:
                    params_to_execute[param_name] = param_value
        else:
            raise TransformError(f"'script_parameters' must be a JSON object or string, got {type(script_parameters)}")

        transform_output = execute_transform(script, params_to_execute)

        sys.stdout.write(format_plugin_output(
            success=True,
            name="transform_result",
            result_type="string",
            description="Transformation executed successfully.",
            result=transform_output["result"]
        ))

    except TransformError as e:
        logger.error(f"TRANSFORM plugin error: {e}")
        sys.stdout.write(format_plugin_output(
            success=False,
            name="error",
            result_type="error",
            description=f"TRANSFORM plugin failed: {e}",
            result=None,
            error=str(e)
        ))
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON input to TRANSFORM plugin: {e}")
        sys.stdout.write(format_plugin_output(
            success=False,
            name="error",
            result_type="error",
            description=f"Invalid JSON input: {e}",
            result=None,
            error=str(e)
        ))
    except Exception as exc:
        logger.error(f"An unexpected error occurred in TRANSFORM plugin: {exc}")
        sys.stdout.write(format_plugin_output(
            success=False,
            name="error",
            result_type="error",
            description=f"An unexpected error occurred: {exc}",
            result=None,
            error=str(exc)
        ))