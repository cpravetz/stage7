export interface ToolSource {
    id: string;
    type: 'openapi' | 'git' | 'marketplace';
    url: string;
    last_scanned_at?: string;
}

export interface PendingTool {
    id: string;
    source_id: string;
    manifest_url: string;
    manifest_json: any; // This will be a PluginManifest or DefinitionManifest
    status: 'pending' | 'approved' | 'rejected';
    policy_config?: any;
}
