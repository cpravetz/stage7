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
    def execute(self, inputs_str: str) -> str:
        try:
            # 1. Correctly parse inputs from list of pairs to dict
            inputs = self._parse_inputs(inputs_str)

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

    def _parse_inputs(self, inputs_str: str) -> Dict[str, Any]:
        """Parses the input JSON string (list of pairs) into a dictionary."""
        try:
            inputs_list = json.loads(inputs_str)
            # This is the fix for the "'list' object has no attribute 'items'" error
            if isinstance(inputs_list, list):
                 return {item[0]: item[1] for item in inputs_list}
            elif isinstance(inputs_list, dict): # Handle if it's already a dict
                 return inputs_list
            else:
                 raise TypeError("Inputs are not in a valid list-of-pairs or dictionary format.")
        except (json.JSONDecodeError, TypeError) as e:
            raise ValueError(f"Failed to parse inputs: {e}")

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
        path = self._get_input_value(inputs, 'path', '.') # Default to base dir
        secure_path = self._get_secure_path(path)
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
    plugin = FileOperationPlugin()
    result_str = plugin.execute(inputs_str)
    print(result_str)
