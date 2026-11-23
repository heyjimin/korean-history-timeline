import { useEffect, useMemo, useRef, useState } from 'react';
import type { Core, ElementDefinition, EventObject, StylesheetJson } from 'cytoscape';
import type { Era, HistoryEvent, RelationType } from '../data/schema.ts';
import { formatDate } from '../data/format.ts';
import { buildEgoGraph, roleLayout } from '../lib/graphData.ts';
import { eventSpan } from '../lib/timeScale.ts';
import { onThemeChange } from '../lib/theme.ts';

interface Props {
  events: HistoryEvent[];
  eras: Era[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 그래프 칸이 화면에 보이는지 (숨겨져 있을 때 크기 계산을 미룬다) */
  visible: boolean;
}

const EDGE_LABEL: Record<RelationType, string> = {
  part_of: '하위 → 상위',
  followed_by: '이어짐',
  led_to: '원인 → 결과',
  related: '관련',
};

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function stylesheet(): StylesheetJson {
  const fg = cssVar('--fg', '#1f1d1a');
  const bg = cssVar('--bg', '#fbfaf7');
  const muted = cssVar('--muted', '#6b665e');
  const accent = cssVar('--accent', '#3457c9');
  const related = cssVar('--related', '#d9822b');
  const line = cssVar('--line', '#e3dfd6');
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'font-family': '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif',
        'font-size': 11,
        color: fg,
        'text-valign': 'bottom',
        'text-margin-y': 4,
        'text-wrap': 'wrap',
        'text-max-width': '96px',
        'text-background-color': bg,
        'text-background-opacity': 0.85,
        'text-background-padding': '1px',
        width: 14,
        height: 14,
        'background-color': bg,
        'border-width': 2,
        'border-color': 'data(color)',
      },
    },
    { selector: 'node[?core]', style: { width: 18, height: 18, 'background-color': 'data(color)', 'font-weight': 'bold' } },
    { selector: 'node[depth = 2]', style: { opacity: 0.75 } },
    {
      selector: 'node[depth = 0]',
      style: { width: 26, height: 26, 'background-color': accent, 'border-color': accent, 'font-size': 13, 'font-weight': 'bold', color: accent },
    },
    { selector: 'node:active', style: { 'overlay-opacity': 0.1 } },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': line,
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': line,
        'arrow-scale': 0.9,
      },
    },
    { selector: 'edge[type = "part_of"]', style: { 'line-color': muted, 'target-arrow-color': muted, 'target-arrow-shape': 'triangle-backcurve', opacity: 0.6 } },
    { selector: 'edge[type = "followed_by"]', style: { 'line-color': accent, 'target-arrow-color': accent, width: 2 } },
    { selector: 'edge[type = "led_to"]', style: { 'line-color': related, 'target-arrow-color': related, width: 3 } },
    { selector: 'edge[type = "related"]', style: { 'line-style': 'dashed', 'line-color': muted, 'target-arrow-shape': 'none', opacity: 0.7 } },
  ];
}

export default function GraphView({ events, eras, selectedId, onSelect, visible }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [ready, setReady] = useState(false);
  const [depth, setDepth] = useState<1 | 2>(1);
  // 칸 크기가 바뀔 때마다 늘어나 배치를 다시 한다
  const [sizeKey, setSizeKey] = useState(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const eraColor = useMemo(() => new Map(eras.map((e) => [e.id, e.color])), [eras]);
  const graph = useMemo(
    () => (selectedId ? buildEgoGraph(events, selectedId, depth) : null),
    [events, selectedId, depth],
  );

  // 그래프 칸을 처음 열 때 Cytoscape를 불러온다 (다른 화면만 보는 사람은 내려받지 않는다)
  useEffect(() => {
    if (!visible || (cyRef.current && !cyRef.current.destroyed())) return;
    let disposed = false;
    import('cytoscape').then(({ default: cytoscape }) => {
      if (disposed || !elRef.current) return;
      const cy = cytoscape({
        container: elRef.current,
        style: stylesheet(),
        minZoom: 0.3,
        maxZoom: 2.5,
        boxSelectionEnabled: false,
        autoungrabify: false,
      });
      cy.on('tap', 'node', (e) => onSelectRef.current(e.target.id()));
      // 다크 모드가 바뀌면 색을 다시 읽는다
      const off = onThemeChange(() => cy.style(stylesheet()));
      cy.one('destroy', off);
      // 칸 크기가 바뀌면(탭 전환, 창 크기) 다시 맞춘다
      let timer: ReturnType<typeof setTimeout> | undefined;
      const ro = new ResizeObserver(() => {
        if (!elRef.current || elRef.current.clientWidth === 0) return;
        clearTimeout(timer);
        timer = setTimeout(() => setSizeKey((k) => k + 1), 120);
      });
      ro.observe(elRef.current);
      cy.one('destroy', () => ro.disconnect());
      cyRef.current = cy;
      setReady(true);
    });
    return () => {
      disposed = true;
    };
  }, [visible]);

  useEffect(
    () => () => {
      cyRef.current?.destroy();
      cyRef.current = null;
      setReady(false);
    },
    [],
  );

  // 그래프 그리기: 가운데 사건, 1단계, 2단계를 동심원으로 배치한다
  useEffect(() => {
    const cy = cyRef.current;
    if (!ready || !cy || cy.destroyed() || !visible || cy.width() === 0) return;
    cy.resize();
    cy.elements().remove();
    if (!graph || graph.nodes.length === 0) return;
    const elements: ElementDefinition[] = [
      ...graph.nodes.map((n) => {
        const e = byId.get(n.id)!;
        return {
          data: {
            id: n.id,
            label: e.title,
            depth: n.depth,
            core: e.importance === 'core',
            color: eraColor.get(e.era) ?? '#888888',
          },
        };
      }),
      ...graph.edges.map((ed) => ({
        data: { id: `${ed.type}:${ed.source}>${ed.target}`, source: ed.source, target: ed.target, type: ed.type },
      })),
    ];
    cy.add(elements);
    if (depth === 1 && selectedId) {
      const aspect = cy.width() / Math.max(cy.height(), 1);
      const pos = roleLayout(graph, selectedId, (id) => eventSpan(byId.get(id)!.date)[0], aspect);
      cy.layout({
        name: 'preset',
        positions: Object.fromEntries(pos),
        animate: true,
        animationDuration: 450,
        fit: true,
        padding: 40,
      }).run();
      // 노드가 적을 때 지나치게 크게 확대되지 않도록
      if (cy.zoom() > 1.1) cy.zoom({ level: 1.1, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
      cy.center();
      return;
    }
    cy.layout({
      name: 'concentric',
      concentric: (node) => 10 - Number(node.data('depth')),
      levelWidth: () => 1,
      minNodeSpacing: 70,
      spacingFactor: 1.15,
      // 1단계 고리가 가운데 사건에 너무 붙지 않도록 사건 수와 상관없이 최소 반지름을 둔다
      avoidOverlap: true,
      startAngle: (3 / 2) * Math.PI,
      animate: true,
      animationDuration: 450,
      fit: true,
      padding: 36,
    }).run();
  }, [ready, visible, graph, byId, eraColor, depth, selectedId, sizeKey]);

  // 마우스를 올리면 사건 이름과 날짜를 보여준다
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const cy = cyRef.current;
    if (!ready || !cy) return;
    const over = (e: EventObject) => {
      const p = e.target.renderedPosition();
      setHover({ id: e.target.id(), x: p.x, y: p.y });
    };
    const out = () => setHover(null);
    cy.on('mouseover', 'node', over);
    cy.on('mouseout', 'node', out);
    cy.on('pan zoom', out);
    return () => {
      cy.off('mouseover', 'node', over);
      cy.off('mouseout', 'node', out);
      cy.off('pan zoom', out);
    };
  }, [ready]);

  const hovered = hover ? byId.get(hover.id) : undefined;
  const presentTypes = new Set(graph?.edges.map((e) => e.type));

  return (
    <div className="graph-wrap">
      <div ref={elRef} className="graph" role="img" aria-label="선택한 사건의 연결 관계 그래프" />
      {!selectedId && (
        <div className="graph-empty muted">사건을 고르면 그 사건과 연결된 사건들이 그래프로 나타납니다.</div>
      )}
      {selectedId && graph && graph.nodes.length <= 1 && (
        <div className="graph-empty muted">이 사건에는 아직 연결된 사건이 없습니다.</div>
      )}
      <div className="graph-controls" role="group" aria-label="연결 단계">
        <button aria-pressed={depth === 1} onClick={() => setDepth(1)}>직접 연결</button>
        <button aria-pressed={depth === 2} onClick={() => setDepth(2)}>2단계까지</button>
      </div>
      {graph && graph.truncated > 0 && (
        <div className="graph-note muted">사건이 많아 {graph.truncated}건은 생략했습니다.</div>
      )}
      {presentTypes.size > 0 && (
        <div className="graph-legend">
          {(['part_of', 'followed_by', 'led_to', 'related'] as const)
            .filter((t) => presentTypes.has(t))
            .map((t) => (
              <span key={t}>
                <i className={`gl-${t}`} />
                {EDGE_LABEL[t]}
              </span>
            ))}
        </div>
      )}
      {hovered && hover && (
        <div className="graph-tip" style={{ left: hover.x, top: hover.y - 16 }}>
          <strong>{hovered.title}</strong>
          <span>{formatDate(hovered.date)}</span>
        </div>
      )}
    </div>
  );
}
