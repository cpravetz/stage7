// @ts-nocheck

import { createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';

export const CREATE_ROADMAP = createDeclarativeCodeSkill({
    id: 'create-roadmap',
    tier: 'advise',
    isSkill: true,
    name: 'Create Roadmap',
    description: 'Generate a product roadmap with RICE-prioritized goals, topologically-sorted initiatives, capacity planning, milestones, risk assessment, theme allocation, and OKR alignment.',
    persistenceEnvVar: 'STORAGE_DIR',
    inputSchema: {
      type: 'object',
      properties: {
        quarter: { type: 'string', description: 'Roadmap quarter (e.g., Q1 2026)' },
        goals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Goal description' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Goal priority' },
              owner: { type: 'string', description: 'Goal owner' },
              reach: { type: 'number', description: 'RICE reach estimate (users affected)' },
              impact: { type: 'number', description: 'RICE impact (0.25-3 scale)' },
              confidence: { type: 'number', description: 'RICE confidence (0-1)' },
              effort: { type: 'number', description: 'RICE effort (person-weeks)' }
            }
          },
          description: 'Business/product goals to prioritize'
        },
        initiatives: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Initiative name' },
              goals: { type: 'array', items: { type: 'string' }, description: 'Goals this initiative supports' },
              effort: { type: 'number', description: 'Estimated effort in person-weeks' },
              dependencies: { type: 'array', items: { type: 'string' }, description: 'Initiative IDs this depends on' },
              risk: { type: 'number', description: 'Risk score (0-1)' }
            }
          },
          description: 'Initiatives to sequence and schedule'
        },
        themes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Strategic themes to allocate across'
        },
        timeHorizon: { type: 'number', description: 'Number of quarters to plan' },
        capacity: { type: 'number', description: 'Team size (capacity per quarter)' }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the roadmap was generated' },
        roadmap: { type: 'object', description: 'Generated roadmap with RICE-scored goals, sequenced initiatives, capacity plan, milestones, risks, OKRs, and themes' },
        okrs: { type: 'array', description: 'OKR objects aligned to each goal' },
        metrics: { type: 'object', description: 'Summary metrics' }
      },
      required: ['success', 'roadmap'],
    },
    triggers: [{ kind: 'user', phrase_examples: ["Create a roadmap", "Plan a release", "Check roadmap status"] }],
    manifest: {
      // Publishing the roadmap to the team is the delivery half of this Skill.
      lowerOrderTools: ['product-slack', 'product-calendar'],
    },
    handler: async function handler(input, ctx) {
        function round2(n) { return Math.round(n * 100) / 100; }
        function round4(n) { return Math.round(n * 10000) / 10000; }

        const quarter = input.quarter || ('Q' + (new Date().getMonth() < 3 ? 1 : new Date().getMonth() < 6 ? 2 : new Date().getMonth() < 9 ? 3 : 4));
        const goals = Array.isArray(input.goals) ? input.goals : [];
        const initiatives = Array.isArray(input.initiatives) ? input.initiatives : [];
        const themes = Array.isArray(input.themes) ? input.themes : [];
        const timeHorizon = Math.max(1, Math.min(12, Number(input.timeHorizon) || 4));
        const capacity = Math.max(1, Number(input.capacity) || 5);

        const okrs = goals.map((g, i) => ({
          id: 'okr_' + (i + 1),
          goalId: 'goal_' + i,
          objective: g.text || 'Untitled Goal',
          keyResults: [
            { id: 'kr_' + (i + 1) + '_1', description: 'Deliver measurable outcome for ' + (g.text || 'Goal') + ' - completion rate', target: 100, current: 0 },
            { id: 'kr_' + (i + 1) + '_2', description: 'Stakeholder satisfaction score for ' + (g.text || 'Goal'), target: 4.0, current: 0 },
            { id: 'kr_' + (i + 1) + '_3', description: 'Revenue or adoption metric tied to ' + (g.text || 'Goal'), target: 1.0, current: 0 }
          ],
          alignment: 'aligned',
          createdAt: new Date().toISOString()
        }));

        const scoredGoals = goals.map((g, i) => {
          const reach = Math.max(1, Number(g.reach || (g.priority === 'high' ? 80 : g.priority === 'medium' ? 40 : 15)));
          const impact = Math.max(0.1, Number(g.impact || (g.priority === 'high' ? 3 : g.priority === 'medium' ? 2 : 0.5)));
          const confidence = Math.max(0.1, Math.min(1, Number(g.confidence || 0.8)));
          const effort = Math.max(0.1, Number(g.effort || 5));
          const rice = round4((reach * impact * confidence) / effort);
          const wsjf = round4(((reach * impact) + (confidence * 10)) / Math.max(0.1, effort));
          return {
            id: 'goal_' + i,
            text: g.text || 'Goal ' + (i + 1),
            priority: g.priority || 'medium',
            owner: g.owner || 'Unassigned',
            rice: rice,
            wsjf: wsjf,
            reach, impact, confidence, effort,
            score: Math.round((rice + wsjf) * 100) / 100,
            okrId: 'okr_' + (i + 1),
            measurableOutcome: 'Achieve ' + (g.text || 'Goal') + ' with quantifiable results within ' + timeHorizon + ' quarter(s)'
          };
        });

        scoredGoals.sort((a, b) => b.score - a.score);

        const depGraph = {};
        const indegree = {};
        initiatives.forEach((init, i) => {
          const id = 'init_' + i;
          depGraph[id] = (init.dependencies || []).map(d => typeof d === 'string' ? d : (d.id || ('init_dep_' + i)));
          indegree[id] = indegree[id] || 0;
          (init.dependencies || []).forEach(d => {
            const depId = typeof d === 'string' ? d : (d.id || ('init_dep_' + i));
            if (!depGraph[depId]) { depGraph[depId] = []; indegree[depId] = 0; }
            indegree[id] = (indegree[id] || 0) + 1;
          });
        });

        const sortedInitiatives = [];
        const queue = Object.keys(indegree).filter(k => indegree[k] === 0);
        const indegreeCopy = Object.assign({}, indegree);
        const queueSet = new Set(queue);
        while (queue.length > 0) {
          const current = queue.shift();
          sortedInitiatives.push(current);
          (depGraph[current] || []).forEach(neighbor => {
            indegreeCopy[neighbor] = (indegreeCopy[neighbor] || 0) - 1;
            if (indegreeCopy[neighbor] === 0 && !queueSet.has(neighbor)) {
              queue.push(neighbor);
              queueSet.add(neighbor);
            }
          });
        }
        Object.keys(indegreeCopy).filter(k => indegreeCopy[k] > 0).forEach(k => {
          if (!sortedInitiatives.includes(k)) sortedInitiatives.push(k);
        });

        const initiativeData = initiatives.map((init, i) => {
          const effort = Math.max(0.5, Number(init.effort || 5));
          const riskScore = Number(init.risk || 0.3);
          const deps = Array.isArray(init.dependencies) ? init.dependencies : [];
          return {
            id: 'init_' + i,
            text: init.text || 'Initiative ' + (i + 1),
            goals: Array.isArray(init.goals) ? init.goals : [],
            effort: round2(effort),
            risk: riskScore,
            dependencies: deps.map(d => typeof d === 'string' ? d : (d.id || ('init_dep_' + i))),
            sortedIndex: sortedInitiatives.indexOf('init_' + i),
            milestones: [],
            quarter: 0,
            riskLevel: riskScore > 0.6 ? 'high' : riskScore > 0.3 ? 'medium' : 'low'
          };
        });

        const capacityPerQuarter = Math.max(1, capacity);
        const quarterCapacity = [];
        for (let q = 1; q <= timeHorizon; q++) {
          quarterCapacity.push({ quarter: q, capacity: capacityPerQuarter, used: 0, available: capacityPerQuarter });
        }

        const scheduledInitiatives = [];
        for (const initId of sortedInitiatives) {
          const initIdx = parseInt(initId.replace('init_', ''), 10);
          if (isNaN(initIdx) || initIdx >= initiativeData.length) continue;
          const init = initiativeData[initIdx];
          const effortNeeded = init.effort;
          let assigned = false;
          for (let q = 0; q < quarterCapacity.length; q++) {
            if (quarterCapacity[q].available >= effortNeeded) {
              quarterCapacity[q].used = round2(quarterCapacity[q].used + effortNeeded);
              quarterCapacity[q].available = round2(quarterCapacity[q].capacity - quarterCapacity[q].used);
              init.quarter = q + 1;
              scheduledInitiatives.push(init);
              assigned = true;
              break;
            }
          }
          if (!assigned) {
            const lastQ = quarterCapacity.length;
            quarterCapacity[lastQ - 1].used = round2(quarterCapacity[lastQ - 1].used + effortNeeded * 0.3);
            init.quarter = lastQ;
            scheduledInitiatives.push(init);
          }
        }

        for (const init of initiativeData) {
          const milestoneCount = Math.max(1, Math.ceil(init.effort / 3));
          init.milestones = [];
          for (let m = 1; m <= milestoneCount; m++) {
            init.milestones.push({
              id: 'milestone_' + init.id + '_' + m,
              initiativeId: init.id,
              name: 'Milestone ' + m + ' of ' + init.text,
              deliverable: 'Key deliverable for phase ' + m + ' of ' + init.text,
              quarter: init.quarter,
              completionCriteria: 'Deliverable reviewed and accepted by stakeholders',
              status: 'planned',
              targetDate: new Date(new Date().setMonth(new Date().getMonth() + ((init.quarter - 1) * 3) + (m * 3))).toISOString()
            });
          }
        }

        const allDependencies = [];
        for (const init of initiativeData) {
          for (const dep of init.dependencies) {
            allDependencies.push({ from: dep, to: init.id });
          }
        }
        const dependencyChainDepth = {};
        function getDepth(nodeId, visited = new Set()) {
          if (visited.has(nodeId)) return 0;
          if (dependencyChainDepth[nodeId] !== undefined) return dependencyChainDepth[nodeId];
          visited.add(nodeId);
          const parents = allDependencies.filter(d => d.to === nodeId).map(d => d.from);
          if (parents.length === 0) { dependencyChainDepth[nodeId] = 0; return 0; }
          const maxDepth = Math.max(...parents.map(p => getDepth(p, new Set(visited)))) + 1;
          dependencyChainDepth[nodeId] = maxDepth;
          return maxDepth;
        }
        for (const init of initiativeData) { getDepth(init.id); }

        const resourceConflicts = [];
        for (let q = 0; q < quarterCapacity.length; q++) {
          if (quarterCapacity[q].used > quarterCapacity[q].capacity) {
            resourceConflicts.push({
              type: 'overcapacity',
              quarter: q + 1,
              severity: 'high',
              description: 'Quarter ' + (q + 1) + ' exceeds capacity by ' + round2(quarterCapacity[q].used - quarterCapacity[q].capacity) + ' effort units'
            });
          }
        }
        for (let i = 0; i < initiativeData.length; i++) {
          for (let j = i + 1; j < initiativeData.length; j++) {
            if (initiativeData[i].quarter === initiativeData[j].quarter) {
              const sharedDeps = initiativeData[i].dependencies.filter(d => initiativeData[j].dependencies.includes(d));
              if (sharedDeps.length > 0) {
                resourceConflicts.push({
                  type: 'resource_conflict',
                  quarter: initiativeData[i].quarter,
                  severity: 'medium',
                  initiatives: [initiativeData[i].id, initiativeData[j].id],
                  description: initiativeData[i].text + ' and ' + initiativeData[j].text + ' share dependencies and run in same quarter'
                });
              }
            }
          }
        }

        const risks = [];
        for (const init of initiativeData) {
          if (init.riskLevel === 'high') {
            risks.push({
              id: 'risk_' + init.id,
              initiativeId: init.id,
              title: 'High risk in ' + init.text,
              probability: init.risk,
              impact: 'High',
              mitigation: 'Break into smaller chunks, add buffer capacity, increase monitoring frequency',
              dependencyChainDepth: dependencyChainDepth[init.id] || 0
            });
          }
        }
        for (const dc of Object.values(dependencyChainDepth)) {
          if (dc >= 3) {
            risks.push({
              id: 'risk_dep_chain_' + dc,
              type: 'dependency_chain',
              title: 'Deep dependency chain (depth ' + dc + ')',
              probability: 0.5,
              impact: 'Medium',
              mitigation: 'Identify critical path and front-load upstream deliverables'
            });
            break;
          }
        }
        if (resourceConflicts.length > 0) {
          risks.push({
            id: 'risk_capacity',
            type: 'capacity',
            title: 'Resource capacity conflicts detected',
            probability: 0.7,
            impact: 'High',
            mitigation: 'Re-sequence initiatives or increase team capacity',
            conflicts: resourceConflicts
          });
        }

        const themeAllocation = themes.map((theme, i) => {
          const themeInits = scheduledInitiatives.filter(init => {
            const initData = initiativeData[parseInt(init.id.replace('init_', ''), 10)];
            return initData && Array.isArray(initData.goals) && initData.goals.length > 0;
          });
          return {
            id: 'theme_' + (i + 1),
            name: theme,
            initiativeCount: Math.max(1, Math.ceil(scheduledInitiatives.length / Math.max(1, themes.length))),
            priority: i === 0 ? 'primary' : 'supporting',
            balanceScore: round2(1 - Math.abs(i - (themes.length - 1) / 2) / Math.max(1, (themes.length - 1) / 2))
          };
        });

        if (themes.length === 0) {
          themeAllocation.push({
            id: 'theme_1',
            name: 'Strategic Focus',
            initiativeCount: scheduledInitiatives.length,
            priority: 'primary',
            balanceScore: 1.0
          });
        }

        const roadmap = {
          id: 'roadmap_' + Date.now(),
          quarter,
          timeHorizon,
          capacity: { teamSize: capacity, perQuarter: capacityPerQuarter },
          goals: scoredGoals,
          initiatives: initiativeData.sort((a, b) => (a.quarter || 0) - (b.quarter || 0) || (a.sortedIndex || 0) - (b.sortedIndex || 0)),
          themes: themeAllocation,
          milestones: initiativeData.flatMap(i => i.milestones),
          riskAssessment: {
            risks,
            dependencyChains: Object.keys(dependencyChainDepth).length,
            maxDependencyDepth: Math.max(0, ...Object.values(dependencyChainDepth)),
            resourceConflicts,
            criticalPath: scheduledInitiatives.filter(i => (dependencyChainDepth[i.id] || 0) >= 2).map(i => i.id)
          },
          okrs,
          metrics: {
            totalGoals: scoredGoals.length,
            totalInitiatives: initiativeData.length,
            totalMilestones: initiativeData.reduce((sum, i) => sum + i.milestones.length, 0),
            totalRisks: risks.length,
            averageRice: scoredGoals.length > 0 ? round2(scoredGoals.reduce((s, g) => s + g.rice, 0) / scoredGoals.length) : 0,
            capacityUtilization: quarterCapacity.map(qc => ({
              quarter: qc.quarter,
              utilization: qc.capacity > 0 ? round4(qc.used / qc.capacity) : 0
            }))
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: 'algorithmic'
        };

        return roadmap;
      }
    });
