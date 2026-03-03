/**
 * TaskGraph —— D3 力导向图，展示任务依赖关系
 *
 * 功能：
 * - 节点大小由 importance/urgency/bounty 决定
 * - 模式切换：综合 / 重要 / 紧急 / 赏金
 * - 拖拽节点（带弹性关联）
 * - 悬停高亮连接线
 * - 双击节点打开任务编辑
 */

import { useRef, useEffect, useState, useCallback, memo } from 'react';
import * as d3 from 'd3';
import type { Task, TaskPriority } from '../types';

// ============================================================
// 类型
// ============================================================

type GraphMode = 'combined' | 'importance' | 'urgency' | 'bounty';

interface GraphNode extends d3.SimulationNodeDatum {
  id: number;
  name: string;
  completed: boolean;
  prerequisites: number[];
  importance: number;
  urgency: number;
  bounty: number;
  radius: number;
  _relatedOffsets?: Record<number, { dx: number; dy: number }>;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: GraphNode | number;
  target: GraphNode | number;
}

interface TaskGraphProps {
  tasks: Task[];
  onEditTask?: (taskId: number) => void;
}

// ============================================================
// 辅助函数
// ============================================================

function parsePriority(p: TaskPriority | string | null): { importance: number; urgency: number } {
  if (!p) return { importance: 0, urgency: 0 };
  if (typeof p === 'object') return { importance: p.importance ?? 0, urgency: p.urgency ?? 0 };
  try {
    const parsed = JSON.parse(p) as TaskPriority;
    return { importance: parsed.importance ?? 0, urgency: parsed.urgency ?? 0 };
  } catch {
    return { importance: 0, urgency: 0 };
  }
}

function truncateName(name: string, maxLen: number): string {
  if (!name) return '';
  return name.length > maxLen ? name.substring(0, maxLen) + '..' : name;
}

function mapValueToMultiplier(value: number): number {
  if (value === 0) return 1;
  return value > 0 ? 1 + value : 1 + value * 0.5;
}

function mapBountyToMultiplier(bounty: number): number {
  const clamped = Math.min(Math.max(bounty || 0, 0), 200);
  if (clamped === 0) return 1;
  return 0.5 + (clamped / 200) * 1.5;
}

function calculateNodeRadius(task: { importance: number; urgency: number; bounty: number }, mode: GraphMode): number {
  const baseRadius = 20;
  const impMult = mapValueToMultiplier(task.importance);
  const urgMult = mapValueToMultiplier(task.urgency);
  const bountyMult = mapBountyToMultiplier(task.bounty);

  let multiplier: number;
  switch (mode) {
    case 'importance': multiplier = impMult; break;
    case 'urgency': multiplier = urgMult; break;
    case 'bounty': multiplier = bountyMult; break;
    default: multiplier = Math.pow(impMult * urgMult * bountyMult, 1 / 3); break;
  }
  return baseRadius * multiplier;
}

// ============================================================
// 组件
// ============================================================

export const TaskGraph = memo(function TaskGraph({ tasks, onEditTask }: TaskGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const [mode, setMode] = useState<GraphMode>('combined');

  const handleModeChange = useCallback((m: GraphMode) => {
    setMode(m);
  }, []);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    if (!tasks || tasks.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 300;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    // 构建节点
    const nodes: GraphNode[] = tasks.map((task) => {
      const { importance, urgency } = parsePriority(task.priority);
      const taskData = { importance, urgency, bounty: task.bounty ?? 0 };
      return {
        id: task.id,
        name: task.name,
        completed: task.completed,
        prerequisites: (task.prerequisites ?? []) as number[],
        importance,
        urgency,
        bounty: task.bounty ?? 0,
        radius: calculateNodeRadius(taskData, mode),
      };
    });

    // 构建连接
    const links: GraphLink[] = [];
    for (const task of tasks) {
      if (task.prerequisites && Array.isArray(task.prerequisites)) {
        for (const prereqId of task.prerequisites) {
          const pid = typeof prereqId === 'number' ? prereqId : Number(prereqId);
          if (nodes.find((n) => n.id === pid)) {
            links.push({ source: pid, target: task.id });
          }
        }
      }
    }

    // 箭头标记
    svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 0)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'rgba(102, 255, 204, 0.6)');

    // 力模拟
    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(80).strength(0.5),
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<GraphNode>().radius((d) => d.radius + 5));

    simulationRef.current = simulation;

    // 连接线
    const link = svg
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('class', 'task-link')
      .attr('marker-end', 'url(#arrowhead)');

    // 节点组
    const node = svg
      .append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', (d) => `task-node ${d.completed ? 'completed' : ''}`)
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on('start', function (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
            d3.select(this).classed('dragging', true);

            // 记录关联节点偏移
            const relatedIds = getRelatedNodeIds(d.id, nodes);
            d._relatedOffsets = {};
            for (const rn of simulation.nodes()) {
              if (relatedIds.has(rn.id) && rn.id !== d.id) {
                d._relatedOffsets[rn.id] = {
                  dx: (rn.x ?? 0) - (d.x ?? 0),
                  dy: (rn.y ?? 0) - (d.y ?? 0),
                };
              }
            }
          })
          .on('drag', (_event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d) => {
            d.fx = _event.x;
            d.fy = _event.y;

            if (d._relatedOffsets) {
              const elasticity = 0.3;
              for (const [idStr, offset] of Object.entries(d._relatedOffsets)) {
                const rn = simulation.nodes().find((n) => n.id === parseInt(idStr, 10));
                if (rn) {
                  rn.fx = (rn.x ?? 0) + ((_event.x + offset.dx) - (rn.x ?? 0)) * elasticity;
                  rn.fy = (rn.y ?? 0) + ((_event.y + offset.dy) - (rn.y ?? 0)) * elasticity;
                }
              }
            }
          })
          .on('end', function (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
            d3.select(this).classed('dragging', false);

            if (d._relatedOffsets) {
              for (const idStr of Object.keys(d._relatedOffsets)) {
                const rn = simulation.nodes().find((n) => n.id === parseInt(idStr, 10));
                if (rn) {
                  rn.fx = null;
                  rn.fy = null;
                }
              }
              delete d._relatedOffsets;
            }
          }),
      );

    node.append('circle').attr('r', (d) => d.radius);
    node.append('text').attr('dy', 4).text((d) => truncateName(d.name, 6));
    node.append('title').text((d) => d.name);

    // tick
    simulation.on('tick', () => {
      for (const d of nodes) {
        d.x = Math.max(d.radius, Math.min(width - d.radius, d.x ?? 0));
        d.y = Math.max(d.radius, Math.min(height - d.radius, d.y ?? 0));
      }

      link
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => {
          const s = d.source as GraphNode;
          const t = d.target as GraphNode;
          const dx = (t.x ?? 0) - (s.x ?? 0);
          const dy = (t.y ?? 0) - (s.y ?? 0);
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist === 0) return t.x ?? 0;
          return (t.x ?? 0) - (dx / dist) * (t.radius + 5);
        })
        .attr('y2', (d) => {
          const s = d.source as GraphNode;
          const t = d.target as GraphNode;
          const dx = (t.x ?? 0) - (s.x ?? 0);
          const dy = (t.y ?? 0) - (s.y ?? 0);
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist === 0) return t.y ?? 0;
          return (t.y ?? 0) - (dy / dist) * (t.radius + 5);
        });

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // 悬停高亮
    node
      .on('mouseenter', (_event, d) => {
        link.classed('highlighted', (l) => {
          const sId = (l.source as GraphNode).id;
          const tId = (l.target as GraphNode).id;
          return sId === d.id || tId === d.id;
        });
      })
      .on('mouseleave', () => {
        link.classed('highlighted', false);
      });

    // 双击编辑
    node.on('dblclick', (_event, d) => {
      _event.stopPropagation();
      onEditTask?.(d.id);
    });

    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [tasks, mode, onEditTask]);

  if (!tasks || tasks.length === 0) {
    return (
      <div className="task-graph-container">
        <div className="task-graph-header">
          <h3 className="task-graph-title">任务关系图</h3>
        </div>
        <div className="task-graph">
          <div className="task-graph-empty">暂无任务</div>
        </div>
      </div>
    );
  }

  return (
    <div className="task-graph-container">
      <div className="task-graph-header">
        <h3 className="task-graph-title">任务关系图</h3>
        <div className="task-graph-mode-buttons">
          {MODES.map((m) => (
            <button
              key={m.key}
              className={`task-graph-mode-btn ${mode === m.key ? 'active' : ''}`}
              onClick={() => handleModeChange(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="task-graph" ref={containerRef}>
        <svg ref={svgRef} className="task-graph-svg" />
      </div>
    </div>
  );
});

const MODES: { key: GraphMode; label: string }[] = [
  { key: 'combined', label: '综合' },
  { key: 'importance', label: '重要' },
  { key: 'urgency', label: '紧急' },
  { key: 'bounty', label: '赏金' },
];

function getRelatedNodeIds(nodeId: number, nodes: GraphNode[]): Set<number> {
  const related = new Set<number>();
  for (const node of nodes) {
    if (node.id === nodeId && node.prerequisites) {
      for (const id of node.prerequisites) related.add(id);
    }
    if (node.prerequisites?.includes(nodeId)) {
      related.add(node.id);
    }
  }
  return related;
}
