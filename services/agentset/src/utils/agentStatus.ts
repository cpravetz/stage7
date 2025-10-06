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
    UNKNOWN = 'unknown' // Added this line
}
