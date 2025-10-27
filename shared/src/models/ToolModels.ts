export interface ToolSource {
    _id?: string; // Added for MongoDB compatibility
    id: string;
    type: 'openapi' | 'git' | 'marketplace';
    url: string;
    last_scanned_at?: Date;
}

export interface PendingTool {
    _id?: string; // Added for MongoDB compatibility
    id: string;
    source_id: string;
    manifest_url: string;
    manifest_json: any; // Store the full manifest for review
    status: 'pending' | 'approved' | 'rejected';
    policy_config?: {
        rate_limits?: any;
        budgets?: any;
        access_control?: any;
    };
    disabledReason?: string; // Added for health check failures
}