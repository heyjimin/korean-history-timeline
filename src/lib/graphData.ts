import type { HistoryEvent, RelationType } from '../data/schema.ts';

/**
 * 선택한 사건을 가운데에 두고 관계를 따라 depth 단계까지 이웃을 모은다 (방향 무시).
 * 사건이 많아져도 그래프가 읽히도록 maxNodes를 넘으면 가까운 사건부터 남긴다.
 */

export interface GraphNode {
  id: string;
  depth: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: RelationType;
}

export interface EgoGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** maxNodes 때문에 빠진 사건 수 */
  truncated: number;
}

export function buildEgoGraph(events: HistoryEvent[], centerId: string, depth: number, maxNodes = 40): EgoGraph {
  const ids = new Set(events.map((e) => e.id));
  if (!ids.has(centerId)) return { nodes: [], edges: [], truncated: 0 };

  // 모든 관계를 한 번 모아 둔다 (없는 사건을 가리키는 관계는 버린다)
  const allEdges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    for (const r of e.relations) {
      if (!ids.has(r.target)) continue;
      // related는 방향이 없으므로 양쪽에서 적어도 하나로 친다
      const key = r.type === 'related' ? `related:${[e.id, r.target].sort().join('|')}` : `${r.type}:${e.id}>${r.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allEdges.push({ source: e.id, target: r.target, type: r.type });
    }
  }
  const neighbors = new Map<string, string[]>();
  for (const ed of allEdges) {
    (neighbors.get(ed.source) ?? neighbors.set(ed.source, []).get(ed.source)!).push(ed.target);
    (neighbors.get(ed.target) ?? neighbors.set(ed.target, []).get(ed.target)!).push(ed.source);
  }

  // 너비 우선 탐색
  const depthOf = new Map<string, number>([[centerId, 0]]);
  let frontier = [centerId];
  for (let d = 1; d <= depth && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of neighbors.get(id) ?? []) {
        if (depthOf.has(n)) continue;
        depthOf.set(n, d);
        next.push(n);
      }
    }
    frontier = next;
  }

  let nodes = [...depthOf].map(([id, d]) => ({ id, depth: d }));
  let truncated = 0;
  if (nodes.length > maxNodes) {
    // 가까운 단계 우선, 같은 단계에서는 핵심 사건 우선
    const core = new Set(events.filter((e) => e.importance === 'core').map((e) => e.id));
    nodes.sort((a, b) => a.depth - b.depth || Number(core.has(b.id)) - Number(core.has(a.id)));
    truncated = nodes.length - maxNodes;
    nodes = nodes.slice(0, maxNodes);
  }
  const kept = new Set(nodes.map((n) => n.id));
  const edges = allEdges.filter((e) => kept.has(e.source) && kept.has(e.target));
  return { nodes, edges, truncated };
}

export interface Position {
  x: number;
  y: number;
}

/**
 * 직접 연결(1단계) 그래프를 "역할"에 따라 배치한다.
 *   위: 상위 사건과 관련 사건 / 왼쪽: 원인·앞선 사건 / 오른쪽: 결과·이어지는 사건 / 아래: 하위 사건(시간순 격자)
 * 동심원보다 읽기 쉽고, 하위 사건이 많아도 격자로 늘어나 글자가 작아지지 않는다.
 */
export function roleLayout(
  graph: EgoGraph,
  centerId: string,
  timeOf: (id: string) => number,
  /** 그래프 칸의 가로/세로 비율. 넓은 칸이면 하위 사건 격자를 가로로 늘린다 */
  aspect = 1.6,
): Map<string, Position> {
  const COL = 130;
  const ROW = 64;
  const role = new Map<string, 'top' | 'left' | 'right' | 'bottom'>();
  for (const e of graph.edges) {
    // 가운데 사건과 직접 이어진 관계만 역할을 정한다 (이웃끼리의 관계는 선만 그린다)
    if (e.source !== centerId && e.target !== centerId) continue;
    const out = e.source === centerId;
    const other = out ? e.target : e.source;
    if (other === centerId || role.has(other)) continue;
    if (e.type === 'part_of') role.set(other, out ? 'top' : 'bottom');
    else if (e.type === 'related') role.set(other, 'top');
    else role.set(other, out ? 'right' : 'left');
  }
  const pos = new Map<string, Position>([[centerId, { x: 0, y: 0 }]]);
  const group = (r: string) =>
    [...role].filter(([, v]) => v === r).map(([id]) => id).sort((a, b) => timeOf(a) - timeOf(b));

  const top = group('top');
  top.forEach((id, i) => pos.set(id, { x: (i - (top.length - 1) / 2) * COL, y: -ROW * 1.6 }));
  const left = group('left');
  left.forEach((id, i) => pos.set(id, { x: -COL * 1.4, y: (i - (left.length - 1) / 2) * ROW }));
  const right = group('right');
  right.forEach((id, i) => pos.set(id, { x: COL * 1.4, y: (i - (right.length - 1) / 2) * ROW }));
  const bottom = group('bottom');
  // 격자 전체의 가로/세로 비율(cols·COL : rows·ROW)이 칸 비율과 비슷해지는 열 수
  const cols = Math.max(1, Math.min(10, Math.ceil(Math.sqrt((bottom.length * aspect * ROW) / COL))));
  bottom.forEach((id, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, bottom.length - row * cols);
    pos.set(id, { x: ((i % cols) - (inRow - 1) / 2) * COL, y: ROW * 1.8 + row * ROW });
  });
  return pos;
}
