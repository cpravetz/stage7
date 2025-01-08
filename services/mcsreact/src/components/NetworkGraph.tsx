import React, { useEffect, useRef, useMemo } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { Edge, Node, Options } from 'vis-network';
import { MapSerializer, AgentStatistics } from '@cktmcs/shared';
import './NetworkGraph.css';

interface NetworkGraphProps {
    agentStatistics: Map<string, Array<AgentStatistics>>;
}

const getStatusColor = (status: string): string => {
    switch (status) {
        case 'pending': return '#ffffff';
        case 'running': return '#fff7e6';
        case 'completed': return '#e6ffe6';
        case 'error': return '#ffe6e6';
        default: return '#f2f2f2';
    }
};

export const NetworkGraph: React.FC<NetworkGraphProps> = ({ agentStatistics }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<Network | null>(null);

    const { nodes, edges } = useMemo(() => {
        let statsMap;
        if (agentStatistics instanceof Map) {
            statsMap = agentStatistics;
        } else {
            statsMap = MapSerializer.transformFromSerialization(agentStatistics);
        }

        if (!statsMap || typeof statsMap.get !== 'function') {
            console.error('Invalid agentStatistics data', statsMap);
            return { nodes: new DataSet<Node>(), edges: new DataSet<Edge>() };
        }

        const nodes = new DataSet<Node>();
        const edges = new DataSet<Edge>();

        for (const [status, agents] of statsMap.entries()) {
            agents.forEach((agent: AgentStatistics) => {
                agent.steps.forEach(step => {
                    nodes.add({
                        id: step.id,
                        label: `${step.verb}\n(${step.status})`,
                        color: {
                            background: getStatusColor(step.status),
                            border: agent.color
                        },
                        borderWidth: 2,
                        group: agent.id
                    });

                    step.dependencies.forEach(depId => {
                        edges.add({
                            from: depId,
                            to: step.id,
                            arrows: 'to',
                            color: agent.color,
                            width: 2
                        });
                    });
                });
            });
        }

        return { nodes, edges };
    }, [agentStatistics]);

    useEffect(() => {
        if (!containerRef.current) return;

        const options: Options = {
            layout: {
                improvedLayout: true,
                hierarchical: {
                    enabled: false,
                    direction: 'LR',
                    sortMethod: 'directed',
                    levelSeparation: 150,
                    nodeSpacing: 200,
                    treeSpacing: 200,
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
                zoomView: true
            },
            nodes: {
                shape: 'box',
                margin: {top: 10, bottom:10, left: 10, right: 10},
                widthConstraint: {
                    minimum: 100,
                    maximum: 200
                }
            },
            edges: {
                smooth: {
                    type: 'cubicBezier',
                    forceDirection: 'horizontal',
                    roundness: 0.5,
                    enabled: true
                }
            },
            groups: {}
        };

        networkRef.current = new Network(
            containerRef.current,
            { nodes, edges },
            options
        );

        return () => {
            networkRef.current?.destroy();
        };
    }, [nodes, edges]);

    return <div ref={containerRef} className="network-graph" />;
};