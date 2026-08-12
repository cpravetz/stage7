import json
import logging
import os
import sys
import subprocess
import tempfile
import shutil
import hashlib
from typing import Dict, Any, List, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__)

_seen_hashes = set()

def execute_plugin(inputs):
    temp_dir = None
    try:
        # Deduplication: hash the inputs
        hash_input = json.dumps(inputs, sort_keys=True)
        input_hash = hashlib.sha256(hash_input.encode()).hexdigest()
        if input_hash in _seen_hashes:
            return {
                "stdout": "",
                "stderr": "Duplicate input detected. This input combination has already failed. Aborting to prevent infinite loop.",
                "exit_code": 1,
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": "Duplicate input detected. This input combination has already failed. Aborting to prevent infinite loop.",
                "error": "Duplicate input detected."
            }
        _seen_hashes.add(input_hash)

        # Temp directory hygiene
        temp_dir = tempfile.mkdtemp(prefix="code_executor_")
        os.environ["CODE_EXECUTOR_TEMP_DIR"] = temp_dir

        # Extract and normalize inputs
        language = inputs.get("language", inputs.get("lang", inputs.get("languageName", "")))
        if isinstance(language, dict) and "value" in language:
            language = language["value"]
        language = str(language).lower() if language else ""

        code = inputs.get("code", inputs.get("snippet", inputs.get("program", inputs.get("source", ""))))
        if isinstance(code, dict) and "value" in code:
            code = code["value"]
        code = str(code) if code is not None else ""

        if not code:
            raise ValueError("Missing required parameter: code")
        if not language:
            raise ValueError("Missing required parameter: language")
        if language not in ("python", "javascript"):
            raise ValueError(f"Unsupported language: {language}")

        if language == "python":
            script_path = os.path.join(temp_dir, "script.py")
            with open(script_path, "w") as f:
                f.write(code)
            proc = subprocess.run(
                ["python3", script_path],
                capture_output=True,
                text=True,
                timeout=60
            )
        elif language == "javascript":
            script_path = os.path.join(temp_dir, "script.js")
            with open(script_path, "w") as f:
                f.write(code)
            proc = subprocess.run(
                ["node", script_path],
                capture_output=True,
                text=True,
                timeout=60
            )

        result = {
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "exit_code": proc.returncode
        }

        # Strict output validation: must be a list or dict
        if not isinstance(result, (list, dict)):
            raise ValueError("Output schema validation failed: must be a list or dict.")

        return result
    except subprocess.TimeoutExpired:
        logger.error("Code execution timed out")
        return {
            "stdout": "",
            "stderr": "Code execution timed out after 60 seconds",
            "exit_code": -1,
            "success": False,
            "name": "error",
            "resultType": "error",
            "resultDescription": "Code execution timed out after 60 seconds",
            "error": "TimeoutExpired"
        }
    except FileNotFoundError as e:
        logger.error(f"Interpreter not found: {e}")
        return {
            "stdout": "",
            "stderr": f"Interpreter not found: {e}",
            "exit_code": 127,
            "success": False,
            "name": "error",
            "resultType": "error",
            "resultDescription": f"Interpreter not found: {e}",
            "error": str(e)
        }
    except Exception as e:
        # Log the error internally
        logger.error(f"CODE_EXECUTOR plugin encountered an error: {e}")
        return {
            "stdout": "",
            "stderr": f"Error: {str(e)}",
            "exit_code": -1,
            "success": False,
            "name": "error",
            "resultType": "error",
            "resultDescription": f"Error: {str(e)}",
            "error": str(e)
        }
    finally:
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except Exception as cleanup_err:
                print(f"Failed to clean up temp dir {temp_dir}: {cleanup_err}")

if __name__ == "__main__":
    # Read input from stdin
    raw_input_str = sys.stdin.read()
    
    # Attempt to clean the input string before parsing as JSON
    # Remove common markdown code block fences and any leading/trailing whitespace
    cleaned_input_str = raw_input_str.strip()
    if cleaned_input_str.startswith('```json'):
        cleaned_input_str = cleaned_input_str[7:].strip()
    elif cleaned_input_str.startswith('```'):
        cleaned_input_str = cleaned_input_str[3:].strip()
    if cleaned_input_str.endswith('```'):
        cleaned_input_str = cleaned_input_str[:-3].strip()

    try:
        # Parse the input data, which should be a list of [key, value] pairs
        inputs_list = json.loads(cleaned_input_str)
        
        # Convert the list of pairs into a dictionary
        inputs_dict = {}
        if isinstance(inputs_list, list):
            for item in inputs_list:
                if isinstance(item, list) and len(item) == 2:
                    key, raw_value = item
                    # If raw_value is an InputValue object, extract its 'value' property
                    if isinstance(raw_value, dict) and 'value' in raw_value:
                        inputs_dict[key] = raw_value['value']
                    else:
                        # Otherwise, use raw_value directly (for non-InputValue types)
                        inputs_dict[key] = raw_value
                else:
                    # Log a warning if an item is not a valid [key, value] pair
                    sys.stderr.write(f"Warning: Skipping invalid input item: {item}\n")
        else:
            # If it's not a list, assume it's already a dictionary (for direct testing or older formats)
            inputs_dict = inputs_list
        
        # Normalize aliases to their primary names
        alias_map = {
            "language": ["lang", "languageName"],
            "code": ["snippet", "program", "source"]
        }
        for primary_name, aliases in alias_map.items():
            if primary_name not in inputs_dict:
                for alias in aliases:
                    if alias in inputs_dict:
                        inputs_dict[primary_name] = inputs_dict.pop(alias)
                        break

        print(json.dumps(execute_plugin(inputs_dict)))
    except json.JSONDecodeError as e:
        # If JSON decoding still fails, log the error and return a structured error output
        error_message = f"JSONDecodeError: {e}. Raw input: {raw_input_str[:200]}..."
        logger.error(error_message)
        print(json.dumps({
            "stdout": "",
            "stderr": f"Error: Invalid JSON input to CODE_EXECUTOR plugin: {e}",
            "exit_code": 1,
            "success": False,
            "name": "error",
            "resultType": "error",
            "resultDescription": error_message,
            "error": error_message
        }))
    except Exception as e:
        logger.error(f"An unexpected error occurred during input processing: {str(e)}")
        print(json.dumps({
            "stdout": "",
            "stderr": f"An unexpected error occurred during input processing: {str(e)}",
            "exit_code": 1,
            "success": False,
            "name": "error",
            "resultType": "error",
            "resultDescription": f"An unexpected error occurred during input processing: {str(e)}",
            "error": str(e)
        }))
