import type { HistoryEvent, Era, Person, Place } from '../data/schema.ts';
import { displayTags, formatDate, formatLifespan } from '../data/format.ts';
import { eventSpan } from '../lib/timeScale.ts';
import { LINK_ORDER, linksOf } from '../data/relations.ts';
import { FEATURED } from '../data/featured.ts';

interface Props {
  event: HistoryEvent | null;
  /** 인물을 골랐을 때 (사건 대신 인물 정보를 보여 준다) */
  person?: Person | null;
  people?: Person[];
  onPerson?: (id: string) => void;
  events: HistoryEvent[];
  eras: Era[];
  places: Place[];
  base: string;
  onNavigate: (id: string) => void;
  /** 연결 관계 그래프 열기 */
  onShowRelations?: () => void;
  onClose: () => void;
}

export default function DetailPanel({
  event,
  person = null,
  people = [],
  onPerson,
  events,
  eras,
  places,
  base,
  onNavigate,
  onShowRelations,
  onClose,
}: Props) {
  // 다른 키를 누를 때는 새 탭으로 열 수 있게 그대로 두고, 그냥 누르면 앱 안에서 이동한다
  const inApp = (go: () => void) => (ev: React.MouseEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
    ev.preventDefault();
    go();
  };

  if (!event && person) {
    const own = events
      .filter((e) => e.people.includes(person.id))
      .sort((a, b) => eventSpan(a.date)[0] - eventSpan(b.date)[0]);
    const lifespan = formatLifespan(person);
    return (
      <aside className="panel" aria-live="polite">
        <button className="panel-close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <p className="muted panel-meta">
          <span className="person-chip" aria-hidden="true">인</span>
          인물{lifespan && ` · ${lifespan}`}
        </p>
        <h1>{person.name}</h1>
        <p className="tags">
          <span className="tag tag-core">{person.role}</span>
          {person.aliases.map((a) => (
            <span key={a} className="tag">{a}</span>
          ))}
        </p>
        <p className="summary">{person.summary}</p>
        <section>
          <h2>관련 사건 {own.length}건</h2>
          <p className="muted small">타임라인과 지도에서 이 인물의 사건을 강조해 보여 줍니다.</p>
          <ol className="person-events">
            {own.map((e) => {
              const era = eras.find((x) => x.id === e.era);
              return (
                <li key={e.id}>
                  <span className="era-chip" style={{ background: era?.color }} />
                  <a href={`${base}/event/${e.id}/`} onClick={inApp(() => onNavigate(e.id))}>
                    {e.title}
                  </a>
                  <span className="muted small"> {formatDate(e.date)}</span>
                </li>
              );
            })}
          </ol>
        </section>
      </aside>
    );
  }

  if (!event) {
    const byIdAll = new Map(events.map((e) => [e.id, e]));
    const featured = FEATURED.map((f) => ({ ...f, event: byIdAll.get(f.id) })).filter((f) => f.event);
    const coreCount = events.filter((e) => e.importance === 'core').length;
    return (
      <aside className="panel panel-empty">
        <p className="panel-kicker">선사 시대부터 현대까지 {events.length > 30 ? `${events.length}개 사건` : '주요 사건'}</p>
        <h2 className="panel-hero">사건을 따라 한국사의 흐름을 살펴보세요</h2>
        <p className="muted">
          타임라인·지도·연결 관계가 함께 움직입니다. 아래에서 하나를 골라 시작하거나, 위 검색창에서 사건을 찾아보세요.
        </p>

        <h3 className="panel-subhead">여기서 시작해 보세요</h3>
        <ul className="featured">
          {featured.map(({ id, hook, event: e }) => {
            const era = eras.find((x) => x.id === e!.era);
            return (
              <li key={id}>
                <a
                  href={`${base}/event/${id}/`}
                  style={{ ['--era' as string]: era?.color }}
                  onClick={(ev) => {
                    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
                    ev.preventDefault();
                    onNavigate(id);
                  }}
                >
                  <span className="featured-era">{era?.name}</span>
                  <strong>{e!.title}</strong>
                  <span className="featured-hook">{hook}</span>
                </a>
              </li>
            );
          })}
        </ul>

        <p className="panel-links">
          <a href={`${base}/table/`}>전체 연표를 표로 보기 →</a>
        </p>

        <details className="howto">
          <summary>사용법</summary>
          <ul className="muted hint-list">
            <li>가로는 시간, 세로는 분야(정치·제도, 전쟁·외교, 경제·사회, 문화)입니다</li>
            <li>휠(또는 두 손가락)로 확대·축소, 끌어서 이동, 맨 위 미니맵을 눌러 원하는 시대로 이동</li>
            <li>시대 띠를 누르면 그 시대로 확대</li>
            <li>사건을 더블클릭하면 연결 관계 그래프로 바로 이동</li>
            <li>축소하면 핵심 사건({coreCount}건)만, 확대하면 상세 사건까지 보입니다</li>
            <li>지도에는 타임라인에 보이는 기간의 사건만 나타납니다</li>
            <li>
              <kbd>/</kbd> 검색, <kbd>Esc</kbd> 선택 해제
            </li>
          </ul>
        </details>
      </aside>
    );
  }

  const byId = new Map(events.map((e) => [e.id, e]));
  const placeById = new Map(places.map((p) => [p.id, p]));
  const era = eras.find((e) => e.id === event.era);
  const links = linksOf(event, events);
  const groups = LINK_ORDER.map((label) => [label, links.filter((l) => l.label === label)] as const).filter(
    ([, items]) => items.length > 0,
  );
  const adapted = event.sources.some((s) => s.kind === 'adapted');

  const link = (id: string, children: React.ReactNode) => (
    <a
      href={`${base}/event/${id}/`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onNavigate(id);
      }}
    >
      {children}
    </a>
  );

  return (
    <aside className="panel" aria-live="polite">
      <button className="panel-close" onClick={onClose} aria-label="닫기">
        ✕
      </button>
      <p className="muted panel-meta">
        <span className="era-chip" style={{ background: era?.color }} />
        {era?.name} · {formatDate(event.date)}
      </p>
      <h1>{event.title}</h1>
      <p className="tags">
        {event.importance === 'core' && <span className="tag tag-core">핵심</span>}
        {event.categories.map((c) => (
          <span key={c} className="tag">{c}</span>
        ))}
        {displayTags(event.tags).map((t) => (
          <span key={t} className="tag">#{t}</span>
        ))}
      </p>
      <p className="summary">{event.summary}</p>
      {event.detail?.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}

      {event.people.length > 0 && (
        <section>
          <h2>관련 인물</h2>
          <ul className="person-list">
            {event.people.map((pid) => {
              const p = people.find((x) => x.id === pid);
              if (!p) return null;
              return (
                <li key={pid}>
                  <a href={`${base}/person/${pid}/`} onClick={inApp(() => onPerson?.(pid))} className="person-link">
                    <span className="person-chip" aria-hidden="true">인</span>
                    <strong>{p.name}</strong>
                    <span className="muted small">{p.role}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {event.locations.length > 0 && (
        <section>
          <h2>장소</h2>
          <ul>
            {event.locations.map((l) => {
              const p = placeById.get(l.place);
              if (!p) return null;
              return (
                <li key={l.place + l.role}>
                  {p.name} <span className="muted">· {p.modernRegion}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {groups.length > 0 && (
        <section>
          <h2>
            연결된 사건
            {onShowRelations && (
              <button className="h2-action" onClick={onShowRelations}>
                그래프로 보기 →
              </button>
            )}
          </h2>
          {groups.map(([label, items]) => (
            <div key={label} className="link-group">
              <h3>{label}</h3>
              <ul>
                {items.map((l) => {
                  const t = byId.get(l.targetId)!;
                  return (
                    <li key={l.targetId}>
                      {link(t.id, t.title)}{' '}
                      <span className="muted">
                        {formatDate(t.date)}
                        {l.note ? ` · ${l.note}` : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2>출처</h2>
        <ul className="sources">
          {event.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener">
                {s.name}
              </a>
              {s.kind === 'adapted' && ' (각색)'}
            </li>
          ))}
        </ul>
        {adapted && <p className="muted small">이 설명의 일부는 위 문서를 각색했으며 CC BY-NC-SA 2.0 KR을 따릅니다.</p>}
      </section>
    </aside>
  );
}
