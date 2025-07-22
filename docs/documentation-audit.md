# Documentation Audit & Cleanup Plan

This document summarizes findings from a review of the project documentation against the current codebase. It identifies documents that are out-of-date, incorrect, or describe a future state, and provides recommendations for updating them.

---

## 1. Out-of-Date Documents

These documents contain information that was once correct but is now outdated due to subsequent development.

### `docs/TASK_MANAGER_PLUGIN_DESIGN.md`

This design document is significantly out of date.

*   **Issue**: The document specifies a **TypeScript** implementation (`main.ts`).
*   **Current State**: The `july20plan.md` and overall project direction confirm the plugin was migrated to **Python**.
*   **Recommendation**:
    *   Update all references from `main.ts` to `main.py`.
    *   In the `manifest.json` example, change `"language": "typescript"` to `"language": "python"`.
    *   Add a note at the top of the document stating: `This document has been updated to reflect the plugin's migration from TypeScript to Python.`

### `docs/july20plan.md`

This progress-tracking document contains items marked as "COMPLETED" that are inconsistent with the current code.

*   **Issue 1**: It states that circular reference detection was **added** to the `ACCOMPLISH` plugin.
*   **Current State**: The code in `services/capabilitiesmanager/src/plugins/ACCOMPLISH/main.py` explicitly states this logic was **removed** to allow for legitimate recursive/nested `actionVerb` calls.
*   **Recommendation**:
    *   Amend the "COMPLETED" entry for the ACCOMPLISH plugin. The description should be changed to reflect that the circular reference logic was initially implemented and later removed as an intentional design improvement.

*   **Issue 2**: It claims the `LocalRepository.fetchByVerb()` was optimized to use a cached plugin list instead of directory scanning.
*   **Current State**: The code in `marketplace/dist/repositories/LocalRepository.js` shows that `fetchByVerb()` and `delete()` still perform file system directory scans and do not use the `pluginListCache`. The cache is primarily used by the `list()` method.
*   **Recommendation**:
    *   Mark this optimization as **partially complete** or **incorrect**. The description should be clarified to state that caching was implemented for the `list()` method, but other operations like `fetchByVerb()` and `delete()` still rely on directory iteration.

---

## 2. Documents Describing a Future State

These documents are not "wrong" but describe features and designs that are not yet implemented in the core production system. They should be clearly marked as such to avoid confusion.

### Design Documents for Unimplemented Plugins

*   `docs/CODE_EXECUTOR_PLUGIN_DESIGN.md`
*   `docs/API_CLIENT_PLUGIN_DESIGN.md`
*   `docs/DATA_TOOLKIT_PLUGIN_DESIGN.md`
*   `docs/CHAT_PLUGIN_DESIGN.md`

*   **Issue**: These documents describe powerful new plugins that are not listed in the primary production set in `README.md` or `TRANSFORMATION_COMPLETE.md`.
*   **Recommendation**: Add a disclaimer box at the top of each of these files.

    ```markdown
    > **Note:** This document describes a proposed design for a new plugin. It does not reflect a feature that is currently implemented in the production system.
    ```

### Documents for Advanced System Capabilities

*   `docs/agent-systems-improvements.md`
*   `docs/collaboration-services.md`
*   `docs/auth-improvements.md`

*   **Issue**: These documents outline a sophisticated vision for agent lifecycle, collaboration, and a detailed Role-Based Access Control (RBAC) system. These features are far more advanced than what is described in the primary `authentication-system.md` or `README.md`.
*   **Recommendation**: Add a disclaimer box at the top of each of these files.

    ```markdown
    > **Note:** This document outlines a strategic vision and design for future system enhancements. It does not reflect the capabilities of the currently implemented system.
    ```

---

By making these changes, the documentation will more accurately reflect the project's current state, clearly distinguishing between what is implemented, what has changed, and what is planned for the future.