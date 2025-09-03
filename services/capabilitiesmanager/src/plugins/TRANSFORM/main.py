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

params = {json.dumps(params)}
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
        logger.info(f"TRANSFORM plugin received input: {len(input_data)} characters")

        inputs_list = json.loads(input_data)
        
        inputs_dict = {}
        for item in inputs_list:
            if isinstance(item, list) and len(item) == 2:
                key, val = item # val is already the raw value
                inputs_dict[key] = val
            else:
                logger.warning(f"Skipping invalid input item: {item}")

        # Extract script and script_parameters directly from inputs_dict
        # They are already raw values due to the parsing above
        script = inputs_dict.get("script", "")
        script_parameters = inputs_dict.get("script_parameters", {})

        if not script:
            raise TransformError("Missing required 'script' input")

        if isinstance(script_parameters, str):
            try:
                if script_parameters.strip():
                    script_parameters = json.loads(script_parameters)
                else:
                    script_parameters = {}
            except json.JSONDecodeError:
                raise TransformError("Invalid JSON string for 'script_parameters'")
        elif not isinstance(script_parameters, dict):
            raise TransformError(f"'script_parameters' must be a JSON object or string, got {type(script_parameters)}")

        transform_output = execute_transform(script, script_parameters)

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
    except Exception as e:
        logger.error(f"An unexpected error occurred in TRANSFORM plugin: {e}")
        sys.stdout.write(format_plugin_output(
            success=False,
            name="error",
            result_type="error",
            description=f"An unexpected error occurred: {e}",
            result=None,
            error=str(e)
        ))