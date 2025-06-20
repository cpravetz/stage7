import React, { useEffect, useRef, useMemo } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { Edge, Node, Options } from 'vis-network';
import { MapSerializer, AgentStatistics } from '../shared-browser'; // Assuming AgentStatistics is correctly defined
import './NetworkGraph.css';

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

        console.log(`[NetworkGraph] Iterating over statsMap (size: ${statsMap.size})...`);
        for (const [statusCategory, agents] of statsMap.entries()) { // statusCategory is the key of the map, e.g., "active", "inactive"
            console.log(`[NetworkGraph] Processing status category: ${statusCategory}, Number of agents: ${agents.length}`);
            if (!Array.isArray(agents)) {
                console.warn(`[NetworkGraph] Agents for status category ${statusCategory} is not an array:`, agents);
                continue;
            }
            agents.forEach((agent: AgentStatistics, agentIndex: number) => {
                console.log(`[NetworkGraph][DEBUG] Agent ${agentIndex} (status: ${statusCategory}) ID: ${agent.id}, Color: ${agent.color}, Steps count: ${agent.steps ? agent.steps.length : 'N/A'}`);
                if (agent.steps && Array.isArray(agent.steps)) {
                    agent.steps.forEach((step, stepIdx) => {
                        console.log(`[NetworkGraph][DEBUG]   Step ${stepIdx}: id=${step.id}, verb=${step.verb}, status=${step.status}, dependencies=${JSON.stringify(step.dependencies)}`);
                    });
                }

                const agentColor = agent.color || '#999999'; // Default agent color if undefined

                if (!agent.steps || !Array.isArray(agent.steps)) {
                     console.warn(`[NetworkGraph] Agent ${agent.id} has no steps or steps is not an array:`, agent.steps);
                     return;
                }
                agent.steps.forEach(step => {
                    nodeCount++;
                    const stepStatusBorderColor = getStepStatusBorderColor(step.status);
                    const fontColor = getContrastYIQ(agentColor);
                    console.log(`[NetworkGraph] Adding node for step: ${step.id}, Verb: ${step.verb}, Status: ${step.status}, AgentColor: ${agentColor}, BorderColor: ${stepStatusBorderColor}`);

                    newNodes.add({
                        id: step.id,
                        label: `${step.verb}\n(${step.status.toUpperCase()})`,
                        color: {
                            background: agentColor,
                            border: stepStatusBorderColor,
                            highlight: {
                                background: agentColor,
                                border: stepStatusBorderColor,
                            },
                            hover: {
                                background: agentColor,
                                border: '#FFC107'
                            }
                        },
                        borderWidth: 3,
                        group: agent.id,
                        font: { color: fontColor }
                    });

                    if (step.dependencies && Array.isArray(step.dependencies)) {
                        step.dependencies.forEach(depId => {
                            if (!depId || depId === 'unknown-sourceStepId') return; // Skip invalid edges
                            console.log(`[NetworkGraph] Adding edge from ${depId} to ${step.id}`);
                            newEdges.add({
                                from: depId,
                                to: step.id,
                                arrows: 'to',
                                color: {
                                    color: agentColor,
                                    highlight: '#FFC107',
                                    hover: '#FFC107'
                                },
                                width: 2,
                                smooth: {
                                    enabled: true,
                                    type: "cubicBezier",
                                    forceDirection: "horizontal",
                                    roundness: 0.5
                                }
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

        if (nodes.length === 0) {
            if (networkRef.current) {
                networkRef.current.setData({ nodes: new DataSet<Node>(), edges: new DataSet<Edge>() });
                console.log('[NetworkGraph] No nodes to display, clearing existing network.');
            } else {
                console.log('[NetworkGraph] No nodes to display, network not initialized.');
            }
            return;
        }

        // Save current view state before update
        let prevView: {scale: number, position: {x: number, y: number}} | null = null;
        if (networkRef.current) {
            prevView = {
                scale: networkRef.current.getScale(),
                position: networkRef.current.getViewPosition()
            };
        } else if (viewStateRef.current) {
            prevView = viewStateRef.current;
        }

        const options: Options = {
            layout: {
                hierarchical: {
                    enabled: true,
                    direction: 'LR', // Left to Right
                    sortMethod: 'directed', // Follows edge direction
                    levelSeparation: 200, // Increased separation
                    nodeSpacing: 150,     // Spacing between nodes at the same level
                    treeSpacing: 250,     // Spacing between different trees (if any)
                    parentCentralization: true,
                    blockShifting: true,
                    edgeMinimization: true,
                    shakeTowards: 'roots' // or 'leaves'
                }
            },
            physics: {
                enabled: false // Hierarchical layout works best with physics disabled
            },
            interaction: {
                dragNodes: true, // Allow moving nodes
                dragView: true,
                zoomView: true,
                hover: true // Enable hover effects
            },
            nodes: {
                shape: 'box',
                margin: { top: 10, bottom: 10, left: 15, right: 15 },
                widthConstraint: {
                    minimum: 120, // Slightly wider nodes
                    maximum: 250
                },
                font: {
                    size: 12,
                    // color is now set per-node for better contrast with agent color
                },
            },
            edges: {
                smooth: { // Smoothness for hierarchical layout
                    enabled: true,
                    type: "cubicBezier",
                    forceDirection: "horizontal", // For LR layout
                    roundness: 0.5
                },
                arrows: {
                    to: { enabled: true, scaleFactor: 1 }
                },
                // color is now set per-edge
                width: 2
            },
            groups: {
                // Can define group styles here if needed, but individual styling is more flexible
            }
        };

        if (networkRef.current) {
            networkRef.current.setOptions(options);
            networkRef.current.setData({ nodes, edges }); // Update data and options
            console.log('[NetworkGraph] Network updated with new data/options.');
        } else {
            networkRef.current = new Network(containerRef.current, { nodes, edges }, options);
            console.log('[NetworkGraph] New network initialized.');
        }

        // Restore previous view state (zoom/pan)
        if (prevView && networkRef.current) {
            networkRef.current.moveTo({ scale: prevView.scale, position: prevView.position });
        }

        // Only destroy on unmount
        return () => {
            if (networkRef.current) {
                console.log('[NetworkGraph] useEffect: Cleanup on unmount. Network will be destroyed.');
                networkRef.current.destroy();
                networkRef.current = null;
            }
        };
    }, [nodes, edges]); // Re-run effect if nodes or edges datasets change

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, display: 'flex', gap: 8 }}>
                <button onClick={() => handleZoom(1.2)} title="Zoom In">＋</button>
                <button onClick={() => handleZoom(1/1.2)} title="Zoom Out">－</button>
                <button onClick={handleResetZoom} title="Reset Zoom">⟳</button>
            </div>
            <div ref={containerRef} className="network-graph" />
        </div>
    );
};