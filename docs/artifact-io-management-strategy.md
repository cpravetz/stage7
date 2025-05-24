# Artifact and I/O Management Strategy

This document outlines strategies for managing plugin-generated artifacts, focusing on user downloads, and for improving the handling of input/output dependencies between plugin execution steps.

## 1. User Download of Artifacts

Many plugins may generate artifacts that are valuable for users to download, such as reports, data files, images, or logs. Providing a secure and efficient way for users to access these artifacts is crucial.

### 1.1. Need for User Download

*   **Data Portability:** Users need to export generated data for use in other tools or for offline analysis.
*   **Reporting:** Generated reports (e.g., PDF, CSV, HTML) are often primary outputs that users need to save or share.
*   **Debugging and Analysis:** Log files or intermediate data artifacts can be useful for developers or advanced users for troubleshooting or deeper analysis.
*   **Compliance and Archival:** Users may need to download artifacts for record-keeping or compliance purposes.

### 1.2. Proposed System for Artifact Download (Option D2)

Serving files directly from a database (e.g., MongoDB GridFS, though capable) for frequent user downloads can lead to performance bottlenecks on the database, increased application server load for streaming, and less flexibility in managing file storage (e.g., CDN integration, lifecycle policies). A dedicated file storage solution is preferred.

**The proposed system consists of the following components:**

1.  **Dedicated File Storage:**
    *   **Technology:** A dedicated object storage solution (e.g., AWS S3, Google Cloud Storage, Azure Blob Storage) or a dedicated network file system (NFS) accessible by the `Librarian` service.
    *   **Rationale:** Scalability, durability, cost-efficiency for storing potentially large files, and features like versioning, lifecycle management, and integration with CDNs.

2.  **`PluginOutput` Modification:**
    *   The `PluginOutput` object (or equivalent structure that stores the result of a plugin execution) will be extended to include metadata about any generated artifacts.
    *   **New Field:** `artifactMetadata: ArtifactMetadata[]` (an array to support multiple artifacts from a single plugin execution).

3.  **`ArtifactMetadata` Structure:**
    *   This structure will be stored in the primary database (e.g., MongoDB) associated with the plugin execution record.
    *   **Fields:**
        *   `artifactId`: (string) A unique identifier for the artifact (e.g., UUID).
        *   `name`: (string) The user-friendly name of the artifact (e.g., "Monthly Sales Report.pdf", "simulation-data.csv"). This could be provided by the plugin or derived.
        *   `description`: (optional string) A brief description of the artifact.
        *   `storagePath`: (string) The actual path or key of the artifact in the dedicated file storage (e.g., `s3://bucket-name/artifacts/{executionId}/{artifactId}/file.pdf`). This path is primarily for internal use by the `Librarian`.
        *   `mimeType`: (string) The MIME type of the artifact (e.g., "application/pdf", "text/csv").
        *   `size`: (number) The size of the artifact in bytes.
        *   `createdAt`: (Date) Timestamp of when the artifact was created.
        *   `pluginExecutionId`: (string) ID linking to the specific plugin execution that generated this artifact.

4.  **`Librarian` Service Modifications:**
    *   **Storing Artifacts:**
        *   When a plugin execution generates an artifact, the `Librarian` service (or the component responsible for handling plugin outputs) will:
            1.  Generate a unique `artifactId`.
            2.  Upload the artifact file to the dedicated file storage under a structured path (e.g., using `pluginExecutionId` and `artifactId`).
            3.  Create an `ArtifactMetadata` record containing the details (including the `storagePath`) and save it to the database.
    *   **New Download Endpoint:**
        *   The `Librarian` service will expose a new, authenticated API endpoint, e.g., `GET /api/v1/artifacts/download/{artifactId}`.
        *   This endpoint will:
            1.  Verify the user's authentication and authorization to access the artifact (e.g., based on ownership of the plugin execution or specific permissions).
            2.  Retrieve the `ArtifactMetadata` from the database using the `artifactId`.
            3.  Fetch the file from the dedicated file storage using the `storagePath`.
            4.  Stream the file back to the user with appropriate HTTP headers (e.g., `Content-Disposition: attachment; filename="name.pdf"`, `Content-Type: mimeType`).
            *   **Alternative for Cloud Storage:** For cloud object storage, this endpoint could generate a short-lived pre-signed URL and redirect the user to it, offloading the actual file transfer to the cloud provider.

5.  **Frontend Changes:**
    *   The user interface will need to be updated to:
        *   List available artifacts associated with a plugin execution or task, using the `artifactMetadata` (name, description, size, type).
        *   Provide download buttons/links that call the new `Librarian` download endpoint.

### 1.3. Security Considerations for the Download Endpoint

*   **Authentication:** The endpoint must be protected and require valid user authentication.
*   **Authorization:** Users should only be able to download artifacts they are authorized to access (e.g., artifacts from their own tasks or executions). Implement access control checks based on `pluginExecutionId` or task ownership.
*   **Input Validation:** Validate the `artifactId` parameter to prevent path traversal or other injection attacks if it influences file paths directly (less of an issue if it's a UUID used for DB lookup).
*   **Pre-signed URLs (if used):** Ensure they are short-lived and generated with appropriate permissions.
*   **Resource Limits:** Consider rate limiting or other measures if abuse is a concern, though offloading to dedicated storage mitigates some of this.

## 2. Input/Output Dependency Handling Improvements

Clear and robust handling of dependencies between the outputs of one plugin step and the inputs of subsequent steps is critical for the reliable execution of multi-step plans generated by `ACCOMPLISH` and executed by `Step.ts` (or similar).

### 2.1. Review of Current State (Hypothesized)

*   **`ACCOMPLISH` Prompt:** The LLM is likely prompted to define a plan with steps. For each step, it might specify an `outputName` (or a similar field) that subsequent steps can reference as an input.
*   **Plan/Step Execution (`Step.ts`):**
    *   Each `Step` object likely has an `inputs` map (e.g., `{"input_param_name": "value_or_reference_to_previous_output"}`) and one or more declared output names.
    *   A method like `Step.populateInputsFromDependencies(previousStepsOutputs: Map<string, any>)` probably iterates through its `inputs`. If an input value is a reference (e.g., `steps.step_1.outputName`), it looks up `outputName` in the `previousStepsOutputs` from `step_1`.

### 2.2. Identified Areas for Improvement

1.  **Clarity and Uniqueness of `outputName`:** LLMs might generate generic `outputName`s like "result", "output", "file", making it ambiguous if a step produces multiple distinct outputs or if multiple steps use the same generic name.
2.  **Handling Multiple Outputs from a Single Step:** The current system might only support a single named output per step, or the LLM might not be guided to define multiple, uniquely named outputs when appropriate.
3.  **Error Handling for Missing Dependencies:** When `populateInputsFromDependencies` fails to find a referenced output, the error message might be unhelpful (e.g., "dependency not found") without specifying which input, which step, or what outputs *were* available.
4.  **Lack of Documentation for Plugin Developers:** Plugin developers might not have clear guidelines on how to declare their output names in the manifest or how to structure their plugin's return value to provide multiple named outputs.

### 2.3. Proposed Refinements

1.  **Enhancements to `ACCOMPLISH` Prompt for Output Naming:**
    *   **Instruction:** Modify the prompt for `ACCOMPLISH` to explicitly instruct the LLM to:
        *   Provide descriptive and unique names for each distinct output a plugin step produces (e.g., `summaryReport`, `rawDataset`, `processedImage`).
        *   If a plugin step is expected to produce multiple artifacts or pieces of data intended for different downstream consumers, define a separate, clearly named output for each.
    *   **Example Prompt Snippet:** "For each step in the plan, define its `outputs`. Each output should have a unique `name` within that step (e.g., `cleaned_text`, `sentiment_score`). If a step generates a file and also a summary string, define two distinct outputs: `{"name": "generated_file", "type": "file_path"}, {"name": "summary_string", "type": "string"}`. Subsequent steps must refer to these outputs by their unique names."

2.  **Stricter Validation of Dependencies During Plan Parsing/Loading:**
    *   **Process:** Before executing a plan, parse it and validate all input-output dependencies.
    *   **Logic:** For each step, iterate through its declared input dependencies. If an input `input_A` for `step_N` references `steps.step_M.output_X`, verify that `step_M` explicitly declares an output named `output_X`.
    *   **Action:** If validation fails, reject the plan with a clear error message before execution begins.
    *   **Benefit:** Catches planning errors (e.g., LLM hallucinations of outputs) early.

3.  **Improved Error Handling in `Step.populateInputsFromDependencies`:**
    *   **Enhanced Error Messages:** If a dependency lookup fails at runtime, provide a more informative error message.
    *   **Example:** "Error populating inputs for step `step_N` (Plugin: `PluginName`): Input `input_A` requires output `output_X` from step `step_M`. However, step `step_M` did not produce an output named `output_X`. Available outputs from step `step_M` are: [`list_of_actual_output_names_from_step_M`]."
    *   **Benefit:** Greatly aids in debugging plan execution issues.

4.  **Support for Output Aliasing in Plan (Optional Complexity):**
    *   **Concept:** Allow steps to define an alias for inputs if direct LLM control over output names is consistently difficult.
    *   **Example Plan Snippet:**
        ```json
        {
          "stepName": "step_N",
          "plugin": "SomePlugin",
          "inputs": {
            "plugin_expected_input_name": {"sourceStep": "step_M", "outputName": "llm_generated_unpredictable_output_name"}
          }
        }
        ```
    *   **Consideration:** This adds complexity to plan structure and execution but can provide a workaround for LLM output variability. Prefer improving prompts and direct output naming first.

5.  **Clear Documentation for Plugin Developers:**
    *   **Content:**
        *   How to declare multiple, named outputs in `plugin-manifest.json` (e.g., an `outputs` array in each verb definition, specifying `name` and `type`).
        *   How the plugin code should return a dictionary/map where keys are these declared output names and values are the corresponding data.
        *   Best practices for choosing clear, descriptive, and consistent output names.
    *   **Example `plugin-manifest.json` Snippet:**
        ```json
        "verbs": [{
          "name": "processData",
          "description": "Cleans data and generates a summary.",
          "inputs": [{"name": "rawData", "type": "string"}],
          "outputs": [
            {"name": "cleanedData", "type": "string", "description": "The cleaned data content."},
            {"name": "processingSummary", "type": "string", "description": "A summary of the processing steps."}
          ]
        }]
        ```
    *   **Example Python Plugin Return:**
        ```python
        def process_data(raw_data):
            # ... processing logic ...
            cleaned_data_content = "..."
            summary_content = "..."
            return {
                "cleanedData": cleaned_data_content,
                "processingSummary": summary_content
            }
        ```
    *   **Benefit:** Empowers developers to create plugins that integrate reliably into multi-step plans.

## 3. Conclusion

The proposed strategies for artifact downloads and I/O dependency handling aim to create a more user-friendly, robust, and debuggable plugin ecosystem. Implementing a dedicated file storage solution with clear metadata management for artifacts will enhance user experience. Refining how `ACCOMPLISH` defines outputs and how `Step.ts` validates and resolves these dependencies will lead to more reliable execution of complex plugin chains and easier troubleshooting. Clear documentation for plugin developers is paramount for the success of these I/O improvements.
