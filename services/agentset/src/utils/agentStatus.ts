export enum AgentStatus {
    INITIALIZING = 'initializing',
    RUNNING = 'running',
    PAUSED = 'paused',
    COMPLETED = 'completed',
    ABORTED = 'aborted',
    ERROR = 'error',
    PENDING = "pending",
    PLANNING = "planning",
    REFLECTING = "reflecting",
    WAITING_FOR_USER_INPUT = "waiting_for_user_input",
    UNKNOWN = 'unknown' // Added this line
}
