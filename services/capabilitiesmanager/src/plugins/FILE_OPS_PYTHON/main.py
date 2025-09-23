# --- Robust wrapper for deduplication, temp dir hygiene, and error escalation ---
import tempfile
import shutil
import hashlib

# Error handler integration (for unexpected/code errors only)
def send_to_errorhandler(error, context=None):
    try:
        import requests
        errorhandler_url = os.environ.get('ERRORHANDLER_URL', 'errorhandler:5090')
        payload = {
            'error': str(error),
            'context': context or ''
        }
        requests.post(f'http://{errorhandler_url}/analyze', json=payload, timeout=10)
    except Exception as e:
        print(f"Failed to send error to errorhandler: {e}")

_seen_hashes = set()

def parse_inputs(inputs_str: str) -> Dict[str, Any]:
    """Parse and validate inputs"""
    try:
        logger.info(f"Parsing input string ({len(inputs_str)} chars)")
        
        input_list = json.loads(inputs_str)
        
        inputs = {}
        for item in input_list:
            if isinstance(item, list) and len(item) == 2:
                key, raw_value = item # Renamed 'value' to 'raw_value' for clarity
                
                # If raw_value is an InputValue object, retain the whole object
                if isinstance(raw_value, dict):
                    inputs[key] = raw_value
                else:
                    # Otherwise, use raw_value directly (for non-InputValue types)
                    inputs[key] = raw_value
            else:
                logger.warning(f"Skipping invalid input item: {item}")
        
        logger.info(f"Successfully parsed {len(inputs)} input fields")
        return inputs
        
    except Exception as e:
        logger.error(f"Input parsing failed: {e}")
        raise Exception(f"Input validation failed: {e}")

def robust_execute_plugin(inputs_str):
    temp_dir = None
    try:
        # Deduplication: hash the inputs
        hash_input = str(inputs_str)
        input_hash = hashlib.sha256(hash_input.encode()).hexdigest()
        if input_hash in _seen_hashes:
            return json.dumps([
                {
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "resultDescription": "Duplicate input detected. This input combination has already failed. Aborting to prevent infinite loop.",
                    "error": "Duplicate input detected."
                }
            ])
        _seen_hashes.add(input_hash)

        # Temp directory hygiene
        temp_dir = tempfile.mkdtemp(prefix="file_ops_python_")
        os.environ["FILE_OPS_PYTHON_TEMP_DIR"] = temp_dir

        # Parse the input string
        inputs = parse_inputs(inputs_str)

        # Call the original plugin logic
        result = FileOperationPlugin().execute(inputs)

        # Strict output validation: must be a JSON string of a list
        try:
            parsed = json.loads(result)
            if not isinstance(parsed, list):
                raise ValueError("Output schema validation failed: must be a JSON string of a list.")
        except Exception as e:
            raise ValueError(f"Output schema validation failed: {e}")

        return result
    except Exception as e:
        # Only escalate to errorhandler for unexpected/code errors
        send_to_errorhandler(e, context=inputs_str)
        return json.dumps([
            {
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": f"Error: {str(e)}",
                "error": str(e)
            }
        ])
    finally:
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except Exception as cleanup_err:
                print(f"Failed to clean up temp dir {temp_dir}: {cleanup_err}")
#!/usr/bin/env python3
"""
This is a placeholder for the FILE_OPERATION plugin.
It will be replaced with a full implementation.
FILE_OPERATION Plugin - Secure and Robust Implementation
"""

import json
import sys
import os
import logging
import requests
from typing import Dict, Any, List, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Define a secure base path for file operations.
# This corresponds to a mounted volume shared across services.
SHARED_FILES_BASE_PATH = os.environ.get('SHARED_FILES_PATH', '/usr/src/app/shared/mission-files/')

class FileOperationPlugin:
    def execute(self, inputs_map: Dict[str, Any]) -> str:
        try:
            # 1. Inputs are already parsed
            inputs = inputs_map

            # 2. Get operation and other parameters
            operation = self._get_input_value(inputs, 'operation')
            if not operation:
                raise ValueError("'operation' input is required.")

            # 3. Route to the correct operation handler
            if operation == 'read':
                result = self._read_operation(inputs)
            elif operation == 'write':
                result = self._write_operation(inputs)
            elif operation == 'append':
                result = self._append_operation(inputs)
            elif operation == 'list':
                result = self._list_operation(inputs)
            elif operation == 'delete':
                result = self._delete_operation(inputs)
            else:
                raise ValueError(f"Unsupported operation: {operation}")

            return json.dumps([result])

        except Exception as e:
            logger.error(f"FileOperationPlugin execution failed: {e}", exc_info=True)
            return json.dumps([{
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": "Plugin execution failed",
                "error": str(e)
            }])

    def _get_input_value(self, inputs: Dict[str, Any], key: str, default: Any = None) -> Any:
        """Safely gets a value from the parsed inputs dictionary."""
        if key in inputs and isinstance(inputs[key], dict):
            return inputs[key].get('value', default)
        return default

    

    

    def _get_secure_path(self, user_path: str) -> str:
        """Constructs a secure, absolute path within the shared directory."""
        if not user_path or not isinstance(user_path, str):
            raise ValueError("Path must be a non-empty string.")

        # Normalize the path to resolve '..' and other redundancies.
        base_path = os.path.abspath(SHARED_FILES_BASE_PATH)
        # Prevent absolute paths from escaping the jail by treating them as relative to the root of the jail
        # os.path.join handles this if user_path starts with '/'
        full_path = os.path.abspath(os.path.join(base_path, user_path.lstrip('/\\')))

        # Security check: ensure the final path is still within the base directory.
        if not full_path.startswith(base_path):
            raise PermissionError(f"Path traversal attempt detected. Access denied for path: {user_path}")

        return full_path

    def _read_operation(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        file_id = self._get_input_value(inputs, 'fileId')
        path = self._get_input_value(inputs, 'path')

        if file_id:
            # TODO: Implement reading from Librarian via fileId
            content = f"Content for fileId {file_id} would be read from Librarian."
            return {
                "success": True, "name": "content", "resultType": "string",
                "resultDescription": f"Content of file with ID {file_id}", "result": content
            }
        elif path:
            secure_path = self._get_secure_path(path)
            with open(secure_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return {
                "success": True, "name": "content", "resultType": "string",
                "resultDescription": f"Content of file at {path}", "result": content
            }
        else:
            raise ValueError("Either 'fileId' or 'path' is required for 'read' operation.")

    def _write_operation(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        path = self._get_input_value(inputs, 'path')
        content = self._get_input_value(inputs, 'content')
        if path is None or content is None:
            raise ValueError("'path' and 'content' are required for 'write' operation.")

        secure_path = self._get_secure_path(path)
        os.makedirs(os.path.dirname(secure_path), exist_ok=True)
        with open(secure_path, 'w', encoding='utf-8') as f:
            f.write(str(content))
        return {
            "success": True, "name": "status", "resultType": "string",
            "resultDescription": f"Successfully wrote to file {path}", "result": "write_successful"
        }

    def _append_operation(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        path = self._get_input_value(inputs, 'path')
        content = self._get_input_value(inputs, 'content')
        if path is None or content is None:
            raise ValueError("'path' and 'content' are required for 'append' operation.")

        secure_path = self._get_secure_path(path)
        os.makedirs(os.path.dirname(secure_path), exist_ok=True)
        with open(secure_path, 'a', encoding='utf-8') as f:
            f.write(str(content))
        return {
            "success": True, "name": "status", "resultType": "string",
            "resultDescription": f"Successfully appended to file {path}", "result": "append_successful"
        }

    def _list_operation(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        path = self._get_input_value(inputs, 'path', '.')
        secure_path = self._get_secure_path(path)
        if not os.path.exists(secure_path):
            return {
                "success": True, "name": "files", "resultType": "array",
                "resultDescription": f"Directory {path} does not exist", "result": []
            }
        files = os.listdir(secure_path)
        return {
            "success": True, "name": "files", "resultType": "array",
            "resultDescription": f"Files and directories in {path}", "result": files
        }

    def _delete_operation(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        path = self._get_input_value(inputs, 'path')
        if not path:
            raise ValueError("'path' is required for 'delete' operation.")
        secure_path = self._get_secure_path(path)
        if os.path.isfile(secure_path):
            os.remove(secure_path)
            result_desc = f"Successfully deleted file {path}"
        elif os.path.isdir(secure_path):
            if not os.listdir(secure_path):
                os.rmdir(secure_path)
                result_desc = f"Successfully deleted empty directory {path}"
            else:
                raise ValueError("Directory is not empty. Deletion of non-empty directories is not allowed for safety.")
        else:
            raise FileNotFoundError(f"File or directory not found at path: {path}")

        return {
            "success": True, "name": "status", "resultType": "string",
            "resultDescription": result_desc, "result": "delete_successful"
        }

if __name__ == "__main__":
    inputs_str = sys.stdin.read().strip()
    # Call the robust wrapper
    result_str = robust_execute_plugin(inputs_str)
    print(result_str)
