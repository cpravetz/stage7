import { logger } from '@stage7-nextgen/shared';
import { Tool } from '../types';

export interface DiscoveredTool {
  source: 'npm' | 'pypi' | 'github' | 'mcp-registry';
  name: string;
  description: string;
  packageName: string;
  version?: string;
  trustScore: number;
  downloadCount?: number;
  repositoryUrl?: string;
}

export interface DiscoveryResult {
  found: boolean;
  tools: DiscoveredTool[];
  error?: string;
}

export class ToolDiscovery {
  private readonly registries: Record<string, string> = {
    npm: 'https://registry.npmjs.org/-/v1/search?text=keywords:ai-agent-tool+',
    pypi: 'https://pypi.org/pypi?%3Aaction=search&term=',
    github: 'https://api.github.com/search/repositories?q=',
  };
  private networkEnabled = process.env.TOOL_DISCOVERY_NETWORK === 'true';

  setNetworkEnabled(enabled: boolean): void {
    this.networkEnabled = enabled;
  }

  isNetworkEnabled(): boolean {
    return this.networkEnabled;
  }

  async search(query: string): Promise<DiscoveryResult> {
    if (!this.networkEnabled) {
      return { found: false, tools: [], error: 'Network disabled' };
    }

    const results: DiscoveredTool[] = [];
    const errors: string[] = [];

    const npmResults = await this.searchNpm(query).catch((err) => {
      errors.push(`npm: ${err instanceof Error ? err.message : String(err)}`);
      return [] as DiscoveredTool[];
    });
    results.push(...npmResults);

    const pypiResults = await this.searchPypi(query).catch((err) => {
      errors.push(`pypi: ${err instanceof Error ? err.message : String(err)}`);
      return [] as DiscoveredTool[];
    });
    results.push(...pypiResults);

    const githubResults = await this.searchGithub(query).catch((err) => {
      errors.push(`github: ${err instanceof Error ? err.message : String(err)}`);
      return [] as DiscoveredTool[];
    });
    results.push(...githubResults);

    results.sort((a, b) => b.trustScore - a.trustScore);

    logger.info({ query, found: results.length, errors: errors.length }, 'Tool discovery completed');

    return {
      found: results.length > 0,
      tools: results.slice(0, 10),
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  }

  async discoverAndRegister(query: string, registry: { register: (tool: Tool) => void }): Promise<Tool | undefined> {
    const result = await this.search(query);
    if (!result.found || result.tools.length === 0) {
      return undefined;
    }

    const best = result.tools[0];
    if (best.trustScore < 0.5) {
      logger.warn({ tool: best.name, trustScore: best.trustScore }, 'Discovered tool below trust threshold');
      return undefined;
    }

    try {
      const tool = await this.importTool(best, registry);
      logger.info({ toolId: tool.id, source: best.source, packageName: best.packageName }, 'External tool discovered and registered');
      return tool;
    } catch (err) {
      logger.warn({ tool: best.name, err: err instanceof Error ? err.message : String(err) }, 'Failed to import discovered tool');
      return undefined;
    }
  }

  private async searchNpm(query: string): Promise<DiscoveredTool[]> {
    const url = `${this.registries.npm}${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.npm.search.v1+json' },
    });

    if (!response.ok) {
      throw new Error(`npm search failed: ${response.status}`);
    }

    const data = await response.json() as { objects: Array<{ package: { name: string; description: string; version: string; keywords?: string[]; downloads?: number } }> };
    return data.objects.slice(0, 5).map((obj) => ({
      source: 'npm' as const,
      name: obj.package.name,
      description: obj.package.description || `npm package: ${obj.package.name}`,
      packageName: obj.package.name,
      version: obj.package.version,
      trustScore: this.calculateTrustScore('npm', obj.package.downloads),
      downloadCount: obj.package.downloads,
      repositoryUrl: `https://www.npmjs.com/package/${obj.package.name}`,
    }));
  }

  private async searchPypi(query: string): Promise<DiscoveredTool[]> {
    const url = `${this.registries.pypi}${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`PyPI search failed: ${response.status}`);
    }

    const data = await response.json() as { projects: Array<{ name: string; summary?: string; version?: string }> };
    return data.projects.slice(0, 5).map((proj) => ({
      source: 'pypi' as const,
      name: proj.name,
      description: proj.summary || `PyPI package: ${proj.name}`,
      packageName: proj.name,
      version: proj.version,
      trustScore: 0.6,
      repositoryUrl: `https://pypi.org/project/${proj.name}`,
    }));
  }

  private async searchGithub(query: string): Promise<DiscoveredTool[]> {
    const url = `${this.registries.github}${encodeURIComponent(query + ' ai agent tool')}&sort=stars`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'stage7-tool-discovery',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub search failed: ${response.status}`);
    }

    const data = await response.json() as { items: Array<{ full_name: string; description: string; stargazers_count: number; html_url: string }> };
    return data.items.slice(0, 5).map((item) => ({
      source: 'github' as const,
      name: item.full_name,
      description: item.description || `GitHub repo: ${item.full_name}`,
      packageName: item.full_name,
      version: undefined,
      trustScore: this.calculateTrustScore('github', item.stargazers_count),
      downloadCount: item.stargazers_count,
      repositoryUrl: item.html_url,
    }));
  }

  private async importTool(discovered: DiscoveredTool, registry: { register: (tool: Tool) => void }): Promise<Tool> {
    const tool: Tool = {
      id: `discovered-${discovered.source}-${discovered.packageName.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`,
      name: discovered.name,
      description: discovered.description,
      type: 'code',
      manifest: {
        source: discovered.source,
        packageName: discovered.packageName,
        version: discovered.version,
        repositoryUrl: discovered.repositoryUrl,
        trustScore: discovered.trustScore,
        autoGenerated: true,
        requiresInstallation: true,
        installCommand: discovered.source === 'npm'
          ? `npm install ${discovered.packageName}`
          : discovered.source === 'pypi'
            ? `pip install ${discovered.packageName}`
            : `git clone ${discovered.repositoryUrl}`,
        entrypoint: 'index.js',
        language: 'javascript',
        capabilities: ['external'],
      },
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    registry.register(tool);
    return tool;
  }

  private calculateTrustScore(source: string, metric?: number): number {
    if (!metric) return 0.3;

    switch (source) {
      case 'npm':
        if (metric > 1000000) return 0.95;
        if (metric > 100000) return 0.85;
        if (metric > 10000) return 0.75;
        return 0.6;
      case 'pypi':
        return 0.7;
      case 'github':
        if (metric > 10000) return 0.95;
        if (metric > 1000) return 0.85;
        if (metric > 100) return 0.75;
        return 0.6;
      default:
        return 0.5;
    }
  }
}
