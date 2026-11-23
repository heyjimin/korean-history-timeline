import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import 'd3-transition';
import type { Era, HistoryEvent } from '../data/schema.ts';
import { TimeScale, buildSegments, eventSpan, ticks, yearToT } from '../lib/timeScale.ts';
import { estimateLabelWidth, layoutLanes, type Placement } from '../lib/layout.ts';
import { bandBoxes, bandOf, type BandId } from '../lib/bands.ts';
import { passesFilter, type EventFilter } from '../lib/search.ts';

interface Props {
  events: HistoryEvent[];
  eras: Era[];
  selectedId: string | null;
  /** 핵심만 보기: 척도는 전체 사건 기준으로 유지하고 표시만 거른다 */
  /** 검색 필터 (핵심만·수능 빈출·분야). 척도는 전체 사건 기준으로 유지하고 표시만 거른다 */
  filter: EventFilter;
  relatedIds: Set<string>;
  /** 강조된 사건 밖은 흐리게 (사건이나 인물을 골랐을 때) */
  dimOthers: boolean;
  onSelect: (id: string) => void;
  /** 사건을 더블클릭하면 연결 관계 그래프로 바로 간다 */
  onOpenRelations?: (id: string) => void;
  /** 바뀔 때마다 해당 사건으로 화면을 옮긴다 */
  focus: { id?: string; range?: [number, number]; nonce: number; animate: boolean } | null;
  /** 화면에 보이는 기간(연속 시간 t)이 바뀔 때 */
  onViewChange?: (range: [number, number]) => void;
}

/** 맨 위 미니맵(전체 시대 개요) 높이 */
const MINI_H = 16;
const ERA_H = 28;
const AXIS_H = 24;
/** 띠마다 맨 아래에 남겨 두는 점 줄 높이 (이름을 넣을 줄이 모자란 핵심 사건) */
const BAND_DOT_H = 12;
const LANE_H = 30;
/** 다른 띠를 펼쳤을 때 접힌 띠의 높이 (이름과 점 한 줄) */
const COLLAPSED_BAND_H = 24;
const TOP = MINI_H + ERA_H + AXIS_H + 8;
/** 상세 사건이 나타나기 시작하는 확대 정도 (1년당 픽셀) */
const DETAIL_MIN_PX_PER_YEAR = 12;

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export default function Timeline({ events, eras, selectedId, filter, relatedIds, dimOthers, onSelect, onOpenRelations, focus, onViewChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const [ready, setReady] = useState(false);
  const prevViewRef = useRef<{ scale: TimeScale; w: number } | null>(null);

  /**
   * d3-zoom의 transform()은 이동 범위(translateExtent)를 지키지 않으므로 직접 맞춘다.
   * 타임라인 양 끝 밖이 비어 보이지 않게 한다.
   */
  const clampTransform = (k: number, x: number, scaleWidth: number, w: number): ZoomTransform => {
    const minX = Math.min(w - scaleWidth * k, 0);
    return zoomIdentity.translate(Math.min(Math.max(x, minX), 0), 0).scale(k);
  };

  useIsoLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const spans = useMemo(() => new Map(events.map((e) => [e.id, eventSpan(e.date)])), [events]);
  const segments = useMemo(
    () => buildSegments(eras, events.map((e) => spans.get(e.id)![0])),
    [eras, events, spans],
  );
  const scale = useMemo(() => {
    const total = segments.reduce((s, x) => s + x.units, 0);
    return new TimeScale(segments, size.w > 0 ? size.w / total : 1);
  }, [segments, size.w]);

  // 사건이 있는 구간에서 1년이 약 3000px이 될 때까지 확대할 수 있게 한다 (월 단위 구분)
  const maxK = useMemo(() => {
    let k = 1;
    for (const s of segments) {
      const has = events.some((e) => {
        const t = spans.get(e.id)![0];
        return t >= s.start && t < s.end;
      });
      if (has) k = Math.max(k, 3000 / scale.pxPerYear(s));
    }
    return k;
  }, [segments, events, spans, scale]);

  // 확대·이동 (마우스 휠·드래그, 터치 핀치)
  useEffect(() => {
    const el = ref.current;
    if (!el || size.w === 0) return;
    const z = d3zoom<HTMLDivElement, unknown>()
      .scaleExtent([1, maxK])
      .extent([[0, 0], [size.w, size.h]])
      .translateExtent([[0, 0], [scale.width, size.h]])
      // 가로 스크롤(트랙패드 좌우 밀기)은 확대가 아니라 이동으로 처리한다
      .filter((e: Event) => {
        const target = e.target as Element | null;
        if (target?.closest?.('.tl-mini, .tl-band-labels')) return false;
        if (e.type === 'wheel' && !(e as WheelEvent).ctrlKey) {
          const box = target?.closest?.('.tl-band-scroll');
          if (box && box.scrollHeight > box.clientHeight && Math.abs((e as WheelEvent).deltaY) > Math.abs((e as WheelEvent).deltaX)) return false;
        }
        if (e.type === 'wheel') {
          const w = e as WheelEvent;
          return w.ctrlKey || Math.abs(w.deltaY) >= Math.abs(w.deltaX);
        }
        return !(e as MouseEvent).button;
      })
      .on('zoom', (e) => setTransform(e.transform));
    const sel = select(el);
    sel.call(z).on('dblclick.zoom', null);
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        z.translateBy(sel, -e.deltaX / transformRef.current.k, 0);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    zoomRef.current = z;
    setReady(true);
    // 크기나 척도가 바뀌어도 화면 가운데에 있던 시점을 그대로 가운데에 둔다
    const prev = prevViewRef.current;
    const cur = transformRef.current;
    let next = cur;
    if (prev && (prev.scale !== scale || prev.w !== size.w)) {
      const centerT = prev.scale.invert((prev.w / 2 - cur.x) / cur.k);
      next = zoomIdentity.translate(size.w / 2 - scale.x(centerT) * cur.k, 0).scale(cur.k);
    }
    next = clampTransform(Math.min(Math.max(next.k, 1), maxK), next.x, scale.width, size.w);
    prevViewRef.current = { scale, w: size.w };
    z.transform(sel, next);
    return () => {
      el.removeEventListener('wheel', onWheel);
      sel.on('.zoom', null);
    };
  }, [size.w, size.h, scale, maxK]);

  // 사건으로 화면 옮기기
  // 타임라인이 숨겨져 있으면(좁은 화면에서 지도·관계 보기, 너비 0) 계산이 틀어지므로
  // 다시 보일 때까지 미뤘다가 그때 한 번 적용한다
  const appliedNonceRef = useRef<number | null>(null);
  // 직전 렌더의 너비 (숨겨졌다가 다시 보일 때는 애니메이션 없이 바로 옮긴다)
  const prevFocusWidthRef = useRef(size.w);
  useEffect(() => {
    const el = ref.current;
    const z = zoomRef.current;
    if (!focus || !el || !z || !ready || size.w === 0) return;
    if (appliedNonceRef.current === focus.nonce) return;
    const deferred = prevFocusWidthRef.current === 0;
    appliedNonceRef.current = focus.nonce;
    const animate = focus.animate && !deferred;
    // 기간으로 맞추기 (인물의 사건이 걸친 기간 등)
    if (focus.range) {
      const x0 = scale.x(focus.range[0]);
      const x1 = scale.x(focus.range[1]);
      const k = Math.min(Math.max((size.w * 0.96) / Math.max(x1 - x0, 1), 1), maxK);
      const t = clampTransform(k, size.w * 0.02 - x0 * k, scale.width, size.w);
      const sel = select(el);
      if (animate) sel.transition().duration(650).call(z.transform, t);
      else sel.call(z.transform, t);
      return;
    }
    const span = focus.id ? spans.get(focus.id) : undefined;
    if (!span) return;
    const [s, e] = span;
    const seg = scale.segmentAt(s);
    const duration = Math.max(e - s, 0.5);
    const wantPxPerYear = Math.min(Math.max((size.w * 0.35) / duration, 40), 1500);
    const k = Math.min(Math.max(wantPxPerYear / scale.pxPerYear(seg), 1), maxK);
    const center = scale.x((s + e) / 2) * k;
    const t = clampTransform(k, size.w / 2 - center, scale.width, size.w);
    const sel = select(el);
    if (animate) sel.transition().duration(650).call(z.transform, t);
    else sel.call(z.transform, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, ready, size.w]);
  useEffect(() => {
    prevFocusWidthRef.current = size.w;
  });

  useEffect(() => {
    if (!onViewChange || size.w === 0) return;
    const { k, x } = transform;
    onViewChange([scale.invert(-x / k), scale.invert((size.w - x) / k)]);
  }, [transform, scale, size.w, onViewChange]);

  // 미니맵을 누르거나 끌면 그 위치가 화면 가운데에 오도록 옮긴다 (확대 배율은 그대로)
  const miniJump = (x: number, animate: boolean) => {
    if (!ref.current || !zoomRef.current) return;
    const sel = select(ref.current);
    const worldX = Math.min(Math.max(x, 0), scale.width);
    if (animate) sel.transition().duration(300).call(zoomRef.current.translateTo, worldX, size.h / 2);
    else sel.call(zoomRef.current.translateTo, worldX, size.h / 2);
  };

  const zoomBy = (factor: number) => {
    if (ref.current && zoomRef.current) select(ref.current).transition().duration(250).call(zoomRef.current.scaleBy, factor);
  };
  const fitRange = (t0: number, t1: number) => {
    if (!ref.current || !zoomRef.current) return;
    const x0 = scale.x(t0);
    const x1 = scale.x(t1);
    const k = Math.min(Math.max((size.w * 0.96) / (x1 - x0), 1), maxK);
    const t = clampTransform(k, size.w * 0.02 - x0 * k, scale.width, size.w);
    select(ref.current).transition().duration(500).call(zoomRef.current.transform, t);
  };

  const { k, x: tx } = transform;
  const toScreen = (t: number) => scale.x(t) * k + tx;

  const items = useMemo(() => {
    if (size.w === 0) return [];
    const margin = 400;
    return events
      // 1년이 DETAIL_MIN_PX_PER_YEAR 픽셀보다 좁게 보일 만큼 축소했으면 상세 사건은 숨긴다
      .filter((e) => {
        if (!passesFilter(e, filter, selectedId)) return false;
        if (e.importance === 'core' || e.id === selectedId) return true;
        const seg = scale.segmentAt(spans.get(e.id)![0]);
        return scale.pxPerYear(seg) * k >= DETAIL_MIN_PX_PER_YEAR;
      })
      .map((e) => {
        const [s, en] = spans.get(e.id)!;
        const x0 = toScreen(s);
        const x1 = toScreen(en);
        return {
          id: e.id,
          // 선택한 사건은 상세 사건이어도 핵심처럼 먼저 자리를 잡는다
          core: e.importance === 'core' || e.id === selectedId,
          band: bandOf(e),
          // 왼쪽 밖에서 시작하는 기간 사건은 이름이 왼쪽 끝에 붙으므로 그 자리로 계산한다 (renderEvent와 같은 규칙)
          x0: x0 < 4 && x1 > 80 ? 4 : x0,
          x1,
          labelWidth: estimateLabelWidth(e.title),
        };
      })
      .filter((i) => i.x1 > -margin && i.x0 < size.w + margin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, spans, scale, k, tx, size.w, selectedId, filter]);

  // 세로축: 분야별 띠 (정치·제도 / 전쟁·외교 / 경제·사회 / 문화).
  // 띠마다 필요한 높이(이름을 다 놓는 줄 수)만큼 나누되, 확대·이동하는 동안에는 높이를 고정하고
  // 멈춘 뒤에만 바꾼다 (움직일 때마다 사건이 위아래로 튀지 않도록).
  const liveDemand = useMemo(() => {
    // 띠마다 화면에 보이는 사건의 이름을 모두 놓는 데 필요한 높이
    const need: Partial<Record<BandId, number>> = {};
    const visible = items.filter((i) => i.x1 > 0 && i.x0 < size.w);
    for (const band of new Set(visible.map((i) => i.band))) {
      const placed = layoutLanes(visible.filter((i) => i.band === band), 500);
      const lanes = placed.reduce((m, p) => (p.mode === 'full' ? Math.max(m, p.lane + 1) : m), 0);
      need[band] = lanes * LANE_H + BAND_DOT_H + 8;
    }
    return JSON.stringify(need);
  }, [items, size.w]);
  const [settledDemand, setSettledDemand] = useState('{}');
  useEffect(() => {
    const t = setTimeout(() => setSettledDemand(liveDemand), 350);
    return () => clearTimeout(t);
  }, [liveDemand]);
  const demandKey = settledDemand === '{}' ? liveDemand : settledDemand;
  // 띠 펼쳐보기: 한 띠를 펼치면 그 띠에 보이는 사건 이름을 모두(줄 수 제한 없이) 보여 주고,
  // 나머지 띠는 이름 없이 점 한 줄로 접는다. 펼친 띠가 넘치면 그 안에서 위아래로 스크롤한다.
  const [expandedBand, setExpandedBand] = useState<BandId | null>(null);
  const shownBands = filter.bands;
  const expanded = expandedBand && (shownBands.length === 0 || shownBands.includes(expandedBand)) ? expandedBand : null;

  const boxes = useMemo(() => {
    if (size.w === 0) return [];
    const top = TOP - 6;
    const height = Math.max(size.h - TOP, 0);
    const normal = bandBoxes(top, height, JSON.parse(demandKey), LANE_H + 6, shownBands);
    if (!expanded) return normal;
    const collapsedTotal = COLLAPSED_BAND_H * (normal.length - 1);
    let y = top;
    return normal.map((b) => {
      const h = b.id === expanded ? Math.max(height - collapsedTotal, LANE_H * 2) : COLLAPSED_BAND_H;
      const box = { ...b, top: y, height: h };
      y += h;
      return box;
    });
  }, [demandKey, size.w, size.h, shownBands, expanded]);

  const placements = useMemo(() => {
    const out: (Placement & { band: BandId })[] = [];
    for (const box of boxes) {
      const lanes =
        expanded === null
          ? Math.max(1, Math.floor((box.height - BAND_DOT_H - 4) / LANE_H))
          : box.id === expanded
            ? 500 // 사실상 제한 없음: 모든 사건이 이름과 함께 놓인다
            : 0; // 접힌 띠: 핵심 사건은 점으로만, 상세 사건은 숨긴다
      for (const p of layoutLanes(items.filter((i) => i.band === box.id), lanes)) out.push({ ...p, band: box.id });
    }
    return out;
  }, [items, boxes, expanded]);
  const expandedLanes = useMemo(
    () => placements.reduce((m, p) => (p.band === expanded && p.mode === 'full' ? Math.max(m, p.lane + 1) : m), 0),
    [placements, expanded],
  );
  const boxById = new Map(boxes.map((b) => [b.id, b]));

  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const tickList = size.w > 0 ? ticks(scale, k, -tx / k, (size.w - tx) / k) : [];
  const hasSelection = dimOthers;
  const now = new Date().getFullYear();

  /** 사건 하나를 그린다. top: 줄 0의 위치 (펼친 띠는 스크롤 상자 기준) */
  function renderEvent(p: Placement & { band: BandId }, laneTop: number) {
    const e = byId.get(p.id)!;
    const box = boxById.get(p.band)!;
    const [s, en] = spans.get(p.id)!;
    const x0 = toScreen(s);
    const barW = Math.max(toScreen(en) - x0, 0);
    const cls = [
      'tl-event',
      e.importance === 'core' ? 'core' : 'detail',
      p.id === selectedId ? 'selected' : '',
      relatedIds.has(p.id) ? 'related' : '',
      hasSelection && p.id !== selectedId && !relatedIds.has(p.id) ? 'dim' : '',
    ].join(' ');
    if (p.mode === 'dot') {
      return (
        <button
          key={p.id}
          className={`${cls} dot-only`}
          style={{ left: x0 - 5, top: box.top + box.height - BAND_DOT_H }}
          onClick={() => onSelect(p.id)}
          onDoubleClick={() => onOpenRelations?.(p.id)}
          title={`${e.title} (더블클릭: 연결 관계 보기)`}
          aria-label={e.title}
        />
      );
    }
    // 기간 사건이 왼쪽 화면 밖에서 시작하면 이름을 왼쪽 끝에 붙여 둔다
    const clipped = x0 < 4 && x0 + barW > 80;
    const top = laneTop + p.lane * LANE_H;
    return (
      <div key={p.id}>
        {barW > 8 && <span className={`tl-bar ${cls}`} style={{ left: x0, top: top + 9, width: barW }} />}
        <button
          className={`${cls} ${clipped ? 'clipped' : ''}`}
          style={{ left: clipped ? 4 : x0 - 5, top }}
          onClick={() => onSelect(p.id)}
          onDoubleClick={() => onOpenRelations?.(p.id)}
          aria-pressed={p.id === selectedId}
          title="더블클릭하면 연결 관계 그래프로 이동합니다"
        >
          <span className="tl-dot" />
          <span className="tl-label">{e.title}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="timeline" ref={ref} aria-label="한국사 타임라인. 휠이나 두 손가락으로 확대하고 끌어서 이동합니다.">
      {size.w > 0 && (
        <>
          <div
            className="tl-mini"
            role="slider"
            aria-label="전체 시대에서 지금 보는 위치. 누르거나 끌어서 이동합니다."
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((((-tx / k) + size.w / k / 2) / scale.width) * 100)}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              miniJump(e.clientX - e.currentTarget.getBoundingClientRect().left, true);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                miniJump(e.clientX - e.currentTarget.getBoundingClientRect().left, false);
              }
            }}
          >
            {eras.map((era) => {
              const x0 = scale.x(yearToT(era.start));
              const x1 = scale.x(yearToT(era.end ?? now + 1));
              return <span key={era.id} className="tl-mini-era" style={{ left: x0, width: Math.max(x1 - x0, 1), background: era.color }} />;
            })}
            <span
              className="tl-mini-view"
              style={{ left: Math.max(-tx / k, 0), width: Math.max(Math.min(size.w / k, size.w), 6) }}
            />
          </div>
          <div className="tl-eras">
            {eras.map((era) => {
              const t0 = yearToT(era.start);
              const t1 = yearToT(era.end ?? now + 1);
              const x0 = toScreen(t0);
              const x1 = toScreen(t1);
              if (x1 < 0 || x0 > size.w) return null;
              const left = Math.max(x0, 0);
              const width = Math.min(x1, size.w) - left;
              return (
                <button
                  key={era.id}
                  className="tl-era"
                  style={{ left, width, background: era.color }}
                  onClick={() => fitRange(t0, t1)}
                  title={`${era.name}로 확대`}
                >
                  {width > 40 && <span>{era.name}</span>}
                </button>
              );
            })}
          </div>
          <div className="tl-axis">
            {tickList.map((tk) => (
              <div key={tk.t} className="tl-tick" style={{ left: toScreen(tk.t) }}>
                {tk.label}
              </div>
            ))}
          </div>
          <div className="tl-bands" aria-hidden="true">
            {boxes.map((b, i) => (
              <div key={b.id} className={`tl-band ${i % 2 ? 'alt' : ''}`} style={{ top: b.top, height: b.height }} />
            ))}
          </div>
          {placements.filter((p) => p.band !== expanded).map((p) => renderEvent(p, boxById.get(p.band)!.top + 4))}
          {expanded && boxById.get(expanded) && (
            <div
              className="tl-band-scroll"
              style={{ top: boxById.get(expanded)!.top, height: boxById.get(expanded)!.height }}
            >
              <div style={{ height: expandedLanes * LANE_H + 12 }} />
              {placements.filter((p) => p.band === expanded).map((p) => renderEvent(p, 4))}
            </div>
          )}
          {/* 띠 이름은 사건 위에 보이도록 마지막에 그린다 */}
          <div className="tl-band-labels">
            {boxes.map((b) => (
              <button
                key={b.id}
                className={`tl-band-label ${b.id === expanded ? 'expanded' : ''}`}
                style={{ top: b.top }}
                onClick={() => setExpandedBand(b.id === expanded ? null : b.id)}
                aria-pressed={b.id === expanded}
                title={b.id === expanded ? '원래대로 접기' : `${b.label} 사건 이름을 모두 펼쳐 보기`}
              >
                {b.label}
                <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  {b.id === expanded ? <path d="M3 7.5 6 4.5l3 3" /> : <path d="M3 4.5 6 7.5l3-3" />}
                </svg>
              </button>
            ))}
          </div>
          <div className="tl-controls">
            <button onClick={() => zoomBy(2)} aria-label="확대">＋</button>
            <button onClick={() => zoomBy(0.5)} aria-label="축소">－</button>
            <button onClick={() => fitRange(scale.domain[0], scale.domain[1])}>전체</button>
          </div>
        </>
      )}
    </div>
  );
}
