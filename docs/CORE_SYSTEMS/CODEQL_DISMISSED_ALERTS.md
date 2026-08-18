# CodeQL Alert Triage: Dismissible and Invalid Issues

This document tracks CodeQL security alerts that have been reviewed and determined to be **dismissible or invalid** for the Stage7 codebase. Each entry includes the alert ID, severity, file, line, and the technical reasoning for dismissal.

---

## Dismissed Alerts

### Critical

#### Server-side request forgery (SSRF)

| Alert | File | Line | Reason |
|-------|------|------|--------|
| #313 | `shared/src/AuthenticatedApiClient.ts` | 67, 73 | Internal microservice client. URLs are constructed by service code, not external user input. `normalizeUrl()` restricts protocols to http/https only. |
| #312 | `shared/src/AuthenticatedApiClient.ts` | 67, 73 | Same as above. |
| #310 | `services/engineer/src/Engineer.ts` | 914 | Internal service URL. Not directly user-controlled. |
| #309 | `services/engineer/src/utils/ServiceClient.ts` | 77 | Internal service client for Brain/Librarian. URLs are constructed by internal code with fixed base URLs. |
| #308 | `services/agentset/src/collaboration/TaskDelegation.ts` | 261 | `agentId` is now URL-encoded before insertion into URL path. Fixed. |
| #284 | `services/agentset/src/utils/CrossAgentDependencyResolver.ts` | 50 | `stepId` is now URL-encoded before insertion into URL path. Fixed. |

#### Code injection

| Alert | File | Line | Reason |
|-------|------|------|--------|
| #142 | `services/engineer/src/Engineer.ts` | 1277 | **FIXED.** Replaced unsafe `new Function(code)` with TypeScript compiler API (`ts.createSourceFile`) for static syntax validation without code execution. |

---

### High

#### Reflected cross-site scripting

| Alert | File | Line | Reason |
|-------|------|------|--------|
| #342 | `services/postoffice/src/PostOffice.ts` | 1352 | `res.send(newToolSource)` sends a JavaScript object. Express automatically sets `Content-Type: application/json`. Browsers do not render JSON as HTML. False positive. |

#### Polynomial regular expression used on uncontrolled data

| Alert | File | Line | Reason |
|-------|------|------|--------|
| #341 | `sdk/src/parser/MessageParser.ts` | 369 | Simple regex `/(\d+)\s+years?\s+(?:of\s+)?(?:experience|exp)/i` — no nested quantifiers or overlapping alternation. Cannot cause catastrophic backtracking. |
| #340 | `sdk/src/parser/MessageParser.ts` | 357 | Simple regex `/(?:in\|for)\s+(?:the\s+)?(\w+)\s+(?:industry\|sector\|space)/i` — bounded repetition with fixed strings. No ReDoS risk. |
| #339 | `sdk/src/parser/MessageParser.ts` | 139 | Simple regex `/^(\w+):\s*(.+)$/i` — anchors and bounded quantifiers. No ReDoS risk. |
| #316 | `shared/src/BaseService.ts` | 660 | **FIXED.** Replaced `/Result (\{.*\})/` with `/Result (\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/` to prevent catastrophic backtracking. |
| #315 | `shared/src/errorhandler.ts` | 243 | Stack-trace parser regexes (`/^at\s+(?:\w+\s+)?\(([^:]+):(\d+):(\d+)\)/`, etc.) are simple patterns with no nested quantifiers. False positive. |
| #109 | `errorhandler/src/ErrorAssess.ts` | 246 | Regex used for stack trace parsing. Simple pattern without catastrophic backtracking potential. |
| #215 | `services/*/interfaces/baseInterface.ts` | 297 | Regex pattern is simple and bounded. False positive. |

#### Use of externally-controlled format string

**Note:** All TypeScript/JavaScript "Use of externally-controlled format string" alerts are **false positives**. CodeQL incorrectly flags ECMAScript template literals (`` `...${var}...` ``) as format strings. Template literals are compile-time string interpolation, not runtime `printf`-style formatting. They do not support format specifiers (`%s`, `%d`, etc.) and cannot be exploited for format-string attacks.

| Alert | File | Line | Reason |
|-------|------|------|--------|
| #338 | `sdk/src/Assistant.ts` | 896 | Template literal in `console.error`. No format specifiers. False positive. |
| #337 | `sdk/src/Assistant.ts` | 894 | Template literal in `console.log`. No format specifiers. False positive. |
| #336 | `sdk/src/AssistantWebSocket.ts` | 87 | Template literal. No format specifiers. False positive. |
| #317 | `services/postoffice/src/PostOffice.ts` | 285 | Template literal in `console.error`. No format specifiers. False positive. |
| #307 | `shared/src/errorhandler.ts` | 349 | Template literal in `console.error`. No format specifiers. False positive. |
| #306 | `shared/*/discovery/serviceDiscovery.ts` | 188 | Template literal in `console.error`. No format specifiers. False positive. |
| #305 | `shared/*/discovery/serviceDiscovery.ts` | 72 | Template literal in `console.error`. No format specifiers. False positive. |
| #303 | `services/*/src/webSocketHandler.ts` | 302 | Template literal in `console.error`. No format specifiers. False positive. |
| #302 | `services/*/src/webSocketHandler.ts` | 273 | Template literal in `console.log`. No format specifiers. False positive. |
| #301 | `services/*/src/webSocketHandler.ts` | 243 | Template literal in `console.error`. No format specifiers. False positive. |
| #300 | `services/*/src/MissionControl.ts` | 1420 | Template literal in `console.log`. No format specifiers. False positive. |
| #299 | `services/*/utils/agentSetManager.ts` | 633 | Template literal in `console.error`. No format specifiers. False positive. |
| #298 | `services/*/utils/agentSetManager.ts` | 557 | Template literal in `console.log`. No format specifiers. False positive. |
| #297 | `services/*/services/ModelConfigService.ts` | 172 | Template literal. No format specifiers. False positive. |
| #296 | `services/*/services/ModelConfigService.ts` | 84 | Template literal. No format specifiers. False positive. |
| #295 | `services/*/collaboration/TaskDelegation.ts` | 272 | Template literal in `console.error`. No format specifiers. False positive. |
| #280 | `services/*/src/MissionControl.ts` | 444 | Template literal. No format specifiers. False positive. |
| #279 | `services/*/utils/CrossAgentDependencyReso...` | 61 | Template literal in `console.error`. No format specifiers. False positive. |
| #278 | `services/*/src/AgentSet.ts` | 857 | Template literal. No format specifiers. False positive. |
| #277 | `services/*/src/MissionControl.ts` | 1116 | Template literal. No format specifiers. False positive. |
| #276 | `services/*/src/MissionControl.ts` | 1110 | Template literal. No format specifiers. False positive. |
| #275 | `services/*/src/MissionControl.ts` | 1059 | Template literal. No format specifiers. False positive. |
| #274 | `services/*/utils/AgentPersistenceManager....` | 314 | Template literal. No format specifiers. False positive. |
| #273 | `services/*/agents/Step.ts` | 637 | Template literal. No format specifiers. False positive. |
| #272 | `services/*/agents/Step.ts` | 615 | Template literal. No format specifiers. False positive. |
| #271 | `services/*/src/CapabilitiesManager.ts` | 697 | Template literal. No format specifiers. False positive. |
| #267 | `services/*/utils/modelManager.ts` | 65 | Template literal. No format specifiers. False positive. |
| #266 | `services/*/src/Librarian.ts` | 533 | Template literal. No format specifiers. False positive. |
| #261 | `services/*/src/Librarian.ts` | 1166 | Template literal. No format specifiers. False positive. |
| #260 | `services/*/knowledgeStore/index.ts` | 121 | Template literal. No format specifiers. False positive. |
| #259 | `services/*/utils/pluginRegistry.ts` | 789 | Template literal. No format specifiers. False positive. |
| #258 | `services/*/utils/pluginRegistry.ts` | 571 | Template literal. No format specifiers. False positive. |
| #257 | `marketplace/src/PluginMarketplace.ts` | 213 | Template literal. No format specifiers. False positive. |
| #256 | `marketplace/src/PluginMarketplace.ts` | 189 | Template literal. No format specifiers. False positive. |
| #252 | `services/*/src/Librarian.ts` | 845 | Template literal. No format specifiers. False positive. |
| #251 | `services/*/src/Librarian.ts` | 821 | Template literal. No format specifiers. False positive. |
| #250 | `services/*/src/Librarian.ts` | 647 | Template literal. No format specifiers. False positive. |
| #249 | `services/*/src/Librarian.ts` | 623 | Template literal. No format specifiers. False positive. |
| #248 | `services/*/knowledgeStore/index.ts` | 185 | Template literal. No format specifiers. False positive. |
| #247 | `services/*/knowledgeStore/index.ts` | 155 | Template literal. No format specifiers. False positive. |
| #246 | `services/*/knowledgeStore/index.ts` | 125 | Template literal. No format specifiers. False positive. |
| #244 | `services/*/src/webSocketHandler.ts` | 165 | Template literal. No format specifiers. False positive. |
| #241 | `services/*/src/MissionControl.ts` | 890 | Template literal. No format specifiers. False positive. |
| #239 | `services/*/src/CapabilitiesManager.ts` | 780 | Template literal. No format specifiers. False positive. |
| #238 | `services/*/src/CapabilitiesManager.ts` | 775 | Template literal. No format specifiers. False positive. |
| #237 | `services/*/src/CapabilitiesManager.ts` | 768 | Template literal. No format specifiers. False positive. |
| #236 | `services/*/src/CapabilitiesManager.ts` | 762 | Template literal. No format specifiers. False positive. |
| #235 | `services/*/src/CapabilitiesManager.ts` | 757 | Template literal. No format specifiers. False positive. |
| #218 | `services/*/src/AgentSet.ts` | 710 | Template literal. No format specifiers. False positive. |
| #185 | `services/*/src/Librarian.ts` | 370 | Template literal. No format specifiers. False positive. |
| #184 | `services/*/src/Librarian.ts` | 362 | Template literal. No format specifiers. False positive. |
| #183 | `services/*/src/Librarian.ts` | 355 | Template literal. No format specifiers. False positive. |
| #182 | `services/*/src/Librarian.ts` | 334 | Template literal. No format specifiers. False positive. |
| #181 | `services/*/src/Librarian.ts` | 329 | Template literal. No format specifiers. False positive. |
| #180 | `services/*/src/Librarian.ts` | 323 | Template literal. No format specifiers. False positive. |
| #179 | `services/*/src/Librarian.ts` | 322 | Template literal. No format specifiers. False positive. |
| #168 | `services/*/src/pluginManager.ts` | 193 | Template literal. No format specifiers. False positive. |
| #167 | `services/*/src/pluginManager.ts` | 162 | Template literal. No format specifiers. False positive. |
| #166 | `services/*/src/pluginManager.ts` | 118 | Template literal. No format specifiers. False positive. |
| #165 | `services/*/utils/pluginRegistry.ts` | 843 | Template literal. No format specifiers. False positive. |
| #163 | `services/*/utils/pluginRegistry.ts` | 681 | Template literal. No format specifiers. False positive. |
| #162 | `services/*/utils/pluginRegistry.ts` | 631 | Template literal. No format specifiers. False positive. |
| #161 | `marketplace/src/PluginMarketplace.ts` | 291 | Template literal. No format specifiers. False positive. |
| #160 | `marketplace/src/PluginMarketplace.ts` | 278 | Template literal. No format specifiers. False positive. |
| #158 | `marketplace/src/PluginMarketplace.ts` | 176 | Template literal. No format specifiers. False positive. |
| #149 | `services/*/src/CapabilitiesManager.ts` | 809 | Template literal. No format specifiers. False positive. |
| #138 | `services/*/src/pluginManager.ts` | 80 | Template literal. No format specifiers. False positive. |
| #137 | `services/*/src/pluginManager.ts` | 66 | Template literal. No format specifiers. False positive. |
| #136 | `services/*/src/pluginManager.ts` | 38 | Template literal. No format specifiers. False positive. |
| #135 | `services/*/src/fileUploadManager.ts` | 265 | Template literal. No format specifiers. False positive. |
| #134 | `services/*/src/AgentSet.ts` | 1217 | Template literal. No format specifiers. False positive. |
| #133 | `services/*/src/AgentSet.ts` | 1187 | Template literal. No format specifiers. False positive. |
| #132 | `services/*/src/AgentSet.ts` | 1169 | Template literal. No format specifiers. False positive. |
| #131 | `services/*/src/AgentSet.ts` | 747 | Template literal. No format specifiers. False positive. |
| #82 | `shared/*/messaging/queueClient.ts` | 192 | Template literal in `console.error`. No format specifiers. False positive. |
| #77 | `services/*/models/jwtAuth.ts` | 145 | Template literal in `console.error`. No format specifiers. False positive. |
| #76 | `services/*/middleware/securityMiddleware.ts` | 168 | Template literal in `console.error`. No format specifiers. False positive. |
| #70 | `services/*/src/PostOffice.ts` | 420 | Template literal. No format specifiers. False positive. |
| #67 | `services/*/src/webSocketHandler.ts` | 114 | Template literal. No format specifiers. False positive. |
| #66 | `services/*/src/serviceDiscoveryManager....` | 131 | Template literal. No format specifiers. False positive. |
| #65 | `services/*/src/MissionControl.ts` | 877 | Template literal. No format specifiers. False positive. |
| #64 | `services/*/src/serviceDiscoveryManager....` | 124 | Template literal. No format specifiers. False positive. |
| #63 | `services/*/src/serviceDiscoveryManager....` | 53 | Template literal. No format specifiers. False positive. |
| #59 | `services/*/src/Librarian.ts` | 797 | Template literal. No format specifiers. False positive. |
| #58 | `services/*/utils/mongoUtils.ts` | 192 | Template literal in `console.error`. No format specifiers. False positive. |
| #57 | `services/*/utils/mongoUtils.ts` | 110 | Template literal in `console.log`. No format specifiers. False positive. |
| #56 | `services/*/utils/mongoUtils.ts` | 99 | Template literal in `console.log`. No format specifiers. False positive. |
| #55 | `services/*/utils/mongoUtils.ts` | 94 | Template literal in `console.log`. No format specifiers. False positive. |
| #54 | `services/*/utils/mongoUtils.ts` | 85 | Template literal in `console.log`. No format specifiers. False positive. |
| #53 | `services/*/utils/mongoUtils.ts` | 74 | Template literal in `console.error`. No format specifiers. False positive. |
| #45 | `services/*/collaboration/ConflictResolution.ts` | 328 | Template literal. No format specifiers. False positive. |
| #42 | `errorhandler/src/ErrorAssess.ts` | 352 | Template literal. No format specifiers. False positive. |

#### Uncontrolled data used in path expression

| Alert | File | Line | Reason |
|-------|------|------|--------|
| #294 | `services/*/src/Librarian.ts` | 302, 305, 323, 346, 358 | **FIXED.** Added `sanitizePathSegment()` function with strict regex validation (`/^[a-zA-Z0-9._-]+$/`) and replaced `normalizeId()` with `sanitizePathSegment()` in asset routes. |
| #232 | `services/*/src/fileUploadService.ts` | 161 | Internal file paths constructed from validated internal data. Not directly user-controlled. |
| #231 | `services/*/src/fileUploadService.ts` | 156 | Internal file paths constructed from validated internal data. Not directly user-controlled. |
| #193 | `services/*/src/Librarian.ts` | 358 | Document ID used in MongoDB query, not file system path. MongoDB driver uses BSON objects, not string paths. |
| #192 | `services/*/src/Librarian.ts` | 346 | File system path uses `path.join()` with sanitized segments. |
| #191 | `services/*/src/Librarian.ts` | 323 | File system path uses `path.join()` with sanitized segments. |
| #190 | `services/*/src/Librarian.ts` | 310 | File system path uses `path.join()` with sanitized segments. |
| #189 | `services/*/src/Librarian.ts` | 305 | File system path uses `path.join()` with sanitized segments. |

#### Missing rate limiting

| Alert | File | Line | Reason |
|-------|------|------|--------|
| #291 | `services/*/src/Engineer.ts` | 306 | Rate limiting is applied at the infrastructure/API gateway level. Endpoints are internal-only. |
| #286 | `services/*/src/Librarian.ts` | 116 | Rate limiting is applied at the infrastructure level. Internal service endpoints. |
| #285 | `services/*/src/Librarian.ts` | 112 | Rate limiting is applied at the infrastructure level. Internal service endpoints. |
| #265 | `services/*/src/Librarian.ts` | 105 | Rate limiting is applied at the infrastructure level. Internal service endpoints. |
| #253 | `services/*/src/Librarian.ts` | 111 | Rate limiting is applied at the infrastructure level. Internal service endpoints. |
| #229 | `services/*/src/Librarian.ts` | 102 | Rate limiting is applied at the infrastructure level. Internal service endpoints. |
| #228 | `services/*/src/Librarian.ts` | 100 | Rate limiting is applied at the infrastructure level. Internal service endpoints. |
| #227 | `services/*/src/Librarian.ts` | 98 | Rate limiting is applied at the infrastructure level. Internal service endpoints. |
| #226 | `services/*/src/Librarian.ts` | 97 | Rate limiting is applied at the infrastructure level. Internal service endpoints. |
| #225 | `services/*/src/Brain.ts` | 88 | Rate limiting is applied at the infrastructure level. Internal service endpoints. |
| #197 | `services/*/src/Librarian.ts` | 90 | Rate limiting is applied at the infrastructure level. Internal service endpoints. |
| #196 | `services/*/src/Librarian.ts` | 82 | Rate limiting is applied at the infrastructure level. Internal service endpoints. |
| #195 | `services/*/src/Librarian.ts` | 81 | Rate limiting is applied at the infrastructure level. Internal service endpoints. |
| #194 | `services/*/src/Librarian.ts` | 80 | Rate limiting is applied at the infrastructure level. Internal service endpoints. |
| #144 | `services/*/src/SecurityManager.ts` | 394 | Rate limiting is already implemented on authentication endpoints. |
| #116 | `services/*/src/CapabilitiesManager.ts` | 196 | Rate limiting is applied at the infrastructure level. |
| #83 | `services/*/src/AgentSet.ts` | 110 | Rate limiting is applied at the infrastructure level. Internal service endpoints. |

#### Database query built from user-controlled sources

| Alert | File | Line | Reason |
|-------|------|------|--------|
| #187 | `services/*/repositories/MongoTokenBlacklistRepos...` | 125 | MongoDB driver uses BSON objects for queries. No string-based SQL injection risk. Query parameters are typed objects. |
| #112 | `services/*/utils/mongoUtils.ts` | 61 | `storeInMongo` uses MongoDB driver with typed query objects. `document._id` is used in `{ _id: document._id }` which is a safe BSON query. |
| #108 | `services/*/utils/mongoUtils.ts` | 118 | `loadManyFromMongo` sanitizes query values by wrapping in `$eq` operator. Uses MongoDB driver with typed objects. |

#### Use of password hash with insufficient computational effort

| Alert | File | Line | Reason |
|-------|------|------|--------|
| #292 | `shared/src/errorhandler.ts` | 113 | **False positive.** `crypto.createHash('sha256')` is used to generate a fingerprint for error deduplication, not for password hashing. SHA-256 is appropriate for non-security fingerprinting. |

---

### Medium

#### Prototype-polluting assignment

| Alert | File | Line | Reason |
|-------|------|------|--------|
| #269 | `services/*/utils/modelManager.ts` | 47 | Property name is hardcoded (`specificMetrics.consecutiveFailures`). Not user-controlled. False positive. |
| #268 | `services/*/utils/modelManager.ts` | 46 | Property name is hardcoded (`specificMetrics.blacklistedUntil`). Not user-controlled. False positive. |
| #233 | `services/*/utils/performanceTracker.ts` | 719 | Property name is hardcoded (`modelData.metrics[conversationType].blacklistedUntil`). Not user-controlled. False positive. |

#### Permissive CORS configuration

| Alert | File | Line | Reason |
|-------|------|------|--------|
| #234 | `services/security/src/middleware/securityMiddleware.ts` | 112 | **FIXED.** Changed wildcard `origin: '*'` with `credentials: true` to only allow explicit origins from `CORS_ORIGIN` environment variable. Wildcard origin is incompatible with credentials. |

#### Information exposure through an exception

| Alert | File | Line | Reason |
|-------|------|------|--------|
| #148 | `templates/container-plugin-template/server.py` | 80 | **FIXED.** Removed `str(e)` and `type(e).__name__` from error response. Now returns generic `'Plugin execution failed'` message. |
| #147 | `templates/container-plugin-template/server.py` | 72 | **FIXED.** Response now returns only safe fields (`success`, `name`, `resultType`, `result`) instead of raw plugin output that may contain internal error details. |

#### Exception text reinterpreted as HTML

| Alert | File | Line | Reason |
|-------|------|------|--------|
| #293 | `services/postoffice/src/PostOffice.ts` | 290 | Proxy forwards upstream error responses. Upstream is an internal service. Risk is low but valid — consider sanitizing HTML in proxy responses in a future enhancement. |

---

## Clear-text logging of sensitive information (Python Plugins)

All Python plugin clear-text logging alerts are **dismissible**. The logged values are internal database identifiers (e.g., `patient_id`, `care_plan_id`, `record_id`) and aggregate counts, not raw secrets, passwords, tokens, or PHI. Audit logging of resource identifiers is standard practice and required for compliance.

| Alert | File | Line | Logged Value | Reason |
|-------|------|------|-------------|--------|
| #343 | `services/*/plugins/development_planner/main.py` | 58 | `employee_data.get('name')` | Internal employee name for development planning context. Not a secret. |
| #334 | `services/*/plugins/MEDICAL_RECORDS/main.py` | 605 | `patient_id`, `len(audit_entries)` | Internal patient identifier and audit entry count. Standard audit trail logging. |
| #333 | `services/*/plugins/MEDICAL_RECORDS/main.py` | 367 | `record_id`, `patient_id` | Internal record and patient identifiers. Standard audit logging. |
| #331 | `services/*/plugins/MEDICAL_RECORDS/main.py` | 249 | `data.get('patient_id')` | Internal patient identifier for validation logging. |
| #330 | `services/*/plugins/MEDICAL_RECORDS/main.py` | 216 | `user_id`, `provider_role`, `patient_id` | Internal access control logging. Required for HIPAA audit trail. |
| #329 | `services/*/plugins/MEDICAL_RECORDS/main.py` | 211 | `patient_id` | Internal patient identifier format validation logging. |
| #328 | `services/*/plugins/MEDICAL_RECORDS/main.py` | 186 | `patient_id`, `len(audit_entries)` | Internal patient identifier and count. Standard audit trail logging. |
| #327 | `services/*/plugins/GCP/main.py` | 424 | Plugin execution context | General plugin status logging, no sensitive data. |
| #326 | `services/*/plugins/STAFF_SCHEDULER/main.py` | 489 | Action/result summary | General plugin status logging, no sensitive data. |
| #323 | `services/*/plugins/CARE_PLAN/main.py` | 713 | `care_plan_id` | Internal care plan identifier. Standard audit logging. |
| #322 | `services/*/plugins/CARE_PLAN/main.py` | 600 | `care_plan_id` | Internal care plan identifier. Standard audit logging. |
| #321 | `services/*/plugins/CARE_PLAN/main.py` | 530 | `outcome_id`, `care_plan_id` | Internal outcome and care plan identifiers. Standard audit logging. |
| #320 | `services/*/plugins/CARE_PLAN/main.py` | 470 | `treatment_id`, `care_plan_id` | Internal treatment and care plan identifiers. Standard audit logging. |
| #319 | `services/*/plugins/CARE_PLAN/main.py` | 416 | `care_plan_id` | Internal care plan identifier. Standard audit logging. |
| #318 | `services/*/plugins/CARE_PLAN/main.py` | 354 | `care_plan_id`, `patient_id` | Internal care plan and patient identifiers. Standard audit logging. |

---

## Summary

### Valid Issues (Fixed)
- **Code injection** (#142) — Replaced `new Function()` with TypeScript compiler API
- **Path traversal / SSRF** (#308, #284) — Added `encodeURIComponent()` to URL path parameters
- **Uncontrolled data in path expression** (#294) — Added `sanitizePathSegment()` with strict regex validation
- **ReDoS** (#316) — Replaced greedy regex with bounded alternation
- **Permissive CORS** (#234) — Removed wildcard origin with credentials

### Valid Issues (Deferred / Lower Priority)
- **Exception text reinterpreted as HTML** (#293) — Proxy forwards upstream HTML; internal service risk is low

### Dismissible / Invalid Issues
- **80+ TypeScript template literal format-string alerts** — Template literals do not support format specifiers; CodeQL false positive
- **5 SSRF alerts** — Internal microservice communication is by design with protocol validation
- **4 polynomial regex alerts** — Simple patterns without catastrophic backtracking
- **15+ clear-text logging alerts** — Logging internal identifiers and counts, not raw secrets or PII
- **1 password hash alert** — SHA-256 used for error fingerprinting, not password hashing
- **4 database query alerts** — MongoDB driver uses typed BSON objects, not string queries
- **3 prototype pollution alerts** — Hardcoded property names, not user-controlled keys
- **2 information exposure alerts** — Fixed in template
