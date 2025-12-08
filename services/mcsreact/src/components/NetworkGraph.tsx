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

    // Sanitize string by removing control characters and other non-printable ranges
    const sanitizeString = (s: string) => {
        if (!s || typeof s !== 'string') return '';
        // Remove C0 control chars and C1 control chars ranges
        return s.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    };

    // Encode UTF-8 string to base64 in a browser-safe way
    const utf8ToB64 = (s: string) => {
        try {
            const encoder = new TextEncoder();
            const bytes = encoder.encode(s);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        } catch (e) {
            // Fallback: try btoa on sanitized string (may still fail)
            try {
                return btoa(sanitizeString(s));
            } catch (e2) {
                return '';
            }
        }
    };

    

    // Memoize the processed data and create a hash to detect real changes
    const { nodes, edges, dataHash } = useMemo(() => {
        const isDarkMode = theme === 'dark';
        console.log('[NetworkGraph] Processing agentStatistics...');

        let statsMap: Map<string, Array<AgentStatistics>>;
        if (agentStatistics instanceof Map) {
            statsMap = agentStatistics;
            console.log('[NetworkGraph] agentStatistics is already a Map');
        } else {
            try {
                statsMap = MapSerializer.transformFromSerialization(agentStatistics);
                console.log('[NetworkGraph] agentStatistics deserialized');
            } catch (e) {
                console.error('[NetworkGraph] Error transforming statistics:', e);
                return { nodes: new DataSet<Node>(), edges: new DataSet<Edge>(), dataHash: '' };
            }
        }
        console.log('[NetworkGraph] statsMap:', statsMap.size);
        if (!statsMap || typeof statsMap.get !== 'function' || statsMap.size === 0) {
            console.log('[NetworkGraph] No valid statistics data in map: ',statsMap);
            return { nodes: new DataSet<Node>(), edges: new DataSet<Edge>(), dataHash: 'empty' };
        }

        const dataString = JSON.stringify(Array.from(statsMap.entries()));
        const safeString = sanitizeString(dataString);
        const dataHash = (safeString === '[]' || safeString === '') ? 'empty' : utf8ToB64(safeString).slice(0, 32);

        if (dataHash === lastDataHashRef.current && networkRef.current) {
            console.log('[NetworkGraph] Data unchanged, keeping existing network');
            return { 
                nodes: new DataSet<Node>(), 
                edges: new DataSet<Edge>(), 
                dataHash 
            };
        }
        console.log('[NetworkGraph] Data changed, rebuilding network');

        const newNodes = new DataSet<Node>();
        const newEdges = new DataSet<Edge>();

        // Build lookup tables
        const stepIdToAgentId: Record<string, string> = {};
        const stepIdToStep: Record<string, any> = {};
        const allDependencies: Record<string, Set<string>> = {};
        const allDependents: Record<string, Set<string>> = {};

        const inputNodeColor = isDarkMode 
            ? { background: '#424242', border: '#90a4ae' } 
            : { background: '#f5f5f5', border: '#607d8b' };
        const inputFontColor = isDarkMode ? '#f5f5f5' : '#222';

        const outputNodeColor = isDarkMode
            ? { background: '#385739', border: '#66bb6a' }
            : { background: '#e8f5e9', border: '#388e3c' };
        const outputFontColor = isDarkMode ? '#f5f5f5' : '#222';
        
        // 1st pass: Collect all steps, agents, and dependencies
        for (const agents of statsMap.values()) {
            if (!Array.isArray(agents)) continue;
            
            agents.forEach((agent: AgentStatistics) => {
                if (!agent.steps || !Array.isArray(agent.steps)) return;
                
                agent.steps.forEach(step => {
                    stepIdToAgentId[step.id] = agent.id || 'unknown-agentId';
                    stepIdToStep[step.id] = step;
                    
                    if (!allDependencies[step.id]) allDependencies[step.id] = new Set();
                    
                    // From `dependencies` array
                    if (step.dependencies && Array.isArray(step.dependencies)) {
                        step.dependencies.forEach(depId => {
                            if (depId && depId !== 'unknown-sourceStepId') {
                                allDependencies[step.id].add(depId);
                            }
                        });
                    }

                    // From `inputReferences` map
                    if (step.inputReferences) {
                        try {
                            const inputRefs = step.inputReferences instanceof Map 
                                ? step.inputReferences
                                : MapSerializer.transformFromSerialization(step.inputReferences);

                            for (const inputRef of inputRefs.values()) {
                                if (inputRef && inputRef.sourceStep && inputRef.sourceStep !== 'unknown-sourceStepId' && inputRef.sourceStep !== '0') {
                                    allDependencies[step.id].add(inputRef.sourceStep);
                                }
                            }
                        } catch(e) {
                            console.error(`[NetworkGraph] Failed to process inputReferences for step ${step.id}`, e);
                        }
                    }
                });
            });
        }
        
        // 2nd pass: Build dependents map
        for (const stepId in allDependencies) {
            allDependencies[stepId].forEach(depId => {
                if (stepIdToStep[depId]) { // Only create dependents for actual steps
                    if (!allDependents[depId]) allDependents[depId] = new Set();
                    allDependents[depId].add(stepId);
                }
            });
        }
        
        // 3rd pass: Create nodes and edges
        for (const agents of statsMap.values()) {
            if (!Array.isArray(agents)) continue;

            agents.forEach((agent: AgentStatistics) => {
                const agentColor = agent.color || '#999999';
                if (!agent.steps || !Array.isArray(agent.steps)) return;

                const agentInputNodeId = `agent-input-${agent.id}`;
                const agentOutputNodeId = `agent-output-${agent.id}`;

                let hasInputSteps = false;
                let hasOutputSteps = false;

                // Determine if agent I/O nodes are needed
                agent.steps.forEach(step => {
                    const stepDependencies = allDependencies[step.id] || new Set();
                    const intraAgentDependencies = Array.from(stepDependencies).filter(depId => stepIdToAgentId[depId] === agent.id);
                    if (intraAgentDependencies.length === 0) {
                        hasInputSteps = true;
                    }

                    const stepDependents = allDependents[step.id] || new Set();
                    const intraAgentDependents = Array.from(stepDependents).filter(depId => stepIdToAgentId[depId] === agent.id);
                    if (intraAgentDependents.length === 0) {
                        hasOutputSteps = true;
                    }
                });

                // Add agent I/O nodes only if they are used
                if (hasInputSteps) {
                    newNodes.add({
                        id: agentInputNodeId, label: `AGENT\nINPUT`, color: inputNodeColor,
                        borderWidth: 2, font: { color: inputFontColor }, group: agent.id, shape: 'ellipse',
                    });
                }
                if (hasOutputSteps) {
                    newNodes.add({
                        id: agentOutputNodeId, label: `AGENT\nOUTPUT`, color: outputNodeColor,
                        borderWidth: 2, font: { color: outputFontColor }, group: agent.id, shape: 'ellipse',
                    });
                }
                
                // Create step nodes and edges
                agent.steps.forEach(step => {
                    const stepStatusBorderColor = getStepStatusBorderColor(step.status);
                    const fontColor = getContrastYIQ(agentColor);
                    
                    if (!newNodes.get(step.id)) {
                        newNodes.add({
                            id: step.id,
                            label: `${step.actionVerb || step.verb}\n(${step.status.toUpperCase()})`,
                            color: {
                                background: agentColor,
                                border: stepStatusBorderColor,
                                highlight: { background: agentColor, border: stepStatusBorderColor },
                                hover: { background: agentColor, border: '#FFC107' }
                            },
                            borderWidth: 3,
                            group: agent.id,
                            font: { color: fontColor }
                        });
                    }

                    const stepDependencies = allDependencies[step.id] || new Set();
                    const stepDependents = allDependents[step.id] || new Set();
                    
                    // Edges from dependencies to this step
                    stepDependencies.forEach(depId => {
                        if (stepIdToStep[depId]) {
                            const fromAgentId = stepIdToAgentId[depId];
                            const toAgentId = agent.id;
                            const edgeColor = (fromAgentId === toAgentId) ? (agent.color || '#999999') : '#FF5722'; // Orange for inter-agent

                            newEdges.update({ // Use update to avoid duplicates
                                id: `${depId}-${step.id}`,
                                from: depId,
                                to: step.id,
                                arrows: 'to',
                                color: { color: edgeColor, highlight: '#FFC107', hover: '#FFC107' },
                                smooth: { enabled: true, type: 'cubicBezier', roundness: 0.2 }
                            });
                        }
                    });

                    // Edge from agent input node if it's an input step
                    const intraAgentDependencies = Array.from(stepDependencies).filter(depId => stepIdToAgentId[depId] === agent.id);
                    if (intraAgentDependencies.length === 0 && hasInputSteps) {
                         newEdges.update({ // Use update to avoid duplicates
                            id: `${agentInputNodeId}-${step.id}`,
                            from: agentInputNodeId, to: step.id, arrows: 'to',
                            color: { color: '#607d8b', highlight: '#FFC107', hover: '#FFC107' },
                            width: 2, dashes: true,
                            smooth: { enabled: true, type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.5 }
                        });
                    }
                    
                    // Edge to agent output node if it's an output step
                    const intraAgentDependents = Array.from(stepDependents).filter(depId => stepIdToAgentId[depId] === agent.id);
                    if (intraAgentDependents.length === 0 && hasOutputSteps) {
                        newEdges.update({ // Use update to avoid duplicates
                            id: `${step.id}-${agentOutputNodeId}`,
                            from: step.id, to: agentOutputNodeId, arrows: 'to',
                            color: { color: '#388e3c', highlight: '#FFC107', hover: '#FFC107' },
                            width: 2, dashes: true,
                            smooth: { enabled: true, type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.5 }
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