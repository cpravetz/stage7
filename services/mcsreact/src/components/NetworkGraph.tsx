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
        const statsMap = MapSerializer.transformFromSerialization(agentStatistics);

        if (!statsMap?.values) {
            console.error('Invalid agentStatistics data');
            return { nodes: new DataSet<Node>(), edges: new DataSet<Edge>() };
        }

        const nodes = new DataSet<Node>(
            Array.from(statsMap.values() as Iterable<AgentStatistics[]>)
                .flat()
                .flatMap((agent: AgentStatistics) => 
                    agent.steps.map(step => ({
                        id: step.id,
                        label: `${step.verb}\n(${step.status})`,
                        color: {
                            background: getStatusColor(step.status),
                            border: agent.color
                        },
                        borderWidth: 2,
                        group: agent.id
                    }))
                )
        );

        const edges = new DataSet<Edge>(
            Array.from(statsMap.values() as Iterable<AgentStatistics[]>)
                .flat()
                .flatMap((agent: AgentStatistics) =>
                    agent.steps.flatMap(step =>
                        step.dependencies.map(depId => ({
                            from: depId,
                            to: step.id,
                            arrows: 'to',
                            color: agent.color,
                            width: 2
                        }))
                    )
                )
        );

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