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

export const NetworkGraph: React.FC<NetworkGraphProps> = ({ agentStatistics }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<Network | null>(null);

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
                console.log(`[NetworkGraph] Agent ${agentIndex} ID: ${agent.id}, Color: ${agent.color}, Steps count: ${agent.steps ? agent.steps.length : 'N/A'}`);
                const agentColor = agent.color || '#999999'; // Default agent color if undefined

                if (!agent.steps || !Array.isArray(agent.steps)) {
                     console.warn(`[NetworkGraph] Agent ${agent.id} has no steps or steps is not an array:`, agent.steps);
                     return;
                }
                agent.steps.forEach(step => {
                    nodeCount++;
                    const stepStatusBorderColor = getStepStatusBorderColor(step.status);
                    console.log(`[NetworkGraph] Adding node for step: ${step.id}, Verb: ${step.verb}, Status: ${step.status}, AgentColor: ${agentColor}, BorderColor: ${stepStatusBorderColor}`);

                    newNodes.add({
                        id: step.id,
                        label: `${step.verb}\n(${step.status.toUpperCase()})`, // Status in uppercase for emphasis
                        color: {
                            background: agentColor, // Agent color for node fill
                            border: stepStatusBorderColor, // Status color for border
                            highlight: {
                                background: agentColor,
                                border: stepStatusBorderColor,
                            },
                            hover: {
                                background: agentColor,
                                border: '#FFC107' // A distinct hover border color
                            }
                        },
                        borderWidth: 3, // Make border more prominent
                        group: agent.id, // Group by agent ID for potential future use or styling
                        font: { color: '#FFFFFF' } // Assuming agent colors are generally dark, white font. Adjust if needed.
                    });

                    if (step.dependencies && Array.isArray(step.dependencies)) {
                        step.dependencies.forEach(depId => {
                            console.log(`[NetworkGraph] Adding edge from ${depId} to ${step.id}`);
                            newEdges.add({
                                from: depId,
                                to: step.id,
                                arrows: 'to',
                                color: {
                                    color: agentColor, // Edge color related to the agent of the 'to' node
                                    highlight: '#FFC107',
                                    hover: '#FFC107'
                                },
                                width: 2,
                                smooth: { // Ensure smooth edges are configured for hierarchical layout
                                    enabled: true,
                                    type: "cubicBezier",
                                    forceDirection: "horizontal", // For LR layout
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
        if (!containerRef.current ) { // If no container, do nothing.
            return;
        }

        // If no nodes, clear network or don't initialize
        if (nodes.length === 0) {
             if (networkRef.current) {
                networkRef.current.setData({ nodes: new DataSet<Node>(), edges: new DataSet<Edge>() });
                console.log('[NetworkGraph] No nodes to display, clearing existing network.');
            } else {
                console.log('[NetworkGraph] No nodes to display, network not initialized.');
            }
            return;
        }

        console.log(`[NetworkGraph] useEffect: Initializing/updating network with ${nodes.length} nodes and ${edges.length} edges.`);

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

        return () => {
            // Only destroy if component is truly unmounting.
            // If nodes/edges change, we update, we don't want to destroy and recreate.
            // However, the current structure of useEffect with [nodes, edges] dependency
            // implies that if they change, the old effect cleanup runs (destroying).
            // For this subtask, we'll keep it as is, but a more robust solution
            // might separate initialization from update.
            console.log('[NetworkGraph] useEffect: Cleanup. Current network will be destroyed if it exists.');
            networkRef.current?.destroy();
            networkRef.current = null;
        };
    }, [nodes, edges]); // Re-run effect if nodes or edges datasets change

    return <div ref={containerRef} className="network-graph" />;
};