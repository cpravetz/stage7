import { Tool } from '../../types';
import { createExternalActionSkill } from './code-skill-factory';
import { CAREER_ADVISORY, CAREER_INTERVIEW_PREP } from './career/career-lower-order-tools';

// ============================================================================
// Career Canonical Extended — internal tools only.
//
// All higher-order canonical career skills have been moved to their standalone
// files under career/ and are exported via careerCanonicalSkills. This file
// now only holds internal tools that are not exposed as canonical skills.
// ============================================================================

// Internal Gmail sync tool (NOT a canonical skill — isSkill:false)
// ----------------------------------------------------------------------------

const CAREER_GMAIL_SYNC_CONFIG_SCHEMA = {
type: 'object',
properties: {
endpointUrl: { type: 'string', description: 'Gmail API endpoint URL' },
apiKey: { type: 'string', description: 'Gmail API key', sensitive: true },
accountId: { type: 'string', description: 'Gmail account identifier' },
},
required: ['endpointUrl', 'apiKey', 'accountId'],
};

const careerGmailSyncTool = createExternalActionSkill({
id: 'career_gmail_sync',
name: 'Career Gmail Sync',
description: 'Internal Gmail connector for career workspace sync. Synchronizes career artifacts via Gmail API. Requires explicit configuration (endpointUrl, apiKey, accountId) and provides honest not-connected fallback when unconfigured.',
system: 'gmail',
action: 'career-sync',
endpoint: { envVar: 'CAREER_GMAIL_ENDPOINT', method: 'POST' },
auth: {
type: 'api_key',
header: 'Authorization',
apiKey: 'apiKey',
credentialEnvKeyMap: {
apiKey: { envVar: 'CAREER_GMAIL_API_KEY', configKey: 'career.gmail.apiKey' },
},
},
configSchema: CAREER_GMAIL_SYNC_CONFIG_SCHEMA,
inputSchema: {
type: 'object',
properties: {

},
},
outputSchema: {
type: 'object',
properties: {
success: { type: 'boolean' },
mode: { type: 'string', enum: ['dry-run', 'live', 'not-connected', 'error'] },
system: { type: 'string' },
action: { type: 'string' },
request: { type: ['object', 'null'] },
response: { type: ['object', 'null'] },
error: { type: ['string', 'null'] },
},
required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
},
timeoutMs: 30000,
});
careerGmailSyncTool.isSkill = false;
careerGmailSyncTool.configSchema = CAREER_GMAIL_SYNC_CONFIG_SCHEMA;

// ============================================================================
// Exports
// ============================================================================

export { careerGmailSyncTool };

export const careerCanonicalExtendedSkills: Tool[] = [];

export const careerCanonicalInternalTools: Tool[] = [
careerGmailSyncTool,
CAREER_INTERVIEW_PREP,
CAREER_ADVISORY,
];
