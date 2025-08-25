import json
import sys
import requests
import logging
from typing import Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__)

CODE_EXECUTOR_URL = "http://localhost:5000/execute_code" # Assuming CODE_EXECUTOR is accessible at this URL

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
    """Executes the transformation script using CODE_EXECUTOR."""
    logger.info(f"Executing transform with params: {params}")

    # For Python, script_parameters will be available as params
    params_json = json.dumps(params)
    code_to_execute = f"import json\nparams = json.loads('{params_json}')\n{script}"

    logger.info("Using Python as the execution language per manifest")

    logger.info(f"Code to send to CODE_EXECUTOR (first 200 chars): {code_to_execute[:200]}...")

    payload = {
        "language": "python",  # Set in manifest
        "code": code_to_execute
    }

    try:
        response = requests.post(CODE_EXECUTOR_URL, json=payload, timeout=120) # Increased timeout
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        code_executor_result = response.json()

        stdout = code_executor_result.get("stdout", "")
        stderr = code_executor_result.get("stderr", "")
        exit_code = code_executor_result.get("exit_code", None)

        # Assuming the script's return value is printed to stdout or is the last expression's value
        # For simplicity, we'll take stdout as the result. More sophisticated parsing might be needed.
        transform_result = stdout.strip()

        if stderr:
            logger.warning(f"CODE_EXECUTOR returned stderr: {stderr}")

        if exit_code != 0:
            raise TransformError(f"CODE_EXECUTOR exited with non-zero code {exit_code}. Stderr: {stderr}")

        return {"result": transform_result, "stdout": stdout, "stderr": stderr}

    except requests.exceptions.RequestException as e:
        logger.error(f"Error calling CODE_EXECUTOR: {e}")
        raise TransformError(f"Failed to communicate with CODE_EXECUTOR: {e}")
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse CODE_EXECUTOR response: {e}")
        raise TransformError(f"Invalid response from CODE_EXECUTOR: {e}")
    except Exception as e:
        logger.error(f"An unexpected error occurred during transform execution: {e}")
        raise TransformError(f"Unexpected error: {e}")

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        logger.info(f"TRANSFORM plugin received input: {len(input_data)} characters")

        inputs_list = json.loads(input_data)
        
        inputs_dict = {}
        for item in inputs_list:
            if isinstance(item, list) and len(item) == 2:
                key, value = item
                inputs_dict[key] = value
            else:
                logger.warning(f"Skipping invalid input item: {item}")

        script = inputs_dict.get("script", {}).get("value", "")
        script_parameters = inputs_dict.get("script_parameters", {}).get("value", {})

        if not script:
            raise TransformError("Missing required 'script' input")

        if not script_parameters:
            raise TransformError("Missing required 'script_parameters' input")

        if not isinstance(script_parameters, dict):
            try:
                if isinstance(script_parameters, str):
                    script_parameters = json.loads(script_parameters)
                else:
                    raise TransformError(f"'script_parameters' must be a JSON object or string, got {type(script_parameters)}")
            except json.JSONDecodeError:
                raise TransformError("'script_parameters' must be valid JSON")

        transform_output = execute_transform(script, script_parameters)

        # Format the successful output
        sys.stdout.write(format_plugin_output(
            success=True,
            name="transform_result",
            result_type="string", # Assuming string result, can be refined based on script output
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
