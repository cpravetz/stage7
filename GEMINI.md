- The `CONTENT_GENERATION` plugin now receives correct input definitions due to modifications in `services/librarian/src/Librarian.ts`, `services/capabilitiesmanager/src/CapabilitiesManager.ts`, and `services/capabilitiesmanager/src/plugins/ACCOMPLISH/main.py`. The `ACCOMPLISH` plugin's prompt to the Brain now includes detailed schema information for each verb, guiding the Brain to generate valid plan steps. Additionally, the `PlanValidator` now receives the full `availablePlugins` list (including `inputDefinitions`) from the `CapabilitiesManager` and uses this to generate more targeted repair instructions when the Brain fails to provide required inputs.

Please rebuild the project (`docker compose build --no-cache`) and relaunch the mission via the frontend to verify these fixes.
- I have consolidated all Brain-related documentation files into a single `docs/BRAIN_SERVICE.md` file and removed the original redundant files.
- I have consolidated all TrafficManager-related documentation files into a single `docs/TRAFFICMANAGER_SERVICE.md` file and removed the original redundant files.
- I have consolidated all CTO Assistant-related documentation files into a single `docs/CTO_ASSISTANT_SERVICE.md` file and removed the original redundant files.
- I have consolidated all Mission Failure Analysis documentation files into a single `docs/MISSION_FAILURE_ANALYSIS.md` file and removed the original redundant files.
- I have consolidated all Agent Delegation documentation files into a single `docs/AGENT_DELEGATION.md` file and removed the original redundant files.
