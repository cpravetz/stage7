/**
 * MCP Tool Executive (§3).
 *
 * Orchestrates the end-to-end flow:
 *
 * 1. Need detected — no registered tool satisfies the capability.
 * 2. Discovery — query approved MCP library sources for candidates.
 * 3. Vetting and classification — trust tier, side-effect class, data class,
 *    credential requirement (§5). Policy failures are dropped silently.
 * 4. Permission request — stage7-written prompt shown to the user (§4).
 * 5. Grant or deny — denial remembered; grant proceeds to integration.
 * 6. Automatic integration — register, pin, wire credentials, apply controls (§6).
 * 7. Use — tool available to the requesting agent and others in scope.
 * 8. Monitoring and lifecycle — audit, re-consent, revocation (§9).
 */

import { logger } from '@stage7-nextgen/shared';
import { Tool } from '../types';
import { mcpToolDiscovery } from './MCPToolDiscovery';
import {
  buildPermissionRequest,
  getPersistedPermissionDecision,
  getPermissionRequest,
  decidePermission,
  preApprove,
  findDenial,
  listActiveGrants,
  revokeGrant as revokeGrantStore,
  renderPermissionPrompt,
} from './ToolPermissionService';
import {
  integrateGrantedTool,
  listIntegratedTools as listIntegratedToolsFn,
  suspendIntegratedTool,
} from './ToolIntegrator';
import { toolGrantStore } from './ToolGrantStore';
import { toolAuditLog } from './ToolAuditLog';
import type {
  CapabilityResolution,
  MCPToolCandidate,
  PermissionDecision,
  PermissionRequest,
  ToolPermissionGrant,
} from '../types/mcp-discovery';

/**
 * The MCP Tool Executive. Holds a reference to the tool registry so it can
 * check registered tools and register integrated ones.
 */
export class MCPToolExecutive {
  private registry: { get(id: string): Tool | undefined; list(): Tool[] } | undefined;

  setRegistry(registry: { get(id: string): Tool | undefined; list(): Tool[] }): void {
    this.registry = registry;
  }

  /**
   * Resolve a capability: does a registered tool already satisfy it, or is
   * there an active grant? If neither, the capability needs MCP discovery +
   * permission (§3 steps 1, 5, 7).
   */
  resolveCapability(opts: {
    capability: string;
    task?: string;
    actor?: string;
  }): CapabilityResolution {
    const { capability, task, actor } = opts;

    // §3 step 1: Need detected — check registered tools first.
    if (this.registry) {
      for (const tool of this.registry.list()) {
        if (this.toolSatisfies(tool, capability)) {
          return { satisfied: true, tool };
        }
      }
    }

    // §3 step 7: an active grant already makes the tool available in scope.
    const activeGrants = listActiveGrants();
    for (const grant of activeGrants) {
      if (grant.toolName.toLowerCase().includes(capability.toLowerCase())
        || capability.toLowerCase().includes(grant.toolName.toLowerCase())) {
        return { satisfied: true, grant };
      }
    }

    // §3 step 5 (denial path): remembered denials block re-asking for the same
    // need. We can only confirm this after discovering candidates, which is
    // done asynchronously in discoverAndRequestPermission.
    return {
      satisfied: false,
      error: 'No registered tool or active grant satisfies this capability. Use discoverAndRequestPermission to search MCP libraries.',
    };
  }

  /**
   * Async discovery: query MCP libraries, vet candidates, and either
   * pre-approve (curated) or issue a permission request for the best
   * candidate (§3 steps 2-4).
   *
   * The agent pauses the part of the task that needs this capability, or
   * continues with other work if it can (§3 step 4).
   */
  async discoverAndRequestPermission(opts: {
    capability: string;
    task?: string;
    actor?: string;
    preApproveCurated?: boolean;
    preApprovedBy?: string;
  }): Promise<CapabilityResolution> {
    const { capability, task, actor, preApproveCurated = true, preApprovedBy } = opts;

    const { candidates, errors } = await mcpToolDiscovery.discover({
      neededCapability: capability,
      triggeringTask: task,
      actor,
    });

    if (candidates.length === 0) {
      toolAuditLog.record({
        type: 'mcp.discovery',
        message: `No MCP candidates found for capability "${capability}"${errors.length ? ` (${errors.length} source errors)` : ''}`,
        actor,
        metadata: { capability, errors },
      });
      return {
        satisfied: false,
        error: errors.length > 0 ? `Discovery failed: ${errors.join('; ')}` : 'No suitable MCP tool found for this capability.',
      };
    }

    // §5 denial path: drop candidates with a remembered denial for this need.
    const nonDenied = candidates.filter((c) => !findDenial(c.id, capability));
    if (nonDenied.length === 0) {
      toolAuditLog.record({
        type: 'permission.denied',
        message: `All MCP candidates for capability "${capability}" have a remembered denial`,
        actor,
        metadata: { capability },
      });
      return {
        satisfied: false,
        error: 'All candidate tools were previously denied for this capability.',
      };
    }

    // §4.3: Org policy can pre-approve curated tools so the user is not
    // prompted at all. Pre-apply the grant and integrate automatically.
    if (preApproveCurated) {
      for (const candidate of nonDenied) {
        if (candidate.tier === 'curated' && candidate.preApproved) {
          const grant = preApprove(candidate, { decidedBy: preApprovedBy || actor || 'system' });
          if (grant) {
            try {
              const integrated = integrateGrantedTool(grant, candidate);
              return {
                satisfied: true,
                grant,
                tool: integrated.tool,
              };
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              toolAuditLog.record({
                type: 'tool.integrated',
                message: `Pre-approved integration failed for "${candidate.name}": ${message}`,
                toolId: candidate.id,
                toolName: candidate.name,
                sourceId: candidate.sourceId,
                actor,
                metadata: { reason: 'integration_failed', error: message },
              });
              return { satisfied: false, error: message };
            }
          }
        }
      }
    }

    // §3 step 4: Present the best candidate to the user and ask permission.
    const best = nonDenied[0];

    if (findDenial(best.id, capability)) {
      return {
        satisfied: false,
        error: 'Best candidate was previously denied for this capability.',
      };
    }

    // §4.1: Build the stage7-written permission request.
    const request = buildPermissionRequest(best, { actor });

    toolAuditLog.record({
      type: 'permission.requested',
      message: `Permission request issued for tool "${best.name}" — capability: ${capability}`,
      toolId: best.id,
      toolName: best.name,
      sourceId: best.sourceId,
      actor,
      metadata: { requestId: request.id, capability },
    });

    return {
      satisfied: false,
      candidate: best,
      permissionRequest: request,
    };
  }

  /**
   * Decide a permission request: grant or deny (§5).
   *
   * On grant, performs automatic integration (§6). On deny, remembers the
   * denial so the same tool is not asked again for the same need.
   */
  async decidePermission(opts: {
    requestId: string;
    decision: PermissionDecision;
    scope?: string;
    decidedBy: string;
    expiryDays?: number;
  }): Promise<CapabilityResolution> {
    const { requestId, decision, scope, decidedBy, expiryDays } = opts;

    const request = getPermissionRequest(requestId);
    if (!request) {
      const previous = getPersistedPermissionDecision(requestId);
      if (previous?.decision === decision && (scope === undefined || previous.grant?.scope === scope || previous.denial?.scopeRequested === scope)) {
        if (previous.decision === 'denied') {
          return { satisfied: false, error: 'Permission denied.' };
        }
        if (previous.grant) {
          const existingTool = listIntegratedToolsFn().find((tool) => {
            const manifest = tool.manifest as Record<string, unknown> | undefined;
            return manifest?.grantId === previous.grant?.id;
          });
          if (existingTool) return { satisfied: true, grant: previous.grant, tool: existingTool };
          try {
            const integrated = integrateGrantedTool(previous.grant, previous.request.candidate);
            return { satisfied: true, grant: previous.grant, tool: integrated.tool };
          } catch (error) {
            return {
              satisfied: false,
              error: `Permission was granted, but tool integration could not be recovered: ${error instanceof Error ? error.message : String(error)}`,
            };
          }
        }
      }
      return { satisfied: false, error: 'Permission request not found or expired' };
    }

    const result = decidePermission(requestId, decision, {
      scope: scope as any,
      decidedBy,
      expiryDays,
    });

    if (result.decision === 'denied') {
      return { satisfied: false, error: result.reason ?? 'Permission denied' };
    }

    // §3 step 6: Automatic integration on grant.
    const grant = result.grant!;
    const candidate = request.candidate;
    try {
      const integrated = integrateGrantedTool(grant, candidate);
      return {
        satisfied: true,
        grant,
        tool: integrated.tool,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toolAuditLog.record({
        type: 'tool.integrated',
        message: `Granted but integration failed for "${candidate.name}": ${message}`,
        toolId: candidate.id,
        toolName: candidate.name,
        sourceId: candidate.sourceId,
        actor: decidedBy,
        scope: grant.scope,
        metadata: { reason: 'integration_failed', error: message },
      });
      return { satisfied: false, error: `Permission granted but integration failed: ${message}` };
    }
  }

  /**
   * Revoke a grant (§9). Removes the integrated tool from the registry
   * immediately and releases its credentials.
   */
  revokeGrant(grantId: string, revokedBy: string): boolean {
    const grant = toolGrantStore.getGrant(grantId);
    if (!grant) return false;

    // Remove the integrated tool from the registry (§9 revocation).
    const integratedTool = listIntegratedToolsFn().find((t) => {
      const m = t.manifest as Record<string, unknown> | undefined;
      return m?.grantId === grantId;
    });
    if (integratedTool) {
      suspendIntegratedTool(integratedTool.id, `Revoked by ${revokedBy}`);
    }

    return revokeGrantStore(grantId, revokedBy);
  }

  /**
   * List all active granted tools (visibility: scope, tier, recent use §9).
   */
  listGrantedTools(): ToolPermissionGrant[] {
    return listActiveGrants();
  }

  /**
   * List all integrated tools currently registered and discoverable.
   */
  listIntegratedTools(): Tool[] {
    return listIntegratedToolsFn();
  }

  /**
   * Check re-consent triggers (§9): grant expired, definition changed.
   * Returns grants that need re-consent and suspends them.
   */
  checkReConsent(): { needsReConsent: Array<{ grant: ToolPermissionGrant; trigger: string; reason: string }> } {
    const needsReConsent: Array<{ grant: ToolPermissionGrant; trigger: string; reason: string }> = [];
    const now = new Date();

    for (const grant of toolGrantStore.listGrants()) {
      if (grant.revoked) continue;

      // Grant expired (§9).
      if (grant.expiresAt && now > grant.expiresAt) {
        needsReConsent.push({
          grant,
          trigger: 'grant_expired',
          reason: `Grant expired on ${grant.expiresAt.toISOString()}`,
        });
        suspendIntegratedTool(`integrated_mcp_${grant.id}`, `Grant expired (trigger: grant_expired)`);
        continue;
      }
    }

    return { needsReConsent };
  }

  /**
   * Flag re-consent required for a tool whose definition changed (§9).
   * Suspends the integrated tool until a new permission request is issued.
   */
  async reConsentOnDefinitionChange(grantId: string): Promise<{ ok: boolean; changed: boolean; reason?: string }> {
    const grant = toolGrantStore.getGrant(grantId);
    if (!grant) return { ok: false, changed: false, reason: 'Grant not found' };

    toolAuditLog.record({
      type: 'tool.re_consent_required',
      message: `Re-consent required for tool "${grant.toolName}" (grant ${grantId})`,
      toolId: grant.toolId,
      toolName: grant.toolName,
      sourceId: grant.sourceId,
      actor: grant.grantedBy,
      scope: grant.scope,
      definitionHash: grant.definitionHash,
      metadata: { grantId },
    });

    suspendIntegratedTool(`integrated_mcp_${grantId}`, 'Definition changed or re-consent required');

    return {
      ok: true,
      changed: true,
      reason: 'Tool suspended pending re-consent; issue a new permission request',
    };
  }

  // --- internal helpers ---

  private toolSatisfies(tool: Tool, capability: string): boolean {
    const haystack = [
      tool.name,
      tool.description,
      tool.manifest?.description,
      JSON.stringify(tool.manifest?.capabilities ?? []),
    ].join(' ').toLowerCase();
    const needle = capability.toLowerCase();
    return haystack.includes(needle);
  }
}

export const mcpToolExecutive = new MCPToolExecutive();
