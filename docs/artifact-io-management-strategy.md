# Artifact and I/O Management Strategy

This document outlines strategies for managing plugin-generated artifacts, focusing on user downloads, and for improving the handling of input/output dependencies between plugin execution steps.

## 1. User Download of Artifacts

### 1.1. Current State

A basic system for handling artifacts is in place:

*   **Storage:** The `Librarian` service, using MongoDB's GridFS, stores all plugin outputs, including file-based artifacts.
*   **Metadata:** The `WorkProduct` and `MissionFile` objects store basic metadata about the outputs.
*   **Access:** The `Librarian`'s `storeData` and `loadData/:id` endpoints are used to save and retrieve artifacts. The `mcs-react` frontend has basic components to display these outputs.

### 1.2. Proposed Enhancements

The current system provides a foundation, but to create a more robust and user-friendly artifact management system, the following enhancements are proposed:

1.  **Dedicated File Storage:**
    *   **Proposal:** While GridFS is functional, for enhanced scalability and performance, migrating to a dedicated object storage solution (e.g., AWS S3, Google Cloud Storage, Azure Blob Storage) is recommended.
    *   **Rationale:** This would provide better durability, cost-efficiency for large files, and open up possibilities for CDN integration and advanced lifecycle management policies.

2.  **`PluginOutput` Modification:**
    *   **Proposal:** Extend the `PluginOutput` object to include a dedicated `artifactMetadata: ArtifactMetadata[]` field.
    *   **Rationale:** This will create a standardized way for plugins to declare artifact metadata, making it easier for the system to handle and display artifacts.

3.  **`ArtifactMetadata` Structure:**
    *   **Proposal:** Define a clear `ArtifactMetadata` structure to be stored in the primary database.
    *   **Fields:**
        *   `artifactId`: (string) A unique identifier for the artifact.
        *   `name`: (string) A user-friendly name for the artifact.
        *   `description`: (optional string) A brief description of the artifact.
        *   `storagePath`: (string) The path or key of the artifact in the dedicated file storage.
        *   `mimeType`: (string) The MIME type of the artifact.
        *   `size`: (number) The size of the artifact in bytes.
        *   `createdAt`: (Date) Timestamp of when the artifact was created.
        *   `pluginExecutionId`: (string) ID linking to the specific plugin execution.

4.  **`Librarian` Service Modifications:**
    *   **Proposal:**
        *   Enhance the `Librarian` service to handle the new `ArtifactMetadata` structure and interact with the dedicated file storage.
        *   Create a new, dedicated download endpoint, e.g., `GET /api/v1/artifacts/download/{artifactId}`. This endpoint would handle authentication, authorization, and streaming the file to the user, or generating a pre-signed URL.

5.  **Frontend Changes:**
    *   **Proposal:** Update the UI to display the detailed artifact information from `ArtifactMetadata` and provide user-friendly download links that use the new download endpoint.

### 1.3. Security Considerations for the Proposed Download Endpoint

*   **Authentication and Authorization:** The endpoint must be protected, ensuring users can only access artifacts they are authorized to view.
*   **Input Validation:** The `artifactId` should be validated to prevent security vulnerabilities.
*   **Pre-signed URLs:** If used, they must be short-lived and have appropriate permissions.
*   **Resource Limiting:** Consider rate limiting to prevent abuse.

## 2. Input/Output Dependency Handling

### 2.1. Current State

*   **Dependency Resolution:** The `Step.ts` class and the `InputResolver` in the `capabilitiesmanager` service handle the resolution of dependencies between steps.
*   **Error Handling:** Basic error handling for missing dependencies is in place.
*   **Documentation:** The `plugin-development-guide.md` and `python-plugin-development-guide.md` provide some guidance for developers.

### 2.2. Proposed Enhancements

1.  **Enhancements to `ACCOMPLISH` Prompt for Output Naming:**
    *   **Proposal:** Modify the prompt for `ACCOMPLISH` to explicitly instruct the LLM to provide descriptive and unique names for each distinct output a plugin step produces.

2.  **Stricter Validation of Dependencies:**
    *   **Proposal:** Before executing a plan, parse it and validate all input-output dependencies. If validation fails, reject the plan with a clear error message.

3.  **Improved Error Handling:**
    *   **Proposal:** Enhance the error messages for dependency lookup failures to be more informative, including the step, input, and available outputs.

4.  **Handling Multiple Outputs with Custom Names:**
    *   **Proposal:** To provide more flexibility, a mechanism for mapping a plugin's declared output names to custom names within a step's context should be implemented.
    *   **Implementation Idea:**
        1.  **Step Definition in Plan:** Allow the `outputs` property of a step in a plan to be a map from the plugin's declared output names to custom aliases.
        2.  **Dependency Resolution:** The `InputResolver` would be responsible for mapping the alias back to the original output name when resolving dependencies for subsequent steps.

5.  **Clearer Documentation for Plugin Developers:**
    *   **Proposal:** Create comprehensive documentation for plugin developers on how to declare multiple, named outputs in their manifests and how to structure their plugin's return values.

## 3. Conclusion

The current system provides a basic framework for artifact and I/O management. The proposed enhancements aim to create a more user-friendly, robust, and debuggable plugin ecosystem. Implementing a dedicated file storage solution, a standardized artifact metadata structure, and a more sophisticated dependency resolution mechanism will significantly improve the system's capabilities.
