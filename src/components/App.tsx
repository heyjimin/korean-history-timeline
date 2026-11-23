import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Era, HistoryEvent, Person, Place } from '../data/schema.ts';
import { eventSpan } from '../lib/timeScale.ts';
import { linksOf } from '../data/relations.ts';
import Timeline from './Timeline.tsx';
import DetailPanel from './DetailPanel.tsx';
import MapView from './MapView.tsx';
import GraphView from './GraphView.tsx';
import ErrorBoundary from './ErrorBoundary.tsx';
import SearchBox from './SearchBox.tsx';
import FilterMenu from './FilterMenu.tsx';
import { EMPTY_FILTER, passesFilter, type EventFilter } from '../lib/search.ts';
// Pretendard 가변 글꼴 (필요한 글자 묶음만 내려받는 분할 버전)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '../styles/app.css';
import { SITE } from '../site.ts';
import Logo from './Logo.tsx';
import ThemeToggle from './ThemeToggle.tsx';
import BottomSheet, { type SheetState } from './BottomSheet.tsx';

export interface AppData {
  events: HistoryEvent[];
  eras: Era[];
  places: Place[];
  people: Person[];
}

interface Props {
  /**
   * 첫 화면을 그리는 데 필요한 만큼의 데이터 (사건 페이지라면 그 사건과 연결된 사건).
   * 전체 데이터는 페이지마다 싣지 않고 data.json 하나를 받아 브라우저 캐시를 함께 쓴다.
   */
  initial: AppData;
  /** BASE_URL에서 끝의 / 를 뗀 값 ('' 또는 '/repo') */
  base: string;
  initialId: string | null;
  /** 인물 페이지(/person/<id>/)로 들어왔을 때 */
  initialPersonId?: string | null;
}

const SITE_TITLE = SITE.name;
/**
 * 필터 메뉴(핵심 사건·수능 빈출·분야)는 임시로 화면에서 뺐다.
 * 코드와 테스트는 그대로 두었으니, 되살리려면 true로 바꾸면 된다.
 */
const FILTER_ENABLED = false;
const FILTER_KEY = 'kht:filter';
/** 예전 버전의 '핵심만 보기' 설정 (필터로 옮긴다) */
const OLD_CORE_KEY = 'kht:coreOnly';

/** 주소에서 사건·인물 id를 읽는다 (/event/<id>/, /person/<id>/) */
function routeFromPath(base: string): { eventId: string | null; personId: string | null } {
  const path = window.location.pathname.slice(base.length);
  const ev = path.match(/^\/event\/([a-z0-9-]+)\/?$/);
  const person = path.match(/^\/person\/([a-z0-9-]+)\/?$/);
  return { eventId: ev ? ev[1]! : null, personId: person ? person[1]! : null };
}

export type Focus = { id?: string; range?: [number, number]; nonce: number; animate: boolean };

export default function App({ initial, base, initialId, initialPersonId = null }: Props) {
  const [data, setData] = useState<AppData>(initial);
  const [loaded, setLoaded] = useState(false);
  const { events, eras, places, people } = data;
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  // 인물 보기: 사건 대신 인물을 고르면 그 인물의 사건을 타임라인·지도에서 강조한다
  const [personId, setPersonId] = useState<string | null>(initialPersonId);
  const personRef = useRef(personId);
  personRef.current = personId;
  // 모바일 하단 시트 높이: 사건을 고르면 반쯤 펼치고, 선택을 풀면 접는다
  const [sheet, setSheet] = useState<SheetState>(initialId || initialPersonId ? 'half' : 'peek');
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const [filter, setFilterState] = useState<EventFilter>(EMPTY_FILTER);
  // 타임라인에 보이는 기간 → 지도는 이 기간의 사건만 보여준다 (확대·이동 중에는 늦게 따라가도 된다)
  const [viewRange, setViewRange] = useState<[number, number] | null>(null);
  const deferredRange = useDeferredValue(viewRange);
  // 아래 칸: 지도와 관계 그래프 중 하나
  const [lower, setLower] = useState<'map' | 'graph'>('map');
  // 아래 칸을 크게 (타임라인을 줄인다)
  const [expanded, setExpanded] = useState(false);
  // 좁은 화면에서는 타임라인·지도·관계 중 하나만 보여준다
  const [mobileView, setMobileView] = useState<'timeline' | 'map' | 'graph'>('timeline');
  const showMobile = (v: 'timeline' | 'map' | 'graph') => {
    setMobileView(v);
    if (v !== 'timeline') setLower(v);
  };
  const [focus, setFocus] = useState<Focus | null>(initialId ? { id: initialId, nonce: 0, animate: false } : null);

  /** 인물의 사건이 걸친 기간 (타임라인을 그 기간으로 맞출 때) */
  const personRange = (pid: string, evs: HistoryEvent[]): [number, number] | null => {
    const spans = evs.filter((e) => e.people.includes(pid)).map((e) => eventSpan(e.date));
    if (spans.length === 0) return null;
    const t0 = Math.min(...spans.map((x) => x[0]));
    const t1 = Math.max(...spans.map((x) => x[1]));
    const pad = Math.max((t1 - t0) * 0.15, 1);
    return [t0 - pad, t1 + pad];
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`${base}/data.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`data.json ${r.status}`);
        return r.json() as Promise<AppData>;
      })
      .then((full) => {
        if (cancelled) return;
        setData(full);
        setLoaded(true);
        // 척도가 전체 데이터 기준으로 바뀌었으니 보고 있던 사건(또는 인물)으로 다시 맞춘다
        const id = selectedRef.current;
        if (id) setFocus((f) => ({ id, nonce: (f?.nonce ?? 0) + 1, animate: false }));
        const pid = personRef.current;
        const range = pid ? personRange(pid, full.events) : null;
        if (range) setFocus((f) => ({ range, nonce: (f?.nonce ?? 0) + 1, animate: false }));
      })
      .catch((err) => console.error('전체 데이터를 불러오지 못했습니다', err));
    return () => {
      cancelled = true;
    };
  }, [base]);

  // 필터 설정은 이 브라우저에만 기억한다
  useEffect(() => {
    if (!FILTER_ENABLED) return;
    try {
      const saved = localStorage.getItem(FILTER_KEY);
      if (saved) setFilterState({ ...EMPTY_FILTER, ...(JSON.parse(saved) as Partial<EventFilter>) });
      else if (localStorage.getItem(OLD_CORE_KEY) === '1') setFilterState({ ...EMPTY_FILTER, coreOnly: true });
    } catch {}
  }, []);
  const setFilter = (f: EventFilter) => {
    setFilterState(f);
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(f));
    } catch {}
  };

  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  // 주소: 사건마다 정적 페이지(/event/<id>/)가 있으므로 새로고침·공유해도 같은 화면이 열린다
  const select = useCallback(
    (id: string | null, opts: { focus?: boolean; push?: boolean } = {}) => {
      setSelectedId(id);
      setPersonId(null);
      setSheet((cur) => (id ? (cur === 'full' ? 'full' : 'half') : 'peek'));
      if (id && opts.focus) setFocus((f) => ({ id, nonce: (f?.nonce ?? 0) + 1, animate: true }));
      if (opts.push !== false) {
        const url = id ? `${base}/event/${id}/` : `${base}/`;
        if (window.location.pathname !== url) window.history.pushState({ id }, '', url);
      }
    },
    [base],
  );

  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const person = personId ? (personById.get(personId) ?? null) : null;

  // 인물 고르기: 사건 선택을 풀고, 타임라인을 그 인물의 사건이 걸친 기간으로 맞춘다
  const selectPerson = useCallback(
    (pid: string, opts: { push?: boolean } = {}) => {
      setSelectedId(null);
      setPersonId(pid);
      setSheet((cur) => (cur === 'full' ? 'full' : 'half'));
      const range = personRange(pid, events);
      if (range) setFocus((f) => ({ range, nonce: (f?.nonce ?? 0) + 1, animate: true }));
      if (opts.push !== false) {
        const url = `${base}/person/${pid}/`;
        if (window.location.pathname !== url) window.history.pushState({ person: pid }, '', url);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, events],
  );

  useEffect(() => {
    const onPop = () => {
      const r = routeFromPath(base);
      if (r.personId) selectPerson(r.personId, { push: false });
      else select(r.eventId, { focus: true, push: false });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [base, select, selectPerson]);

  useEffect(() => {
    document.title = selected
      ? `${selected.title} | ${SITE_TITLE}`
      : person
        ? `${person.name} | ${SITE_TITLE}`
        : `${SITE_TITLE} — ${SITE.tagline}`;
  }, [selected, person]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [select]);

  // 사건을 고르고 연결 관계 그래프를 바로 연다 (타임라인 더블클릭, 상세 패널 버튼)
  const openRelations = (id: string) => {
    select(id);
    showMobile('graph');
  };

  // 강조할 사건: 사건을 골랐으면 연결된 사건, 인물을 골랐으면 그 인물의 사건
  const relatedIds = useMemo(() => {
    if (selected) return new Set(linksOf(selected, events).map((l) => l.targetId));
    if (personId) return new Set(events.filter((e) => e.people.includes(personId)).map((e) => e.id));
    return new Set<string>();
  }, [selected, personId, events]);
  const linkCount = selected ? relatedIds.size : 0;
  // 지도에는 필터를 통과한 사건과, 선택한 사건에 연결된 사건을 보여 준다
  const mapEvents = useMemo(
    () => events.filter((e) => passesFilter(e, filter, selectedId) || relatedIds.has(e.id)),
    [events, filter, selectedId, relatedIds],
  );

  return (
    <div className={`app ${selected || person ? 'has-selection' : ''} ${loaded ? 'loaded' : 'loading'}`}>
      <header className="app-header">
        <a
          className="brand"
          href={`${base}/`}
          onClick={(e) => {
            e.preventDefault();
            select(null);
          }}
        >
          <Logo />
          <span>{SITE_TITLE}</span>
        </a>
        <SearchBox
          events={events}
          places={places}
          eras={eras}
          people={people}
          onPick={(id) => select(id, { focus: true })}
          onPickPerson={(pid) => selectPerson(pid)}
        />
        {FILTER_ENABLED && <FilterMenu filter={filter} onChange={setFilter} />}
        <a className="header-link" href={`${base}/table/`} title="연표를 표로 보기 (인쇄용)">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
            <path d="M2 6h12M2 9.5h12M6 6v7.5" />
          </svg>
          <span>표</span>
        </a>
        <a className="header-link" href={`${base}/people/`} title="인물 목록">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="8" cy="5.5" r="2.6" />
            <path d="M3 14c.6-2.8 2.6-4.3 5-4.3s4.4 1.5 5 4.3" />
          </svg>
          <span>인물</span>
        </a>
        <a className="header-link" href={`${base}/about/`} title="사이트 소개와 출처">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 7.2v4M8 4.9v.1" />
          </svg>
          <span>소개</span>
        </a>
        <ThemeToggle />
      </header>
      <div className={`app-body view-${mobileView} lower-${lower} ${expanded ? 'lower-expanded' : ''} sheet-at-${sheet}`}>
        <div className="stage">
          <div className="view-tabs" role="tablist" aria-label="보기 전환">
            {(['timeline', 'map', 'graph'] as const).map((v) => (
              <button key={v} role="tab" aria-selected={mobileView === v} onClick={() => showMobile(v)}>
                {{ timeline: '타임라인', map: '지도', graph: '관계' }[v]}
                {v === 'graph' && selected && (
                  <span key={selectedId} className="tab-badge">
                    {linkCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          <Timeline
            events={events}
            eras={eras}
            selectedId={selectedId}
            filter={filter}
            relatedIds={relatedIds}
            dimOthers={selected !== null || person !== null}
            onSelect={(id) => select(id)}
            onOpenRelations={openRelations}
            focus={focus}
            onViewChange={setViewRange}
          />
          <div className="lower-tabs" role="tablist" aria-label="아래 칸 보기">
            {(['map', 'graph'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={lower === v}
                onClick={() => setLower(v)}
                className={v === 'graph' && lower !== 'graph' && linkCount > 0 ? 'has-links' : ''}
              >
                <TabIcon kind={v} />
                {{ map: '지도', graph: '연결 관계' }[v]}
                {v === 'graph' && selected && (
                  // 사건을 바꿀 때마다 한 번 반짝여서 연결 관계 탭이 있다는 걸 알린다
                  <span key={selectedId} className="tab-badge" aria-label={`연결된 사건 ${linkCount}건`}>
                    {linkCount}
                  </span>
                )}
              </button>
            ))}
            <button className="expand" onClick={() => setExpanded((x) => !x)} aria-pressed={expanded}>
              {expanded ? '타임라인 크게' : '아래 칸 크게'}
            </button>
          </div>
          <ErrorBoundary name="지도" className="map-wrap">
            <MapView
              events={mapEvents}
              places={places}
              selectedId={selectedId}
              relatedIds={relatedIds}
              personId={personId}
              coreOnly={false}
              range={deferredRange}
              onSelect={(id) => select(id, { focus: true })}
            />
          </ErrorBoundary>
          <ErrorBoundary name="관계 그래프" className="graph-wrap">
            <GraphView
              events={events}
              eras={eras}
              selectedId={selectedId}
              onSelect={(id) => select(id, { focus: true })}
              visible={lower === 'graph'}
            />
          </ErrorBoundary>
        </div>
        <BottomSheet state={sheet} onChange={setSheet}>
        <DetailPanel
          event={selected}
          person={person}
          people={people}
          onPerson={(pid) => selectPerson(pid)}
          events={events}
          eras={eras}
          places={places}
          base={base}
          onNavigate={(id) => select(id, { focus: true })}
          onShowRelations={() => selectedId && openRelations(selectedId)}
          onClose={() => select(null)}
        />
        </BottomSheet>
      </div>
      <footer className="app-footer">
        <a href={`${base}/about/`}>소개와 출처</a> · 콘텐츠{' '}
        <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ko">CC BY-NC-SA 4.0</a> · 코드 MIT · 날짜는 조선 시대까지 음력 기준
      </footer>
    </div>
  );
}

/** 아래 칸 탭 아이콘 (지도 / 연결 관계) */
function TabIcon({ kind }: { kind: 'map' | 'graph' }) {
  return (
    <svg className="tab-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'map' ? (
        <path d="M1.5 3.5 5.5 2l5 1.5 4-1.5v10.5l-4 1.5-5-1.5-4 1.5zM5.5 2v10.5M10.5 3.5V14" />
      ) : (
        <>
          <circle cx="8" cy="8" r="2" />
          <circle cx="2.5" cy="3" r="1.5" />
          <circle cx="13.5" cy="3" r="1.5" />
          <circle cx="8" cy="14" r="1.5" />
          <path d="M3.7 4 6.5 6.6M12.3 4 9.5 6.6M8 10v2.5" />
        </>
      )}
    </svg>
  );
}
