# Frontend Usability Remediation Plan

> A review of all pages and components under `frontend-nextgen/src/` to identify jargon, mis-formatted fields, unnecessary inputs, confusing/redundant items, overly long tables, mis-labeled buttons, raw JSON display, and other usability issues.
>
> **Severity key:** 🔴 High — confusing or blocks task. 🟠 Medium — degrades UX or inconsistent. 🟢 Low — polish / minor friction.

---

## 1. Jargon & Terminology Issues

### 1.1 "HITL" / "Human-in-the-Loop" (everywhere)
The acronym **HITL** never appears expanded on-screen. Users who don't know it cannot infer meaning.

| Location | Current | Suggested replacement |
|---|---|---|
| `panels/HITLPanel.tsx` line 19 — `<h3>Human-in-the-Loop Controls</h3>` | Human-in-the-Loop Controls | Human Review |
| `panels/HITLPanel.tsx` line 20 — `<p className="hint">… HITL gates will appear here …</p>` | HITL gates | Human review steps |
| `panels/HITLPanel.tsx` line 27 — `<p>No pending approvals. HITL gates will appear here…</p>` | HITL gates | Review requests |
| `EntityWorkspace.tsx` line 377 — tab label `'hitl'` rendered as `'Human-in-Loop'` (note: typo — missing hyphen) | Human-in-Loop | Human Review |
| `overview` panel — used in comments and state only | HITL | Human review (already internal, no change needed) |

> The `TabKey` type in `assistantViewStore.ts` line 3 can keep the key `'hitl'` as an internal identifier; only the **label** needs to change.

### 1.2 "Brain / LLM Layer" page title and jargon
| Location | Current | Suggested replacement |
|---|---|---|
| `pages/Brain.tsx` line 159 — `<h1>Brain / LLM Layer</h1>` | Brain / LLM Layer | AI Services |
| `pages/Brain.tsx` line 163 — `<h3>Completion</h3>` | Completion | Test Prompt |
| `pages/Brain.tsx` line 263 — `<h3>Brain Activity Log</h3>` | Brain Activity Log | Activity Log |
| `pages/Brain.tsx` line 191 — `<h3>Cache Stats</h3>` | Cache Stats | Response Cache |
| `pages/Brain.tsx` line 204 — `<h3>Circuit Breakers</h3>` | Circuit Breakers | Provider Status |
| `pages/Brain.tsx` lines 144–148, 205–209, 280–285 — multi-line paragraphs explaining the distinction between circuit-breaker failures and attempt errors | Inline dense paragraphs | A short, plain-language sentence focused on whether each provider is available |
| Sidebar line 11 | Brain | AI Services |

**Rationale:** "Circuit Breaker" is an implementation detail. Show provider availability with plain-language labels such as **Up**, **Down**, and, if needed, **Recovering**; do not expose internal state names or require users to understand how the protection works. "Brain" is an internal codename; "AI Services" better covers this page's model, provider, cache, and activity information.

### 1.3 "Transaction Guidance"
This phrase appears in `Assistants.tsx`, `ConfigurationPanel.tsx`, and `EntityWorkspace.tsx`. It describes rules the assistant should follow during transactions/interactions.

| Location | Current | Suggested replacement |
|---|---|---|
| `Assistants.tsx` line 250 — `<h4>Transaction Guidance</h4>` | Transaction Guidance | Behavior Rules |
| `Assistants.tsx` line 253 — placeholder `"Guidance rule (e.g. Always confirm before booking)"` | Guidance rule | Rule |
| `Assistants.tsx` line 303 — `<h4>Transaction Guidance</h4>` (edit form) | Transaction Guidance | Behavior Rules |
| `panels/ConfigurationPanel.tsx` line 69 — `<h3>Transaction Guidance</h3>` | Transaction Guidance | Behavior Rules |
| `panels/ConfigurationPanel.tsx` line 72 — hint text mentioning "transaction-level behavior" | transaction-level behavior | during interactions |
| `panels/ConfigurationPanel.tsx` line 77 — placeholder `"Guidance rule"` | Guidance rule | Rule |
| `EntityWorkspace.tsx` line 303 — "Transaction Guidance" header | (same) | Behavior Rules |
| `OverviewPanel.tsx` line 103 — `<strong>Guidance Rules:</strong>` | Guidance Rules | Behavior Rules |
| `OverviewPanel.tsx` line 122 — hint text mentioning "guidance rules" | guidance rules | behavior rules |

### 1.4 "Skills" vs. "Tools" inconsistency
The codebase uses both "skills" and "tools" for capabilities an assistant can use; confirm whether these terms refer to the same product concept before changing labels.

| Location | Current | Suggested replacement |
|---|---|---|
| `EntityWorkspace.tsx` line 377 — tab `'skill settings'` | skill settings | Tool Settings, if these are the same concept |
| `OverviewPanel.tsx` line 129 — `<h3>Skills</h3>` | Skills | Tools, if these are the same concept |
| `OverviewPanel.tsx` line 131 — "No skills bound to this assistant." | skills | tools, if these are the same concept |
| `OverviewPanel.tsx` line 203 — "This automatic Skill…" | Skill | Tool, if these are the same concept |
| `panels/ToolsPanel.tsx` line 36 — `<h3>Bound Skills</h3>` | Bound Skills | Bound Tools, if these are the same concept |
| `panels/ToolsPanel.tsx` line 38 — "No skills bound to this assistant." | skills | tools, if these are the same concept |

> **Note:** "Skills," "tools," and "capabilities" appear to overlap, but may represent distinct concepts. Confirm the product distinction before standardizing labels; use one term consistently only where the UI means the same thing. Avoid a global replacement that could mislabel a different capability type.

### 1.5 "System Prompt" / "Persona"
| Location | Current | Suggested replacement |
|---|---|---|
| `panels/ConfigurationPanel.tsx` line 55 — `<h3>System Prompt</h3>` | System Prompt | Instructions |
| `panels/ConfigurationPanel.tsx` line 56 — hint "Edit the base system prompt…" | system prompt | instructions |
| `panels/ConfigurationPanel.tsx` line 61 — placeholder `"System prompt"` | System prompt | Instructions |
| `OverviewPanel.tsx` line 98 — `<h3>Persona</h3>` | Persona | About |
| `OverviewPanel.tsx` line 101 — "Skills Bound:" | Skills Bound | Tools Bound, if these are the same concept |
| `OverviewPanel.tsx` line 103 — "Guidance Rules:" | Guidance Rules | Behavior Rules |
| `OverviewPanel.tsx` line 104 — "Memory Keys:" | Memory Keys | Memory Entries |
| `EntityWorkspace.tsx` line 396 — `<span className="badge persisted">persisted</span>` | persisted | Active |

### 1.6 "Tenant ID" exposed to users
| Location | Current | Suggested replacement |
|---|---|---|
| `pages/Vault.tsx` line 19 — `useState<string>('')` for tenantId, line 99 field, line 42 in payload | Tenant ID (free text) | Remove the field entirely; use the authenticated session context. If multi-tenant is real, auto-fill from session. |
| `pages/Assistants.tsx` line 137 — `tenantId: 'tenant-1'` hardcoded | (not exposed to user) | — |

### 1.7 "ID (optional — auto-generated)" fields
| Location | Current | Suggested replacement |
|---|---|---|
| `pages/Assistants.tsx` line 223 — placeholder `"ID (optional — auto-generated)"` | (shown to user) | Hide the field from general users; keep the existing ID generation behavior and show the resulting ID after creation. Keep custom IDs only if builders/admins need them. |
| `Tools.tsx` line 217 — placeholder `"ID (optional, auto-generated if blank)"` | (shown to user) | Same — hide for general users, keep current generation behavior, and show the resulting ID after creation. |

### 1.8 "Knowledge content" / "Knowledge Base" — terse and unlabeled
| Location | Current | Suggested replacement |
|---|---|---|
| Multiple: `Knowledge content` placeholder | Knowledge content | "Enter the knowledge text…" or similar. The word "content" alone is too generic. |
| `Assistants.tsx` line 230 — `<h4>Knowledge Base</h4>` | Knowledge Base | Knowledge |
| `ConfigurationPanel.tsx` line 105 — `<h3>Knowledge Base</h3>` | Knowledge Base | Knowledge |
| `Canvas.tsx` line 190 — "Knowledge supplied to this assistant" | (clear) | — |

### 1.9 "Register" vs. "Create" vs. "Save"
| Location | Current | Suggested replacement |
|---|---|---|
| `pages/Assistants.tsx` line 201 — "Register a new assistant" button | Register | Create Assistant |
| `pages/Assistants.tsx` line 267 — "Register" submit button | Register | Create Assistant |
| `pages/Tools.tsx` line 215 — `<h3>Register Tool</h3>` | Register Tool | Create Tool |
| `pages/Tools.tsx` line 254 — "Register" button | Register | Create Tool |
| `panels/Settings.tsx` line 143 — "Save Preferences" | Save Preferences | Save |
| `panels/ToolsPanel.tsx` line 100 — "Save Tool Bindings" | Save Tool Bindings | Save Changes |

---

## 2. Mis-formatted Fields (Too Narrow / Too Few Lines)

### 2.1 Textareas with too few rows

| File:line | Field | Current rows | Recommended rows | Reason |
|---|---|---|---|---|
| `pages/Assistants.tsx:225` | Description (register) | 2 | 3–4 | Descriptions are often a full sentence or two; 2 rows feels cramped. |
| `pages/Assistants.tsx:227` | System Prompt (register) | 3 | 6–8 | System prompts are typically multi-sentence; 3 rows forces excessive scrolling. |
| `pages/Assistants.tsx:229` | Knowledge content (register) | 2 | 4 | Knowledge entries are often paragraphs. |
| `pages/Assistants.tsx:279` | Description (edit) | 2 | 3–4 | Same as register form. |
| `pages/Assistants.tsx:280` | System Prompt (edit) | 3 | 6–8 | Same as register form. |
| `pages/Assistants.tsx:288` | Knowledge content (edit) | 2 | 4 | Same. |
| `pages/Vault.tsx:109` | Secret value | 3 | 8–10 | Secrets (API keys, tokens, passwords) can be long; 3 rows is insufficient. |
| `pages/Brain.tsx:169` | Prompt | 4 | 6 | Prompt testing needs more space. |
| `pages/Missions.tsx:183` | "What should the agents do?" | 4 | 6–8 | Mission prompts are often detailed. |
| `panels/ConfigurationPanel.tsx:63` | System Prompt / Instructions | 8 | 10–12 | Should be larger for a primary editing field. |
| `panels/ConfigurationPanel.tsx:130` | Knowledge content | 3 | 5 | Same as above. |

### 2.2 Single-line text inputs that should be wider or are too narrow

| File:line | Field | Issue | Suggested fix |
|---|---|---|---|
| `pages/Vault.tsx:92` | Secret name | Single-line, no width constraint | Add `className="flex-grow"` or explicit width. |
| `pages/Vault.tsx:99` | Secret value textarea | Only 3 rows (see 2.1) | Increase rows. |
| `pages/EntityWorkspace.tsx:32-33` | Mission input | `rows={3}` via OverviewPanel | Should be `rows={4–5}`. |
| `panels/ConfigurationPanel.tsx:169,178` | Metadata key / value | Value may need to be multi-line | Consider a textarea for values. |
| `Tools.tsx:217-219` | ID / Name / Description register fields | All single-line | Description at least 2–3 rows. |

### 2.3 CSS — `.form` uses `gap: 10px` but no consistent width
| File:line | Issue | Suggested fix |
|---|---|---|
| `index.css:181-185` `.form` | Form fields have no `width: 100%` on inputs inside `.form`. The CSS targets `.form input, .form select, .form textarea` (lines 187–196) but only via the global rule at lines 198–209. This is inconsistent. | Ensure all `.form` field children get `width: 100%` and `box-sizing: border-box`. |

### 2.4 Narrow truncate columns in tables
| File:line | Table column | Issue | Suggested fix |
|---|---|---|---|
| `Dashboard.tsx:249` | `truncate` class on mission name | `max-width: 180px` (CSS line 313). Workflow IDs like `mission-abc123-def456-ghi789` get cut off. | Increase to `240px` or use a percentage-based width. |
| `Missions.tsx:264` | Same `truncate` class | Same issue. | Same fix. |
| `Tools.tsx:286-289` | Input / Output schema columns | Show raw JSON via `truncate()` to 60 chars. | Consider a "View Schema" modal or expand-on-hover. |
| `Artifacts.tsx:350` | Data column | Shows `JSON.stringify(d.data).slice(0, 60)` in a `<pre>`. | Move to expandable modal. |

---

## 3. Unnecessary Input Fields

### 3.1 "Tenant ID" on Vault create form
| File:line | Field | Issue | Suggested fix |
|---|---|---|---|
| `pages/Vault.tsx:19,99,42` | `tenantId` state + input | A free-text tenant identifier is a technical field and easy to enter incorrectly. The current API requires it in the request body, so removing the input alone would break creation. | Hide it from general users only when the API can derive the active tenant from authenticated context. Until then, keep the required workflow explicit and restrict it to an appropriate administrative surface. |

### 3.2 "ID" field on assistant registration
| File:line | Field | Issue | Suggested fix |
|---|---|---|---|
| `pages/Assistants.tsx:33,223` | `id` state + input | Asking general users to supply an ID adds unnecessary cognitive load. The current form generates an ID in the client when the field is blank; the API does not currently generate it server-side. | Hide the field for general users and retain the existing generation behavior, or update the API contract before moving generation server-side. Show the resulting ID after creation; preserve custom IDs only if builders/admins need them. |

### 3.3 "ID" field on tool registration
| File:line | Field | Issue | Suggested fix |
|---|---|---|---|
| `Tools.tsx:58,217` | `id` state + input | Asking general users to supply an ID adds unnecessary cognitive load. The current form generates an ID in the client when the field is blank. | Hide the field for general users and retain the existing generation behavior, or update the API contract before moving generation server-side. Show the resulting ID after creation; preserve custom IDs only if builders/admins need them. |

### 3.4 "Metadata" key-value editor in EntityWorkspace Configuration tab
| File:line | Field | Issue | Suggested fix |
|---|---|---|---|
| `panels/ConfigurationPanel.tsx:161-190` | Metadata key/value editor | Low-level concern that most users won't understand or need. Exposes raw keys. | Hide behind an "Advanced" toggle or remove from the default UI. |

### 3.5 Agent Artifacts Panel is always empty
| File:line | Issue | Suggested fix |
|---|---|---|
| `pages/EntityWorkspace.tsx:44` — `const [agentArtifacts] = useState<AgentArtifact[]>([])` | Initialized to `[]` and never updated. Passed to `<ArtifactsPanel>` at line 499. Always shows "No artifacts generated yet." | Either populate this state from an API call, or remove the tab and panel entirely if not yet implemented. |

---

## 4. Confusing or Redundant Dashboard / Panel Items

### 4.1 Dashboard — duplicate "Mission Activity" summary
| File:line | Issue | Suggested fix |
|---|---|---|
| `Dashboard.tsx:191-314` | 4 metric cards at top (Services Online, Missions Running, Agents Active, Event Feed). Then "Mission Activity" card repeats mission counts (Total, Running, Completed, Failed) plus a mini-table. | Consolidate: keep metric cards for high-level status. Replace "Mission Activity" summary counts with a single line. OR remove the "Agents Active" metric card and fold all counts into the Mission Activity card. |

### 4.2 Dashboard — "Agent Status" card is non-actionable
| File:line | Issue | Suggested fix |
|---|---|---|
| `Dashboard.tsx:288-314` | Only shows `activeAgents` (= `runningMissions`), then explains "Agents are mission-scoped and ephemeral." | This card duplicates the "Missions Running" metric card. Remove it; add a brief footnote on the Mission Activity card. |

### 4.3 Dashboard — "Event Feed" status duplicated
| File:line | Issue | Suggested fix |
|---|---|---|
| `Dashboard.tsx:184-188` (metric card) and `Dashboard.tsx:327-334` (Recent Events header) | "Event Feed" status appears in both. | Remove the metric card; keep the status indicator in the Recent Events section header only. |

### 4.4 Brain page — circuit-breaker state mapping is confusing
| File:line | Issue | Suggested fix |
|---|---|---|
| `pages/Brain.tsx:220-237` | Provider status badges currently show "up" and "down" for the two common states, but may show the internal state value for a recovery state. | Keep plain-language labels: "Up" / "Down" / "Recovering" as applicable. Map the internal states to consistent colors without displaying technical state names. |

### 4.5 MissionRoom — redundant "Agents" tab
| File:line | Issue | Suggested fix |
|---|---|---|
| `MissionRoom.tsx:46` — tabs include `'agents'` | The `"agents"` tab renders `<AgentOutputsPanel missionId={missionId} />` (line 741). The `"conversation"` tab also renders `<AgentOutputsPanel missionId={missionId} />` in a 300px sidebar (line 546). Two tabs show the same panel. | Remove the "Agents" tab and always show the AgentOutputsPanel as a sidebar on relevant tabs. |

### 4.6 MissionRoom — inline JSON in timeline
| File:line | Issue | Suggested fix |
|---|---|---|
| `MissionRoom.tsx:597-601` | Timeline items render `{JSON.stringify(evt.metadata)}` as raw text. | Show a readable, human-oriented summary by default. Keep any raw technical details collapsed and limited to builder/admin views; end users should not need to interpret JSON. |

### 4.7 EntityWorkspace — "skill settings" tab name is inconsistent
| File:line | Issue | Suggested fix |
|---|---|---|
| `EntityWorkspace.tsx:377` — `entityTabs` array | Tab labels: `'overview'`, `'skill settings'`, `'configuration'`, `'memory'`, `'missions'`, `'hitl'`, `'artifacts'`. The `'skill settings'` is two words with lowercase 's'. | Rename to `'tool-settings'` and label it "Tool Settings", or rename the internal key. |

### 4.8 EntityWorkspace — "Entity Workspace" loading title
| File:line | Issue | Suggested fix |
|---|---|---|
| `EntityWorkspace.tsx:371` — `<h1>Entity Workspace</h1>` | "Entity" is jargon; this is the assistant detail/configure page. | Use a more descriptive loading title like "Loading Assistant…". |

---

## 5. Overly Long / Wide Tables

### 5.1 Tools page — 7-column table with raw JSON
| File:line | Issue | Suggested fix |
|---|---|---|
| `pages/Tools.tsx:263-291` | "Registered Tools" table has 7 columns: ID, Name, Type, Description, Input (JSON), Output (JSON), Actions. Input/Output columns show truncated raw JSON. | Drop the Input and Output columns. Show schema in the detail drawer (`selectedTool`). Collapse JSON into expandable row detail. |

### 5.2 Tools page — "Available General Tools" list
| File:line | Issue | Suggested fix |
|---|---|---|
| `Tools.tsx:107-116` | Below the table, a separate card lists "Available General Tools" with name + description. | Consider a collapsible section or separate page/tab. |

### 5.3 Artifacts page — nested mission cards with artifacts
| File:line | Issue | Suggested fix |
|---|---|---|
| `pages/Artifacts.tsx:188-295` | Each mission is a full card with a list of artifacts, each with Open/Download + upload. Very tall for missions with many artifacts. | Add per-mission expand/collapse. Or paginate/limit artifacts per mission. |

### 5.4 Missions page — inline search + 7 filter buttons
| File:line | Issue | Suggested fix |
|---|---|---|
| `pages/Missions.tsx:213-238` | Search input, 7 status filter buttons, and refresh in a flex row. On narrow screens, wraps and becomes cramped. | Consider a dropdown filter or horizontal scroll of the filter bar. |

### 5.5 Dashboard — services health grid
| File:line | Issue | Suggested fix |
|---|---|---|
| `Dashboard.tsx:384-402` | Each service is a separate card with name, status dot, and URL. For 10+ services, a wall of cards. | Use a table: Service Name | Status | URL. |

---

## 6. Mis-labeled or Vaguely Labeled Buttons

### 6.1 Brain page — "Complete" button
| File:line | Issue | Suggested fix |
|---|---|---|
| `pages/Brain.tsx:184` | Button text is "Complete" (or "Running…"). Sounds like "mark as complete." | Rename to "Generate" or "Test Prompt". |

### 6.2 MissionRoom — Start/Pause/Stop buttons
| File:line | Issue | Suggested fix |
|---|---|---|
| `MissionRoom.tsx:420-433` | "Start", "Pause", "Stop" — no tooltips, all always enabled. | Add `aria-label` and tooltips. Hide "Start" when running. Hide "Pause" when not running. |

### 6.3 Tools page — "Bind" / "Unbind"
| File:line | Issue | Suggested fix |
|---|---|---|
| `Tools.tsx:322` | Button text "Bind"; line 338 "Unbind" | "Bind" is jargon. | Rename to "Assign" / "Remove" or "Link to Assistant" / "Unlink". |

### 6.4 Generic "×" close/remove buttons without aria-labels
| File:line | Issue | Suggested fix |
|---|---|---|
| `Assistants.tsx:242,260,295,304,313` | Remove `×` buttons (knowledge items, transaction guidance) | No `aria-label`. | Add `aria-label="Remove"`. |
| `ConfigurationPanel.tsx:144,170` | Same — remove buttons without aria-labels. | Add `aria-label="Remove"`. |
| `MissionRoom.tsx:722,1015` | "Open"/"Download" buttons | OK but could be more specific. | "Open in new tab" / "Download file". |
| `Artifacts.tsx:244,245` | Same "Open"/"Download" | Same. | Same. |
| `ArtifactsPanel.tsx:33,34` | "Open"/"Download" | Same. | Same. |
| `Dashboard.tsx:266` | "Delete" per mission row | No confirmation, no aria-label. | Add confirmation + `aria-label`. |
| `Missions.tsx:276` | "Delete" per mission row | Has `confirm()` but no aria-label. | Add `aria-label="Delete mission {id}"`. |
| `Vault.tsx:132-137` | "Reveal"/"Delete" | "Reveal" is unclear. | "Show Value" / "Delete". Add aria-labels. |

### 6.5 Refresh buttons with emoji only
| File:line | Issue | Suggested fix |
|---|---|---|
| `Missions.tsx:236` | `{missionsLoading ? '🔄' : 'Refresh'}` | Emoji-only when loading is not accessible. | Always include text: `'Refreshing…' / 'Refresh'`. |
| `Brain.tsx:276` | `{serviceLogsLoading ? '...' : 'Refresh'}` | Ellipsis-only when loading. | `'Refreshing…' / 'Refresh'`. |

### 6.6 Login page — hardcoded credentials
| File:line | Issue | Suggested fix |
|---|---|---|
| `pages/Login.tsx:7-8` | `useState('admin@example.com')` and `useState('password')` pre-fill the form. | Remove default values. These should not ship to production. |

---

## 7. Raw JSON Inputs / Outputs

JSON is acceptable in developer and assistant-builder workflows, but no end-user task should require someone to write or interpret it. Where a surface is used by both audiences, make the ordinary workflow readable and form-based, with raw technical details available only as an optional advanced view.

### 7.1 Tools page — developer and assistant-builder inputs
| File:line | Issue | Suggested fix |
|---|---|---|
| `Tools.tsx:229-235` | Input Schema is a JSON editor on a tool-registration surface for builders. | Keep JSON authoring available for this technical audience. Preserve clear parse/validation errors; do not make a schema builder a prerequisite solely to shield builders from JSON. |
| `Tools.tsx:240-248` | Output Schema is likewise builder-facing. | Same: JSON is appropriate here; keep validation clear and actionable. |
| `Tools.tsx:408-414` | The tool execution form accepts raw JSON. | Keep this option for builders. If this execution flow is exposed to end users, render ordinary fields from `inputSchema` so they never need to write JSON. |
| `Tools.tsx:435` | Result shown as `JSON.stringify(executeResult, null, 2)` in `<pre>`. | Show a readable result by default where the audience is nontechnical; keep raw JSON available as an optional technical detail for builders. |
| `Artifacts.tsx:318-324` | Document save form accepts JSON data. | If this is an end-user workflow, provide an ordinary form or key/value fields. A technical/admin workflow may retain JSON input with clear validation. |
| `Artifacts.tsx:350-352` | Documents table "Data" column shows `JSON.stringify(d.data).slice(0, 60)`. | Show a human-readable summary by default; keep full raw data in an optional detail view for technical users. |
| `MissionRoom.tsx:599` | Timeline metadata shown as `JSON.stringify(evt.metadata)`. | Show a readable summary by default; expose raw details only as an optional, collapsed view for builders/admins. |
| `Vault.tsx:142` | Decrypted secret shown in `<pre className="result">`. | This is arguably correct for secrets, but consider a fixed-height scrollable container. |

---

## 8. Other Usability Issues

### 8.1 Destructive actions without confirmation
| File:line | Issue | Suggested fix |
|---|---|---|
| `Dashboard.tsx:263-268` | "Delete" on mission row — **no** `confirm()`. Directly calls `deleteMission`. | Add `confirm('Delete mission {id}?')`. |
| `pages/Vault.tsx:63-73` | Delete secret — no `confirm()`. | Add confirmation. |

### 8.2 MissionRoom — "Start" button always visible
| File:line | Issue | Suggested fix |
|---|---|---|
| `MissionRoom.tsx:413-420` | "Start" is always enabled, including when starting may not be appropriate; request failures are silently ignored. | Enable controls only for valid mission states and show a clear error if an action fails. |

### 8.3 Brain page — empty status dot with no text
| File:line | Issue | Suggested fix |
|---|---|---|
| `Brain.tsx:268-274` | Empty `<span className="connection-status">` with colored dot but no text. | Add text: "Live" / "Offline". |

### 8.4 OverviewPanel — hardcoded tool ID check
| File:line | Issue | Suggested fix |
|---|---|---|
| `OverviewPanel.tsx:196` | Hardcoded `tool.name === 'career-job-discovery'` to show `WatchControls`. | Move watch config to a general "monitoring" concept keyed by tool manifest. |

### 8.5 Status badges showing raw strings
| File:line | Issue | Suggested fix |
|---|---|---|
| `Dashboard.tsx:258` | `<span className="badge ${m.status}">{m.status}</span>` — renders `awaiting_review`, `incomplete` raw. | Map to human-friendly labels. |
| `Missions.tsx:272` | Same pattern. | Same fix. |

### 8.6 CSS badge `capitalize` doesn't handle underscores
| File:line | Issue | Suggested fix |
|---|---|---|
| `index.css:331` | `.badge { text-transform: capitalize; }` — `awaiting_review` becomes `Awaiting_review`, not `Awaiting Review`. | Add a badge-label humanization utility. |

### 8.7 `window.location.reload()` after artifact upload
| File:line | Issue | Suggested fix |
|---|---|---|
| `MissionRoom.tsx:1011` | Hard reload loses scroll position and view state. | Refresh mission detail in place. The Artifacts page already refreshes its data after upload. |

### 8.8 `ActionPreview.tsx` — `JSON.stringify(input)` in useEffect dependency
| File:line | Issue | Suggested fix |
|---|---|---|
| `ActionPreview.tsx:31` | Serializes `input` on every render; the effect runs again when the serialized value changes. | Check whether this causes unnecessary preview requests. If it does, memoize the input or depend on the specific values used by the preview; test that meaningful input changes still refresh it. |

### 8.9 WatchControls — hardcoded `ownerUserId`
| File:line | Issue | Suggested fix |
|---|---|---|
| `WatchControls.tsx:22` | `ownerUserId: 'default'` hardcoded. | Should come from authenticated session. |

### 8.10 Vault page — dense security description
| File:line | Issue | Suggested fix |
|---|---|---|
| `Vault.tsx:78-82` | Paragraph explains "AES-256-GCM envelope encryption" above the form. | Move to a tooltip or info icon. |

### 8.11 Sidebar — emoji icons
| File:line | Issue | Suggested fix |
|---|---|---|
| `Sidebar.tsx:6-15` | All icons are emoji (📊, 🤖, 🎯). | Replace with a proper icon library for consistent rendering. |

---

## 9. Accessibility Issues

| File:line | Issue | Suggested fix |
|---|---|---|
| `Assistants.tsx:242,260,295,304,313` | Remove `×` buttons without `aria-label`. | Add `aria-label="Remove"`. |
| `ConfigurationPanel.tsx:144,170` | Same — remove buttons without aria-labels. | Add `aria-label="Remove"`. |
| `Tools.tsx` — select elements | No `<label>` associated with selects. | Use `htmlFor`/`id` pairing. |
| `MissionRoom.tsx:352` | `<textarea>` with keydown hint, no `aria-describedby`. | Add `aria-describedby` to hint text. |
| `MissionRoom.tsx:556-560` | `<textarea>` no `<label>`. | Add visually-hidden `<label htmlFor>`. |
| `Dashboard.tsx` metric cards | `<div>` elements with inline styles, no semantic structure. | Use `role="img"` + `aria-label`, or `<figure>`/`<figcaption>`. |

---

## 10. Priority Summary

### P0 — Must fix (confusing, blocks task, or accessibility blocker)
1. Resolve Vault tenant selection: don't expose a technical tenant field to general users, but update the API to use authenticated tenant context before removing it (§3.1)
2. Dashboard "Delete" button without confirmation (§8.1)
3. MissionRoom controls don't reflect mission state and failures are hidden (§8.2)
4. Brain "Complete" button label — misleading (§6.1)
5. HITL terminology — "HITL" and "Human-in-Loop" typo (§1.1)
6. Agent Artifacts tab always empty — dead state (§3.5)
7. MissionRoom tab "Agents" duplicates AgentOutputsPanel (§4.5)
8. `window.location.reload()` after artifact upload — loses state (§8.7)
9. Remove buttons without aria-labels (§6.4, §9)
10. Login page hardcoded credentials (§6.6)

### P1 — High impact, should fix soon
1. "Transaction Guidance" → "Behavior Rules" (§1.3)
2. "Brain / LLM Layer" → "AI Services" (§1.2)
3. "Circuit Breakers" → "Provider Status" with plain-language state labels (§1.2, §4.4)
4. Tools table Input/Output JSON columns (§5.1)
5. Textarea rows too small across forms (§2.1)
6. Vault "Secret value" textarea only 3 rows (§2.1)
7. "Persona" → "About" and related label updates (§1.5)
8. "Bind"/"Unbind" → "Assign"/"Remove" in Tools (§6.3)
9. Status badges showing raw strings (§8.5)
10. Dashboard redundant metric cards and Agent Status card (§4.1–4.2)

### P2 — Medium impact, polish
1. Confirm whether "Skills" and "Tools" refer to the same concept before standardizing terminology (§1.4)
2. Sidebar emoji icons → proper icon library (§8.9)
3. Metadata key-value editor behind "Advanced" toggle (§3.4)
4. Artifacts page per-mission expand/collapse (§5.3)
5. Dashboard services health — table instead of cards (§5.5)
6. Brain page inline style debt → CSS classes (§8.10, internal)
7. Emoji-only loading states on buttons (§6.5)
8. Empty states with action guidance (§8.7, internal)
9. Check whether `ActionPreview` serialization causes unnecessary preview requests (§8.8)

### P3 — Low priority, minor
1. CSS `.form` width consistency (§2.3)
2. Knowledge content placeholder wording (§1.8)
3. "Register" → "Create" consistency (§1.9)
4. CSS badge `capitalize` not handling underscores (§8.6)
5. Vault page dense security description (§8.10)

---

## 11. Suggested Implementation Order

1. **Round 1 — Term cleanup (1–2 days):** Rename "HITL" → "Human Review", "Transaction Guidance" → "Behavior Rules", "Brain / LLM Layer" → "AI Services", and "Persona" → "About". Confirm the distinction between "Skills" and "Tools" before standardizing those labels.

2. **Round 2 — Button labels & accessibility (1 day):** Update misleading button text. Add `aria-label`s to all `×` remove buttons. Fix emoji-only loading states.

3. **Round 3 — Field sizing & layout (2 days):** Increase textarea rows. Fix narrow inputs. Improve table layouts.

4. **Round 4 — readable data & dead code (2 days):** Show human-readable summaries in end-user timelines and results; keep raw JSON available for builders/admins where useful. Fix `window.location.reload()`. Remove dead `agentArtifacts` state.

5. **Round 5 — Logic & safety (1 day):** Add confirmations to destructive actions. Make MissionRoom controls reflect valid mission states and report action failures.
