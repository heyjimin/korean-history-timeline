import { useEffect, useMemo, useRef, useState } from 'react';
import type { Era, HistoryEvent, Person, Place } from '../data/schema.ts';
import { formatDate } from '../data/format.ts';
import { searchEvents, searchPeople } from '../lib/search.ts';
import { formatLifespan } from '../data/format.ts';

interface Props {
  events: HistoryEvent[];
  places: Place[];
  eras: Era[];
  people: Person[];
  onPick: (id: string) => void;
  onPickPerson: (id: string) => void;
}

const MATCHED_LABEL = { title: '', tag: '태그', person: '인물', place: '장소', text: '설명' } as const;

/** 사건 검색창. "/" 또는 ⌘K·Ctrl+K로 바로 쓸 수 있다. */
export default function SearchBox({ events, places, eras, people, onPick, onPickPerson }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // 결과: 인물을 위에, 사건을 아래에 한 목록으로 (방향키로 함께 오르내린다)
  const hits = useMemo(() => {
    const personHits = searchPeople(people, query, 5).map((h) => ({ kind: 'person' as const, id: h.id, matched: 'title' as const }));
    const eventHits = searchEvents(events, places, query, 20, people).map((h) => ({ kind: 'event' as const, id: h.id, matched: h.matched }));
    return [...personHits, ...eventHits];
  }, [events, places, people, query]);
  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const eraName = useMemo(() => new Map(eras.map((e) => [e.id, e])), [eras]);

  useEffect(() => setActive(0), [query]);

  // 어디서든 "/" 나 ⌘K 로 검색창에 들어간다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]');
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 바깥을 누르면 닫는다
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const pick = (hit: { kind: 'person' | 'event'; id: string }) => {
    if (hit.kind === 'person') onPickPerson(hit.id);
    else onPick(hit.id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const showList = open && query.trim().length > 0;

  return (
    <div className="search" ref={boxRef}>
      <svg className="search-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="7" cy="7" r="4.5" />
        <path d="m10.5 10.5 3.5 3.5" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="사건·인물·장소 검색 (초성도 됩니다)"
        aria-label="사건 검색"
        role="combobox"
        aria-expanded={showList}
        aria-controls="search-results"
        aria-activedescendant={showList && hits[active] ? `search-${hits[active]!.kind}-${hits[active]!.id}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && hits[active]) {
            e.preventDefault();
            pick(hits[active]!);
          } else if (e.key === 'Escape') {
            // 선택 해제(전역 Esc)로 번지지 않게 여기서 멈춘다
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            if (query) setQuery('');
            else inputRef.current?.blur();
            setOpen(false);
          }
        }}
      />
      <kbd className="search-kbd" aria-hidden="true">/</kbd>
      {showList && (
        <ul className="search-results" id="search-results" role="listbox">
          {hits.length === 0 && <li className="search-empty">"{query}"에 맞는 사건이 없습니다.</li>}
          {hits.map((h, i) => {
            const common = {
              id: `search-${h.kind}-${h.id}`,
              role: 'option' as const,
              'aria-selected': i === active,
              className: `${i === active ? 'active' : ''} ${h.kind === 'person' ? 'is-person' : ''}`,
              onPointerEnter: () => setActive(i),
              onPointerDown: (ev: React.PointerEvent) => {
                ev.preventDefault();
                pick(h);
              },
            };
            if (h.kind === 'person') {
              const p = personById.get(h.id)!;
              return (
                <li key={`p-${h.id}`} {...common}>
                  <span className="person-chip" aria-hidden="true">인</span>
                  <span className="search-title">{p.name}</span>
                  <span className="search-meta">
                    {p.role}
                    {formatLifespan(p) && ` · ${formatLifespan(p)}`}
                  </span>
                </li>
              );
            }
            const e = byId.get(h.id)!;
            const era = eraName.get(e.era);
            return (
              <li key={`e-${h.id}`} {...common}>
                <span className="era-chip" style={{ background: era?.color }} />
                <span className="search-title">{e.title}</span>
                <span className="search-meta">
                  {formatDate(e.date)}
                  {MATCHED_LABEL[h.matched] && <em> · {MATCHED_LABEL[h.matched]}</em>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
