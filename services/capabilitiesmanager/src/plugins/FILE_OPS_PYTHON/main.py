#!/usr/bin/env python3
"""
FILE_OPERATION Plugin - Secure and Robust Implementation
Centralized input parsing/validation is handled by helper.py. This wrapper ensures
deduplication, temp-dir hygiene, and clearer error escalation while keeping plugin
logic focused on file operations.
"""

import json
import sys
import os
import logging
import requests
import tempfile
import shutil
import hashlib
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
try:
    # If executed as part of a package, use relative import
    from . import helper
except Exception:
    # When running the module as a stand-alone script for testing, fall back to direct import
    import helper

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Define a secure base path for file operations.
# This corresponds to a mounted volume shared across services.
SHARED_FILES_BASE_PATH = os.environ.get('SHARED_FILES_PATH', '/usr/src/app/shared/mission-files/')


def robust_execute_plugin(inputs_str: str) -> str:
    temp_dir = None
    try:
        logger.info(f"Received inputs: {inputs_str}")
        # Deduplication: hash the inputs - Do we really want this?
        hash_input = str(inputs_str)
        input_hash = hashlib.sha256(hash_input.encode()).hexdigest()
        if input_hash in helper._seen_hashes:
            return json.dumps([
                {
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "resultDescription": "Duplicate input detected. This input combination has already failed. Aborting to prevent infinite loop.",
                    "error": "Duplicate input detected."
                }
            ])
        helper._seen_hashes.add(input_hash)

        # Temp directory hygiene
        temp_dir = tempfile.mkdtemp(prefix="file_ops_python_")
        os.environ["FILE_OPS_PYTHON_TEMP_DIR"] = temp_dir

        # Parse the input string using shared helper (normalizes primitives -> {'value': ...})
        inputs = helper.parse_inputs(inputs_str)

        # Call the plugin logic
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
        try:
            helper.send_to_errorhandler(e, context=inputs_str)
        except Exception:
            logger.debug("Failed to send error to errorhandler")
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

            # _*_ Note: some operation handlers may return a single dict or a list of dicts.
            # Avoid double-wrapping a list result (which would produce a nested list) by
            # serializing a list as-is when the handler already returned one.
            if isinstance(result, list):
                return json.dumps(result)
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

    def _get_mission_control_url(self, inputs: Dict[str, Any]) -> str:
        return self._get_input_value(inputs, 'missioncontrol_url') or self._get_input_value(inputs, 'missionControlUrl') or os.environ.get('MISSIONCONTROL_URL')

    def _get_librarian_url(self, inputs: Dict[str, Any]) -> str:
        # Helper to get the Librarian URL from environment variables
        # In a real scenario, this might come from a service discovery mechanism
        return self._get_input_value(inputs, 'librarian_url') or self._get_input_value(inputs, 'librarianUrl') or os.environ.get('LIBRARIAN_URL')

    def _read_operation(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        file_id = self._get_input_value(inputs, 'fileId')
        path = self._get_input_value(inputs, 'path')
        mission_id = self._get_input_value(inputs, 'missionId') or self._get_input_value(inputs, 'mission_id')
        librarian_url = self._get_librarian_url(inputs)

        if not librarian_url:
            raise ValueError("LIBRARIAN_URL not found in inputs or environment variables.")

        headers = {}
        cm_token = os.environ.get('CM_AUTH_TOKEN')
        if cm_token:
            headers['Authorization'] = f'Bearer {cm_token}'

        if file_id:
            # Load file content from Librarian using fileId
            response = requests.get(f"http://{librarian_url}/loadData/step-output-{file_id}", headers=headers, params={'collection': 'step-outputs', 'storageType': 'mongo'})
            response.raise_for_status()
            data = response.json().get('data', {})
            content = data.get('fileContent', '')
            return {"success": True, "name": "content", "resultType": "string", "resultDescription": f"Content of file with ID {file_id}", "result": content}
        
        elif path and mission_id:
            # Find file in mission's attachedFiles and load from Librarian
            mission_response = requests.get(f"http://{librarian_url}/loadData/{mission_id}", headers=headers, params={'collection': 'missions', 'storageType': 'mongo'})
            mission_response.raise_for_status()
            mission_data = mission_response.json().get('data', {})
            attached_files = mission_data.get('attachedFiles', [])
            
            found_file = next((f for f in attached_files if f.get('originalName') == path), None)

            if found_file and found_file.get('id'):
                file_id = found_file['id']
                # Load file content from Librarian using fileId from the mission file object
                response = requests.get(f"http://{librarian_url}/loadData/step-output-{file_id}", headers=headers, params={'collection': 'step-outputs', 'storageType': 'mongo'})
                response.raise_for_status()
                data = response.json().get('data', {})
                content = data.get('fileContent', '')
                return {"success": True, "name": "content", "resultType": "string", "resultDescription": f"Content of file at {path}", "result": content}
            else:
                raise FileNotFoundError(f"File not found at path: {path} in mission {mission_id}")
        else:
            raise ValueError("Either 'fileId' or both 'path' and 'missionId' are required for 'read' operation.")

    def _write_operation(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        path = self._get_input_value(inputs, 'path')
        content_str = self._get_input_value(inputs, 'content')
        try:
            # If content is a JSON string, extract the actual content
            content_data = json.loads(content_str)
            if isinstance(content_data, dict) and 'content' in content_data:
                content = content_data['content']
            else:
                content = content_str
        except (json.JSONDecodeError, TypeError):
            content = content_str
            
        mission_id = self._get_input_value(inputs, 'missionId') or self._get_input_value(inputs, 'mission_id')
        mission_control_url = self._get_mission_control_url(inputs)
        librarian_url = self._get_librarian_url(inputs)

        if not all([path, content, mission_id, mission_control_url, librarian_url]):
            missing_params = [
                p for p, v in {
                    'path': path, 'content': content, 'missionId': mission_id,
                    'MISSIONCONTROL_URL': mission_control_url, 'LIBRARIAN_URL': librarian_url
                }.items() if not v
            ]
            raise ValueError(f"Missing required parameters: {', '.join(missing_params)}")

        headers = {}
        cm_token = os.environ.get('CM_AUTH_TOKEN')
        if cm_token:
            headers['Authorization'] = f'Bearer {cm_token}'

        file_id = str(uuid.uuid4())
        file_name = os.path.basename(path)
        mime_type = 'text/plain' # Assuming text for now

        # Store file content in Librarian
        librarian_payload = {
            'id': f'step-output-{file_id}',
            'data': {
                'fileContent': content,
                'originalName': file_name,
                'mimeType': mime_type
            },
            'collection': 'step-outputs',
            'storageType': 'mongo'
        }
        store_response = requests.post(f"http://{librarian_url}/storeData", json=librarian_payload, headers=headers)
        store_response.raise_for_status()

        mission_file = {
            'id': file_id,
            'originalName': file_name,
            'mimeType': mime_type,
            'size': len(content.encode('utf-8')),
            'uploadedAt': datetime.utcnow().isoformat() + 'Z',
            'uploadedBy': 'FILE_OPS_PYTHON',
            'storagePath': f'step-outputs/{mission_id}/{file_name}',
            'description': f"Output from plugin write: {path}"
        }

        # Add the file metadata to the mission in MissionControl
        add_file_response = requests.post(f"http://{mission_control_url}/missions/{mission_id}/files/add", json=mission_file, headers=headers)
        add_file_response.raise_for_status()

        return {"success": True, "name": "file", "resultType": "object", "resultDescription": f"Successfully wrote to file {path}", "result": mission_file}

    def _append_operation(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        path = self._get_input_value(inputs, 'path')
        content_to_append = self._get_input_value(inputs, 'content')
        mission_id = self._get_input_value(inputs, 'missionId') or self._get_input_value(inputs, 'mission_id')
        mission_control_url = self._get_mission_control_url(inputs)
        librarian_url = self._get_librarian_url(inputs)
        
        existing_content = ''
        try:
            # Read the existing content
            read_inputs = {
                'path': {'value': path},
                'missionId': {'value': mission_id},
                'librarianUrl': {'value': librarian_url}
            }
            existing_content_result = self._read_operation(read_inputs)
            existing_content = existing_content_result.get('result', '')

            # If read was successful, file exists. Delete it before we write the new version.
            delete_inputs = {
                'path': {'value': path},
                'missionId': {'value': mission_id},
                'missionControlUrl': {'value': mission_control_url},
                'librarianUrl': {'value': librarian_url}
            }
            self._delete_operation(delete_inputs)
        except FileNotFoundError:
            # File doesn't exist, so we'll just be creating it.
            pass

        # Append new content
        new_content = existing_content + content_to_append

        # Write the full content back as a new file with the same path
        write_inputs = {
            'path': {'value': path},
            'content': {'value': new_content},
            'missionId': {'value': mission_id},
            'missionControlUrl': {'value': mission_control_url},
            'librarianUrl': {'value': librarian_url}
        }
        write_result = self._write_operation(write_inputs)

        return {"success": True, "name": "file", "resultType": "object", "resultDescription": f"Successfully appended to file {path}", "result": write_result.get('result')}

    def _list_operation(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        mission_id = self._get_input_value(inputs, 'missionId') or self._get_input_value(inputs, 'mission_id')
        librarian_url = self._get_librarian_url(inputs)

        if not all([mission_id, librarian_url]):
            raise ValueError("Missing required parameters: 'missionId' and LIBRARIAN_URL.")

        headers = {}
        cm_token = os.environ.get('CM_AUTH_TOKEN')
        if cm_token:
            headers['Authorization'] = f'Bearer {cm_token}'

        mission_response = requests.get(f"http://{librarian_url}/loadData/{mission_id}", headers=headers, params={'collection': 'missions', 'storageType': 'mongo'})
        mission_response.raise_for_status()
        mission_data = mission_response.json().get('data', {})
        attached_files = mission_data.get('attachedFiles', [])
        
        file_names = [f.get('originalName') for f in attached_files]

        return {"success": True, "name": "files", "resultType": "array", "resultDescription": f"Files in mission {mission_id}", "result": file_names}

    def _delete_operation(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        path = self._get_input_value(inputs, 'path')
        mission_id = self._get_input_value(inputs, 'missionId') or self._get_input_value(inputs, 'mission_id')
        mission_control_url = self._get_mission_control_url(inputs)
        librarian_url = self._get_librarian_url(inputs)

        if not all([path, mission_id, mission_control_url, librarian_url]):
            raise ValueError("Missing required parameters: 'path', 'missionId', MISSIONCONTROL_URL, and LIBRARIAN_URL.")

        headers = {}
        cm_token = os.environ.get('CM_AUTH_TOKEN')
        if cm_token:
            headers['Authorization'] = f'Bearer {cm_token}'

        # Find the file in the mission's attachedFiles to get the fileId
        mission_response = requests.get(f"http://{librarian_url}/loadData/{mission_id}", headers=headers, params={'collection': 'missions', 'storageType': 'mongo'})
        mission_response.raise_for_status()
        mission_data = mission_response.json().get('data', {})
        attached_files = mission_data.get('attachedFiles', [])
        
        found_file = next((f for f in attached_files if f.get('originalName') == path), None)

        if not found_file:
            raise FileNotFoundError(f"File not found at path: {path} in mission {mission_id}")

        file_id = found_file['id']

        # Remove the file from the mission in MissionControl
        remove_file_response = requests.post(f"http://{mission_control_url}/missions/{mission_id}/files/remove", json={'fileId': file_id}, headers=headers)
        remove_file_response.raise_for_status()

        # Delete the file content from Librarian
        delete_content_response = requests.delete(f"http://{librarian_url}/deleteData/step-output-{file_id}", headers=headers, params={'collection': 'step-outputs'})
        if delete_content_response.status_code not in [200, 404]:
            delete_content_response.raise_for_status()

        return {"success": True, "name": "status", "resultType": "string", "resultDescription": f"Successfully deleted file {path}", "result": "delete_successful"}


if __name__ == "__main__":
    inputs_str = sys.stdin.read().strip()
    # Call the robust wrapper
    result_str = robust_execute_plugin(inputs_str)
    print(result_str)
