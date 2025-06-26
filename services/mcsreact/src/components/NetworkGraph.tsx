import React, { useEffect, useRef, useMemo } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { Edge, Node, Options } from 'vis-network';
import { MapSerializer, AgentStatistics } from '../shared-browser'; // Assuming AgentStatistics is correctly defined
import './NetworkGraph.css';
import './step-overview-fullscreen.css';
import { API_BASE_URL } from '../config';
import { SecurityClient } from '../SecurityClient';

interface NetworkGraphProps {
    agentStatistics: Map<string, Array<AgentStatistics>> | any;
}

// getStatusColor will now return a border color or be part of the label,
// as the main node background will be dictated by the agent's color.
// Let's make it return a distinct border color for clarity.
const getStepStatusBorderColor = (status: string): string => {
    switch (status.toLowerCase()) {
        case 'pending': return '#FFD700'; // Gold
        case 'running': return '#1E90FF'; // DodgerBlue
        case 'completed': return '#32CD32'; // LimeGreen
        case 'error': return '#FF0000'; // Red
        case 'failed': return '#FF0000'; // Red
        default: return '#808080'; // Gray
    }
};

// Utility to determine best text color (black/white) for background
function getContrastYIQ(hexcolor: string): string {
    let r, g, b;
    if (hexcolor.startsWith('hsl')) {
        // Convert HSL to RGB
        const hsl = hexcolor.match(/hsl\(([-\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
        if (hsl) {
            let h = parseFloat(hsl[1]);
            let s = parseFloat(hsl[2]) / 100;
            let l = parseFloat(hsl[3]) / 100;
            let c = (1 - Math.abs(2 * l - 1)) * s;
            let x = c * (1 - Math.abs((h / 60) % 2 - 1));
            let m = l - c / 2;
            let r1 = 0, g1 = 0, b1 = 0;
            if (h < 60) { r1 = c; g1 = x; b1 = 0; }
            else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
            else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
            else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
            else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
            else { r1 = c; g1 = 0; b1 = x; }
            r = Math.round((r1 + m) * 255);
            g = Math.round((g1 + m) * 255);
            b = Math.round((b1 + m) * 255);
        } else { r = g = b = 128; }
    } else {
        // Assume hex
        let hex = hexcolor.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(x => x + x).join('');
        }
        r = parseInt(hex.substr(0, 2), 16);
        g = parseInt(hex.substr(2, 2), 16);
        b = parseInt(hex.substr(4, 2), 16);
    }
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#222' : '#fff';
}

export const NetworkGraph: React.FC<NetworkGraphProps> = ({ agentStatistics }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<Network | null>(null);
    // Store zoom and pan state
    const viewStateRef = useRef<{scale: number, position: {x: number, y: number}} | null>(null);
    // Step overview dialog state
    const [stepOverview, setStepOverview] = React.useState<any | null>(null);
    const [stepOverviewOpen, setStepOverviewOpen] = React.useState(false);
    const [stepOverviewLoading, setStepOverviewLoading] = React.useState(false);
    const [stepOverviewError, setStepOverviewError] = React.useState<string | null>(null);

    // --- Zoom controls ---
    const handleZoom = (factor: number) => {
        if (networkRef.current) {
            const scale = networkRef.current.getScale();
            networkRef.current.moveTo({ scale: Math.max(0.1, Math.min(5, scale * factor)) });
            // Save view state
            const position = networkRef.current.getViewPosition();
            viewStateRef.current = { scale: Math.max(0.1, Math.min(5, scale * factor)), position };
        }
    };
    const handleResetZoom = () => {
        if (networkRef.current) {
            networkRef.current.moveTo({ scale: 1 });
            // Save view state
            const position = networkRef.current.getViewPosition();
            viewStateRef.current = { scale: 1, position };
        }
    };

    // --- Helper to preserve and restore view state on updates ---
    const saveViewState = () => {
        if (networkRef.current) {
            const scale = networkRef.current.getScale();
            const position = networkRef.current.getViewPosition();
            viewStateRef.current = { scale, position };
        }
    };
    const restoreViewState = () => {
        if (networkRef.current && viewStateRef.current) {
            networkRef.current.moveTo({
                scale: viewStateRef.current.scale,
                position: viewStateRef.current.position
            });
        }
    };

    const { nodes, edges } = useMemo(() => {
        console.log('[NetworkGraph] raw agentStatistics prop:', JSON.stringify(agentStatistics, null, 2));

        let statsMap: Map<string, Array<AgentStatistics>>;
        if (agentStatistics instanceof Map) {
            statsMap = agentStatistics;
            console.log('[NetworkGraph] agentStatistics is already a Map.');
        } else {
            console.log('[NetworkGraph] agentStatistics is not a Map, attempting transformation...');
            try {
                statsMap = MapSerializer.transformFromSerialization(agentStatistics);
                console.log('[NetworkGraph] statsMap after transformation:', JSON.stringify(Array.from(statsMap.entries()), null, 2));
            } catch (e) {
                console.error('[NetworkGraph] Error during MapSerializer.transformFromSerialization:', e);
                console.error('[NetworkGraph] Original agentStatistics that caused error:', JSON.stringify(agentStatistics, null, 2));
                return { nodes: new DataSet<Node>(), edges: new DataSet<Edge>() };
            }
        }

        if (!statsMap || typeof statsMap.get !== 'function' || statsMap.size === 0) {
            console.error('[NetworkGraph] Invalid or empty statsMap after processing. statsMap:', statsMap);
             if (statsMap && typeof statsMap.get === 'function') {
                console.log(`[NetworkGraph] statsMap size: ${statsMap.size}`);
            }
            return { nodes: new DataSet<Node>(), edges: new DataSet<Edge>() };
        }

        const newNodes = new DataSet<Node>();
        const newEdges = new DataSet<Edge>();
        let nodeCount = 0;

        // --- Track step->agent and dependency relationships ---
        const stepIdToAgentId: Record<string, string> = {};
        const stepIdToStep: Record<string, any> = {};
        const agentIdToSteps: Record<string, any[]> = {};
        const stepIdToDependents: Record<string, Set<string>> = {};

        // First pass: create nodes and build lookup tables
        for (const [statusCategory, agents] of statsMap.entries()) {
            if (!Array.isArray(agents)) continue;
            agents.forEach((agent: AgentStatistics) => {
                const agentColor = agent.color || '#999999';
                if (!agent.steps || !Array.isArray(agent.steps)) return;
                agentIdToSteps[agent.agentId] = agent.steps;
                agent.steps.forEach(step => {
                    stepIdToAgentId[step.id] = agent.agentId;
                    stepIdToStep[step.id] = step;
                    // Build dependents map
                    if (step.dependencies && Array.isArray(step.dependencies)) {
                        step.dependencies.forEach(depId => {
                            if (!depId) return;
                            if (!stepIdToDependents[depId]) stepIdToDependents[depId] = new Set();
                            stepIdToDependents[depId].add(step.id);
                        });
                    }
                    const stepStatusBorderColor = getStepStatusBorderColor(step.status);
                    const fontColor = getContrastYIQ(agentColor);
                    newNodes.add({
                        id: step.id,
                        label: `${step.verb}\n(${step.status.toUpperCase()})`,
                        color: {
                            background: agentColor,
                            border: stepStatusBorderColor,
                            highlight: { background: agentColor, border: stepStatusBorderColor },
                            hover: { background: agentColor, border: '#FFC107' }
                        },
                        borderWidth: 3,
                        group: agent.agentId,
                        font: { color: fontColor }
                    });
                });
            });
        }

        // Second pass: create edges (dependencies, agent input/output links)
        for (const [statusCategory, agents] of statsMap.entries()) {
            if (!Array.isArray(agents)) continue;
            agents.forEach((agent: AgentStatistics) => {
                if (!agent.steps || !Array.isArray(agent.steps)) return;
                // Use inputIds/outputIds if present, else fallback to []
                const agentInputIds: string[] = Array.isArray((agent as any).inputIds) ? (agent as any).inputIds : [];
                const agentOutputIds: string[] = Array.isArray((agent as any).outputIds) ? (agent as any).outputIds : [];
                // Add input nodes (if not already present)
                agentInputIds.forEach((inputId: string) => {
                    if (!newNodes.get(inputId)) {
                        newNodes.add({
                            id: inputId,
                            label: `AGENT INPUT\n${inputId}`,
                            color: { background: '#f5f5f5', border: '#607d8b' },
                            borderWidth: 2,
                            font: { color: '#222' },
                            group: agent.agentId,
                            shape: 'ellipse',
                        });
                    }
                });
                // Add output nodes (if not already present)
                agentOutputIds.forEach((outputId: string) => {
                    if (!newNodes.get(outputId)) {
                        newNodes.add({
                            id: outputId,
                            label: `AGENT OUTPUT\n${outputId}`,
                            color: { background: '#e8f5e9', border: '#388e3c' },
                            borderWidth: 2,
                            font: { color: '#222' },
                            group: agent.agentId,
                            shape: 'ellipse',
                        });
                    }
                });
                // Step-to-step and agent input/output edges
                agent.steps.forEach(step => {
                    // Standard dependencies
                    if (step.dependencies && Array.isArray(step.dependencies) && step.dependencies.length > 0) {
                        step.dependencies.forEach((depId: string) => {
                            if (!depId || depId === 'unknown-sourceStepId') return;
                            newEdges.add({
                                from: depId,
                                to: step.id,
                                arrows: 'to',
                                color: { color: agent.color || '#999999', highlight: '#FFC107', hover: '#FFC107' },
                                width: 2,
                                smooth: { enabled: true, type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.5 }
                            });
                        });
                    } else {
                        // No dependencies: connect agent input(s) to this step
                        agentInputIds.forEach((inputId: string) => {
                            newEdges.add({
                                from: inputId,
                                to: step.id,
                                arrows: 'to',
                                color: { color: '#607d8b', highlight: '#FFC107', hover: '#FFC107' },
                                width: 2,
                                dashes: true,
                                smooth: { enabled: true, type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.5 }
                            });
                        });
                    }
                    // No dependents: connect this step to agent output(s)
                    const dependents = stepIdToDependents[step.id];
                    if (!dependents || dependents.size === 0) {
                        agentOutputIds.forEach((outputId: string) => {
                            newEdges.add({
                                from: step.id,
                                to: outputId,
                                arrows: 'to',
                                color: { color: '#388e3c', highlight: '#FFC107', hover: '#FFC107' },
                                width: 2,
                                dashes: true,
                                smooth: { enabled: true, type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.5 }
                            });
                        });
                    }
                });
            });
        }
        console.log(`[NetworkGraph] Total nodes created: ${nodeCount}`);
        if (nodeCount === 0) {
            console.warn('[NetworkGraph] No nodes were created. Check the structure of agentStatistics and ensure agents have steps.');
        }

        return { nodes: newNodes, edges: newEdges };
    }, [agentStatistics]);

    useEffect(() => {
        if (!containerRef.current) {
            return;
        }

        // --- Save view state before update ---
        saveViewState();

        if (nodes.length === 0) {
            if (networkRef.current) {
                networkRef.current.setData({ nodes: new DataSet<Node>(), edges: new DataSet<Edge>() });
                console.log('[NetworkGraph] No nodes to display, clearing existing network.');
            } else {
                console.log('[NetworkGraph] No nodes to display, network not initialized.');
            }
            return;
        }

        const options: Options = {
            layout: {
                hierarchical: {
                    enabled: true,
                    direction: 'LR',
                    sortMethod: 'directed',
                    levelSeparation: 200,
                    nodeSpacing: 150,
                    treeSpacing: 250,
                    parentCentralization: true,
                    blockShifting: true,
                    edgeMinimization: true,
                    shakeTowards: 'roots'
                }
            },
            physics: {
                enabled: false
            },
            interaction: {
                dragNodes: true,
                dragView: true,
                zoomView: true,
                hover: true
            },
            nodes: {
                shape: 'box',
                margin: { top: 10, bottom: 10, left: 15, right: 15 },
                widthConstraint: {
                    minimum: 120,
                    maximum: 250
                },
                font: {
                    size: 12,
                },
            },
            edges: {
                smooth: {
                    enabled: true,
                    type: "cubicBezier",
                    forceDirection: "horizontal",
                    roundness: 0.5
                },
                arrows: {
                    to: { enabled: true, scaleFactor: 1 }
                },
                width: 2
            },
            groups: {
            }
        };

        if (networkRef.current) {
            networkRef.current.setOptions(options);
            networkRef.current.setData({ nodes, edges });
            // --- Restore view state after update ---
            restoreViewState();
            console.log('[NetworkGraph] Network updated with new data/options.');
        } else {
            networkRef.current = new Network(containerRef.current, { nodes, edges }, options);
            const securityClient = SecurityClient.getInstance(API_BASE_URL);
            // Add node click handler for step overview
            networkRef.current.on('click', async (params) => {
                if (params.nodes && params.nodes.length > 0) {
                    const stepId = params.nodes[0];
                    setStepOverviewLoading(true);
                    setStepOverviewOpen(true);
                    setStepOverviewError(null);
                    setStepOverview(null);
                    try {
                        const token = securityClient.getAccessToken();

                        // Fetch step overview from AgentSet API
                        const resp = await fetch(`${API_BASE_URL}/step/${stepId}`,{
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            credentials: 'include',
                            mode: 'cors'
                        });
                        console.log('[Step Details] Result:', resp);
                        if (!resp.ok) {
                            const errorData = await resp.json().catch(() => ({ message: 'Failed to fetch step overview and could not parse error response.' }));
                            throw new Error(errorData.message || `Failed to fetch step overview. Status: ${resp.status}`);
                        }
                        const data = await resp.json();
                        // The new endpoint directly returns the step details, no need to access a nested 'data' field.
                        setStepOverview(data);
                    } catch (e: any) {
                        setStepOverviewError(e.message || 'Error fetching step overview');
                    } finally {
                        setStepOverviewLoading(false);
                    }
                }
            });
            console.log('[NetworkGraph] New network initialized.');
        }

        // Only destroy on unmount
        return () => {
            if (networkRef.current) {
                console.log('[NetworkGraph] useEffect: Cleanup on unmount. Network will be destroyed.');
                networkRef.current.destroy();
                networkRef.current = null;
            }
        };
    }, [nodes, edges]);

    // Step Overview Dialog (now replaces the network graph visually)
    const StepOverviewDialog = () => {
        // Close on any keypress
        React.useEffect(() => {
            if (!stepOverviewOpen) return;
            const handleKey = (e: KeyboardEvent) => {
                setStepOverviewOpen(false);
            };
            window.addEventListener('keydown', handleKey);
            return () => window.removeEventListener('keydown', handleKey);
        }, [stepOverviewOpen]);
        return (
            <div className="step-overview-modal step-overview-fullscreen">
                <div className="step-overview-content">
                    <button className="close-btn" onClick={() => setStepOverviewOpen(false)}>×</button>
                    {stepOverviewLoading && <div>Loading...</div>}
                    {!stepOverviewLoading && stepOverviewError && (
                        <div style={{ color: 'red' }}>{stepOverviewError}</div>
                    )}
                    {!stepOverviewLoading && !stepOverviewError && stepOverview && (
                        <div className="stepbox" >
                            <h3>Step Overview</h3>
                            <div><b>Action:</b> {stepOverview.verb}</div>
                            <div><b>Description:</b> {stepOverview.description}</div>
                            <div><b>Status:</b> {stepOverview.status}</div>
                            <div><b>Inputs:</b> <pre>{JSON.stringify(stepOverview.inputs, null, 2)}</pre></div>
                            <div><b>Results:</b> <pre>{JSON.stringify(stepOverview.results, null, 2)}</pre></div>
                            <div><b>Dependencies:</b> <pre>{JSON.stringify(stepOverview.dependencies, null, 2)}</pre></div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            {stepOverviewOpen ? (
                <StepOverviewDialog />
            ) : (
                <>
                    <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, display: 'flex', gap: 8 }}>
                        <button onClick={() => handleZoom(1.2)} title="Zoom In">＋</button>
                        <button onClick={() => handleZoom(1/1.2)} title="Zoom Out">－</button>
                        <button onClick={handleResetZoom} title="Reset Zoom">⟳</button>
                    </div>
                    <div ref={containerRef} className="network-graph" />
                </>
            )}
        </div>
    );
};