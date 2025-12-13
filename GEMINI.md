# Gemini Custom Policies and Information

## Policies
- I will not modify test files.
- I will not introduce new library dependencies without explicit user permission.
- I am permitted to create new test files as needed to validate my changes.
- Creating plans with non-existent `actionVerbs` is expected behavior. The system is designed to handle these novel verbs, and I should not attempt to "fix" or prevent them.

## File Hashes
- `services/agentset/src/agents/Step.ts`: 2a71644788de4315257a3e740875883d6a690223737b67362337728f32c7483e
# Gemini Added Memories

**Issue:** `SyntaxError: invalid syntax` in `services/capabilitiesmanager/dist/plugins/SCRAPE/main.py`. This manifested as `Plugin execution error: 'ScrapePlugin' object has no attribute 'execute'`. The root cause was an incorrect indentation of the `execute` method within the `ScrapePlugin` class in the source file, making it a global function rather than a class method.
    *   **Reasoning for change:** Corrected the indentation of the `execute` method to place it correctly within the `ScrapePlugin` class. This resolves the Python syntax error and ensures the method is accessible as intended by the class.
    *   **Architectural principle/standard:** Adherence to language-specific (Python) class and method definition syntax. Correct module structure is fundamental for predictable execution.
*   **Issue:** `NameError: name 'file_id' is not defined` in `services/capabilitiesmanager/src/plugins/FILE_OPS_PYTHON/main.py` during `_write_operation`. This prevented successful file saving and contributed to the 404 download errors and `fileContent: null` in deliverables. The problem arose because the `file_id` and `file_name` variables were being used within the `librarian_payload` dictionary construction before they had been assigned values.
    *   **Reasoning for change:** Relocated the instantiation of `file_id = str(uuid.uuid4())` and `file_name = os.path.basename(path)` to occur immediately before they are referenced in the `librarian_payload` and `mission_file` dictionaries within the `_write_operation` method. This ensures that these variables are properly defined and in scope when they are first used.
    *   **Architectural principle/standard:** Fundamental variable scoping rules. Ensures data integrity for file metadata and content storage.
*   **Issue:** Incorrect `mimeType` potentially being sent for structured data (e.g., JSON arrays/objects) saved via `FILE_OPERATION`. While the `NameError` prevented full testing, ensuring the correct MIME type is crucial.
    *   **Reasoning for change:** Modified `_write_operation` to intelligently set the `mime_type` for the `mission_file` metadata. If the `content_input` was originally a non-string object (e.g., a list or dictionary) and thus converted to a JSON string via `json.dumps`, the `mime_type` is set to `'application/json'`. Otherwise, it defaults to `'text/plain'`.
    *   **Architectural principle/standard:** Accurate metadata is vital for downstream services (like MissionControl and the frontend) to correctly interpret and handle file content. This improves data consistency and system robustness.
*   **Issue:** Persistent `SyntaxError: invalid syntax` in `services/capabilitiesmanager/src/plugins/SCRAPE/main.py` at line 431, and `NameError: name 'librarian_url' is not defined` in `services/capabilitiesmanager/src/plugins/FILE_OPS_PYTHON/main.py`.
    *   **Reasoning for change (SCRAPE/main.py):** The `SyntaxError` was caused by an incorrect logical flow and indentation within the `execute` method's URL validation logic. A `return` statement was prematurely followed by executable code, breaking the `try...except` structure. Additionally, a typo (`_extract_url_url_from_input`) and a misplaced `return value` in `_extract_url_from_input` were identified. The `execute` method's initial URL validation logic was restructured for clarity and correctness. The typo in `_extract_url_from_input` was corrected, and the misplaced `return value` was removed.
    *   **Reasoning for change (FILE_OPS_PYTHON/main.py):** The `NameError` in `_write_operation` stemmed from `librarian_url`, `mission_control_url`, `mission_id`, and `headers` being used without explicit local definition. The fix involved retrieving these values at the beginning of the `_write_operation` method using the appropriate getter methods (`self._get_librarian_url`, `self._get_mission_control_url`, `self._get_input_value`) and constructing the `headers` dictionary with the authentication token.
    *   **Architectural principle/standard:** Adherence to Python's strict syntax and scoping rules. Ensuring proper variable definition and flow control within methods is crucial for robust plugin execution. The fixes reinforce the importance of local validation and compilation for Python plugins within the CapabilitiesManager service.

I have applied these fixes and successfully rebuilt the `services/capabilitiesmanager`. I am now waiting for the user to relaunch the mission via the frontend to verify these latest changes.