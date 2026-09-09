import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, CredentialProvider } from '../services/CredentialProvider';

export interface VendorApiOptions {
  vendor: 'jira' | 'confluence' | 'slack' | 'github';
  operation: string;
  input: Record<string, unknown>;
}

export interface VendorApiResult {
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs?: number;
}

export class VendorApiExecutor {
  private credentialProvider = CredentialProvider;

  async execute(options: VendorApiOptions, credentials: ToolCredentials): Promise<VendorApiResult> {
    const startTime = Date.now();
    const { vendor, operation, input } = options;

    const baseUrl = this.resolveBaseUrl(vendor, credentials);
    const token = this.resolveToken(vendor, credentials);

    if (!baseUrl || !token) {
      return {
        success: false,
        error: `Missing ${vendor} credentials: baseUrl and apiToken are required`,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      let result: unknown;
      switch (vendor) {
        case 'jira':
          result = await this.executeJira(baseUrl, token, operation, input);
          break;
        case 'confluence':
          result = await this.executeConfluence(baseUrl, token, operation, input);
          break;
        case 'slack':
          result = await this.executeSlack(token, operation, input);
          break;
        case 'github':
          result = await this.executeGithub(token, operation, input);
          break;
        default:
          return { success: false, error: `Unsupported vendor: ${vendor}`, durationMs: Date.now() - startTime };
      }

      return { success: true, data: result, durationMs: Date.now() - startTime };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }

  private resolveBaseUrl(vendor: string, credentials: ToolCredentials): string {
    const key = `${vendor}Url`;
    return (credentials as any)[key] || (credentials as any)[`${vendor}_url`] || '';
  }

  private resolveToken(vendor: string, credentials: ToolCredentials): string {
    const key = `${vendor}Token`;
    return (credentials as any)[key] || (credentials as any)[`${vendor}_token`] || credentials.apiToken || credentials.token || '';
  }

  private async executeJira(baseUrl: string, token: string, operation: string, input: Record<string, unknown>): Promise<unknown> {
    const headers = {
      'Authorization': `Basic ${Buffer.from(`${token}:x`.trim()).toString('base64')}`,
      'Content-Type': 'application/json',
    };

    if (operation === 'create_issue') {
      const res = await fetch(`${baseUrl}/rest/api/2/issue`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fields: {
            project: { key: input.projectKey },
            summary: input.summary,
            description: input.description,
            issuetype: { name: input.issueType || 'Task' },
            priority: input.priority ? { name: input.priority } : undefined,
            assignee: input.assignee ? { name: input.assignee } : undefined,
          },
        }),
      });
      if (!res.ok) throw new Error(`Jira issue creation failed: ${res.status}`);
      return await res.json();
    }

    if (operation === 'query_issues') {
      const jql = input.jql || 'order by created DESC';
      const maxResults = (input.maxResults as number) || 50;
      const url = `${baseUrl}/rest/api/2/search?jql=${encodeURIComponent(jql as string)}&maxResults=${encodeURIComponent(String(maxResults))}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Jira query failed: ${res.status}`);
      const data = await res.json() as { issues: unknown[]; total: number };
      return { issues: data.issues, total: data.total };
    }

    if (operation === 'transition') {
      const issueKey = input.issueKey as string;
      const res = await fetch(`${baseUrl}/rest/api/2/issue/${issueKey}/transitions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ transition: { name: input.transitionName } }),
      });
      if (!res.ok) throw new Error(`Jira transition failed: ${res.status}`);
      return { success: true };
    }

    throw new Error(`Unsupported Jira operation: ${operation}`);
  }

  private async executeConfluence(baseUrl: string, token: string, operation: string, input: Record<string, unknown>): Promise<unknown> {
    const headers = {
      'Authorization': `Basic ${Buffer.from(`${token}:x`.trim()).toString('base64')}`,
      'Content-Type': 'application/json',
    };

    if (operation === 'create_page') {
      const res = await fetch(`${baseUrl}/wiki/api/v2/pages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          spaceId: input.spaceId,
          title: input.title,
          body: { representation: 'wiki', value: input.content },
        }),
      });
      if (!res.ok) throw new Error(`Confluence page creation failed: ${res.status}`);
      return await res.json();
    }

    if (operation === 'search') {
      const cql = input.cql || 'type=page';
      const limit = (input.limit as number) || 25;
      const url = `${baseUrl}/wiki/api/v2/pages?cql=${encodeURIComponent(cql as string)}&limit=${encodeURIComponent(String(limit))}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Confluence search failed: ${res.status}`);
      return await res.json();
    }

    throw new Error(`Unsupported Confluence operation: ${operation}`);
  }

  private async executeSlack(token: string, operation: string, input: Record<string, unknown>): Promise<unknown> {
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    if (operation === 'post_message') {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          channel: input.channel,
          text: input.text,
          blocks: input.blocks,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(`Slack post failed: ${data.error}`);
      return data;
    }

    if (operation === 'list_channels') {
      const res = await fetch('https://slack.com/api/conversations.list?limit=200', { headers });
      const data = await res.json() as { ok: boolean; channels?: unknown[]; error?: string };
      if (!data.ok) throw new Error(`Slack list channels failed: ${data.error}`);
      return { channels: data.channels };
    }

    if (operation === 'upload_file') {
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('channels', input.channel as string);
      form.append('file', Buffer.from((input.content as string) || ''), { filename: (input.filename as string) || 'file.txt' });

      const res = await fetch('https://slack.com/api/files.upload', {
        method: 'POST',
        headers: { ...headers, ...(form as any).getHeaders() },
        body: form as any,
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(`Slack upload failed: ${data.error}`);
      return data;
    }

    throw new Error(`Unsupported Slack operation: ${operation}`);
  }

  private async executeGithub(token: string, operation: string, input: Record<string, unknown>): Promise<unknown> {
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github+json',
    };

    if (operation === 'create_issue') {
      const [owner, repo] = ((input.repo as string) || '').split('/');
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          labels: input.labels,
          assignees: input.assignees,
        }),
      });
      if (!res.ok) throw new Error(`GitHub issue creation failed: ${res.status}`);
      return await res.json();
    }

    if (operation === 'list_issues') {
      const [owner, repo] = ((input.repo as string) || '').split('/');
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=${input.state || 'open'}&per_page=${input.perPage || 50}`, { headers });
      if (!res.ok) throw new Error(`GitHub list issues failed: ${res.status}`);
      return await res.json();
    }

    if (operation === 'create_pr') {
      const [owner, repo] = ((input.repo as string) || '').split('/');
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: input.title,
          head: input.head,
          base: input.base,
          body: input.body,
        }),
      });
      if (!res.ok) throw new Error(`GitHub PR creation failed: ${res.status}`);
      return await res.json();
    }

    throw new Error(`Unsupported GitHub operation: ${operation}`);
  }
}
