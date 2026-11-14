/** Pseudo-tool names and wire markers shared across the executor. */
export const ASK_USER_MARKER = '__ASK_USER__:'
export const ASK_USER_NAME = '__ASK_USER__'
export const CREATE_TOOL_ACTION = '__create_tool'
export const DELEGATE_ACTION = '__delegate'
export const LIST_TOOLS_ACTION = '__list_tools'

/** Size / length limits. */
export const MAX_TOOL_DESCRIPTION_LENGTH = 200
export const MAX_BRAIN_REQUEST_BYTES = 192 * 1024
export const MAX_AGENT_CHECKPOINT_BYTES = 512 * 1024
export const MAX_ACTION_RESULT_CHARS = 12_000
export const MAX_ACTION_RECEIPT_CHARS = 4_096
export const MAX_ASK_USER_QUESTION_LENGTH = 400

/** Brain call budgeting. */
export const MAX_COMPLETION_TOKENS_PER_CALL = 8_192
export const DEFAULT_COMPLETION_TOKENS_PER_CALL = 2_048
export const RESUME_COMPLETION_TOKEN_BONUS = 8_192
export const DEFAULT_MAX_ITERATIONS = 50
export const DEFAULT_MAX_DELEGATION_DEPTH = 3

/** Brain request timeouts. */
export const DEFAULT_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS = 310_000
export const DEFAULT_BRAIN_COMPLETION_DEADLINE_MS = 900_000
export const BRAIN_RESPONSE_GRACE_MS = 30_000
export const MAX_BRAIN_REQUEST_TIMEOUT_MS = 2_147_483_647

/** Retry / correction limits. */
export const MAX_MODEL_SELECTION_RETRIES = 50
export const MAX_ARTIFACT_CORRECTION_ATTEMPTS = 2

/** Sentinel written into the history once a resumed task has been granted its extra allowance. */
export const RESUME_BUDGET_MARKER = 'You may continue from the work saved so far one more time for this task.'
