import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { Edge, Node, Options } from 'vis-network';
import { MapSerializer, AgentStatistics } from '../shared-browser';
import './NetworkGraph.css';
import './step-overview-fullscreen.css';
import { API_BASE_URL } from '../config';
import { SecurityClient } from '../SecurityClient';

interface NetworkGraphProps {
    agentStatistics: Map<string, Array<AgentStatistics>> | any;
    zoom: number;
    setZoom: (zoom: number) => void;
    pan: { x: number, y: number };
    setPan: (pan: { x: number, y: number }) => void;
    theme: 'light' | 'dark';
}

const getStepStatusBorderColor = (status: string): string => {
    switch (status.toLowerCase()) {
        case 'pending': return '#FFD700';
        case 'running': return '#1E90FF';
        case 'completed': return '#32CD32';
        case 'error': return '#FF0000';
        case 'failed': return '#FF0000';
        default: return '#808080';
    }
};

function getContrastYIQ(hexcolor: string): string {
    let r, g, b;
    if (hexcolor.startsWith('hsl')) {
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

export const NetworkGraph: React.FC<NetworkGraphProps> = ({ agentStatistics, zoom, setZoom, pan, setPan, theme }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<Network | null>(null);
    
    const isInitializedRef = useRef(false);
    const lastDataHashRef = useRef<string>('');
    
    // Step overview dialog state
    const [stepOverview, setStepOverview] = React.useState<any | null>(null);
    const [stepOverviewOpen, setStepOverviewOpen] = React.useState(false);
    const [stepOverviewLoading, setStepOverviewLoading] = React.useState(false);
    const [stepOverviewError, setStepOverviewError] = React.useState<string | null>(null);

    // Zoom controls
    const handleZoom = useCallback((factor: number) => {
        const newScale = Math.max(0.1, zoom * factor);
        setZoom(newScale);
    }, [zoom, setZoom]);

    const handleResetZoom = useCallback(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }, [setZoom, setPan]);

    

    // Memoize the processed data and create a hash to detect real changes
    const { nodes, edges, dataHash } = useMemo(() => {
        const isDarkMode = theme === 'dark';
        console.log('[NetworkGraph] Processing agentStatistics...');

        let statsMap: Map<string, Array<AgentStatistics>>;
        if (agentStatistics instanceof Map) {
            statsMap = agentStatistics;
        } else {
            try {
                statsMap = MapSerializer.transformFromSerialization(agentStatistics);
            } catch (e) {
                console.error('[NetworkGraph] Error transforming statistics:', e);
                return { nodes: new DataSet<Node>(), edges: new DataSet<Edge>(), dataHash: '' };
            }
        }

        if (!statsMap || typeof statsMap.get !== 'function' || statsMap.size === 0) {
            console.log('[NetworkGraph] No valid statistics data in map: ',statsMap);
            return { nodes: new DataSet<Node>(), edges: new DataSet<Edge>(), dataHash: 'empty' };
        }

        // Create a hash of the data to detect actual changes
        const dataString = JSON.stringify(Array.from(statsMap.entries()));
        const dataHash = btoa(dataString).slice(0, 32); // Simple hash

        // If data hasn't changed, return empty datasets (will be handled by effect)
        if (dataHash === lastDataHashRef.current && networkRef.current) {
            console.log('[NetworkGraph] Data unchanged, keeping existing network');
            // Return empty datasets to signal no update needed
            return { 
                nodes: new DataSet<Node>(), 
                edges: new DataSet<Edge>(), 
                dataHash 
            };
        }

        const newNodes = new DataSet<Node>();
        const newEdges = new DataSet<Edge>();

        // Build lookup tables and nodes
        const stepIdToAgentId: Record<string, string> = {};
        const stepIdToStep: Record<string, any> = {};
        const agentIdToSteps: Record<string, any[]> = {};
        const stepIdToDependents: Record<string, Set<string>> = {};

        const inputNodeColor = isDarkMode 
            ? { background: '#424242', border: '#90a4ae' } 
            : { background: '#f5f5f5', border: '#607d8b' };
        const inputFontColor = isDarkMode ? '#f5f5f5' : '#222';

        const outputNodeColor = isDarkMode
            ? { background: '#385739', border: '#66bb6a' }
            : { background: '#e8f5e9', border: '#388e3c' };
        const outputFontColor = isDarkMode ? '#f5f5f5' : '#222';

        // Create nodes and build lookup tables
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
                    
                    if (!newNodes.get(step.id)) {
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
                    }
                });
            });
        }

        // Create edges
        for (const [statusCategory, agents] of statsMap.entries()) {
            if (!Array.isArray(agents)) continue;
            
            agents.forEach((agent: AgentStatistics) => {
                if (!agent.steps || !Array.isArray(agent.steps)) return;
                
                const agentInputIds: string[] = Array.isArray((agent as any).inputIds) ? (agent as any).inputIds : [];
                const agentOutputIds: string[] = Array.isArray((agent as any).outputIds) ? (agent as any).outputIds : [];
                
                // Add input nodes (if not already present)
                agentInputIds.forEach((inputId: string) => {
                    if (!newNodes.get(inputId)) {
                        newNodes.add({
                            id: inputId,
                            label: `AGENT INPUT\n${inputId}`,
                            color: inputNodeColor,
                            borderWidth: 2,
                            font: { color: inputFontColor },
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
                            color: outputNodeColor,
                            borderWidth: 2,
                            font: { color: outputFontColor },
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

        return { nodes: newNodes, edges: newEdges, dataHash };
    }, [agentStatistics, theme]);

    // Initialize or update the network only when data actually changes
    useEffect(() => {
        if (!containerRef.current) return;

        if (stepOverviewOpen) return;

        if (dataHash === 'empty' || (dataHash === lastDataHashRef.current && nodes.length === 0)) {
            console.log('[NetworkGraph] No data to display or unchanged');
            return;
        }

        if (dataHash === lastDataHashRef.current && networkRef.current) {
            console.log('[NetworkGraph] Data unchanged, skipping network update');
            return;
        }

        lastDataHashRef.current = dataHash;

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
            }
        };

        if (networkRef.current) {
            networkRef.current.setOptions(options);
            networkRef.current.setData({ nodes, edges });
            // Apply current zoom and pan after updating data to prevent fit() from resetting view
            networkRef.current.moveTo({ scale: zoom, position: pan });
            console.log('[NetworkGraph] Network updated and view restored');
        } else {
            networkRef.current = new Network(containerRef.current, { nodes, edges }, options);
            networkRef.current.fit(); // Fit the network on initial load
            isInitializedRef.current = true;

            const securityClient = SecurityClient.getInstance(API_BASE_URL);

            networkRef.current.on('click', async (params) => {
                if (params.nodes && params.nodes.length > 0) {
                    const stepId = params.nodes[0];
                    setStepOverviewLoading(true);
                    setStepOverviewOpen(true);
                    setStepOverviewError(null);
                    setStepOverview(null);

                    try {
                        const token = securityClient.getAccessToken();
                        const resp = await fetch(`${API_BASE_URL}/step/${stepId}`, {
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            credentials: 'include',
                            mode: 'cors'
                        });

                        if (!resp.ok) {
                            const errorData = await resp.json().catch(() => ({
                                message: 'Failed to fetch step overview and could not parse error response.'
                            }));
                            throw new Error(errorData.message || `Failed to fetch step overview. Status: ${resp.status}`);
                        }

                        const data = await resp.json();
                        setStepOverview(data);
                    } catch (e: any) {
                        setStepOverviewError(e.message || 'Error fetching step overview');
                    } finally {
                        setStepOverviewLoading(false);
                    }
                }
            });

            networkRef.current.on("dragEnd", (params) => {
                if (params.nodes.length > 0 && networkRef.current) {
                    const newPosition = networkRef.current.getViewPosition();
                    setPan(newPosition);
                }
            });

            networkRef.current.on("zoom", (params) => {
                const newScale = networkRef.current?.getScale() || 1;
                const newPosition = networkRef.current?.getViewPosition() || { x: 0, y: 0 };
                setZoom(newScale);
                setPan(newPosition);
            });

        }
    }, [nodes, edges, dataHash, stepOverviewOpen, setZoom, setPan]);

    // Apply zoom changes when zoom state changes
    useEffect(() => {
        if (networkRef.current && isInitializedRef.current) {
            networkRef.current.moveTo({ scale: zoom, position: pan });
        }
    }, [zoom, pan]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (networkRef.current) {
                networkRef.current.destroy();
                networkRef.current = null;
                isInitializedRef.current = false;
            }
        };
    }, []);

    // Step Overview Dialog
    const StepOverviewDialog = () => (
        <div className="step-overview-modal step-overview-fullscreen">
            <div className="step-overview-content">
                <button className="close-btn" onClick={() => setStepOverviewOpen(false)}>×</button>
                {stepOverviewLoading && <div>Loading...</div>}
                {!stepOverviewLoading && stepOverviewError && (
                    <div style={{ color: 'red' }}>{stepOverviewError}</div>
                )}
                {!stepOverviewLoading && !stepOverviewError && stepOverview && (
                    <div className="stepbox">
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

    return (
        <div style={{ position: 'relative', width: '100%' }} className={theme === 'dark' ? 'dark-mode' : ''}>
            {stepOverviewOpen && <StepOverviewDialog />}
            <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, display: 'flex', gap: 8 }}>
                <button onClick={() => handleZoom(1.2)} title="Zoom In">+</button>
                <button onClick={() => handleZoom(1/1.2)} title="Zoom Out">-</button>
                <button onClick={handleResetZoom} title="Reset Zoom">⟳</button>
            </div>
            <div ref={containerRef} className="network-graph" style={{ visibility: stepOverviewOpen ? 'hidden' : 'visible' }} />
        </div>
    );
};