import { useEffect, useRef, useState } from 'react';
import { BANDS, type BandId } from '../lib/bands.ts';
import { EMPTY_FILTER, activeFilterCount, type EventFilter } from '../lib/search.ts';

interface Props {
  filter: EventFilter;
  onChange: (f: EventFilter) => void;
}

/** 핵심만 보기, 수능 빈출만, 분야 선택을 모은 필터 메뉴 */
export default function FilterMenu({ filter, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = activeFilterCount(filter);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const toggleBand = (id: BandId) => {
    // 비어 있으면 '전체'이므로 모두 고른 상태에서 출발한다
    const set = new Set<BandId>(filter.bands.length > 0 ? filter.bands : BANDS.map((b) => b.id));
    if (set.has(id)) set.delete(id);
    else set.add(id);
    // 분야를 모두 끄면 볼 것이 없으므로 마지막 하나는 끌 수 없게 한다
    if (set.size === 0) return;
    // 모두 고르면 "전체"와 같으니 비운다
    const bands = BANDS.map((b) => b.id).filter((b) => set.has(b));
    onChange({ ...filter, bands: bands.length === BANDS.length ? [] : bands });
  };

  return (
    <div className="filter" ref={ref}>
      <button className={`filter-button ${count > 0 ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M2 4h12M4.5 8h7M7 12h2" />
        </svg>
        필터
        {count > 0 && <span className="tab-badge">{count}</span>}
      </button>
      {open && (
        <div className="filter-panel" role="dialog" aria-label="사건 필터">
          <label className="filter-row">
            <input type="checkbox" checked={filter.coreOnly} onChange={(e) => onChange({ ...filter, coreOnly: e.target.checked })} />
            <span>
              핵심 사건만
              <small>교과서 단원에 나올 만한 사건</small>
            </span>
          </label>
          <label className="filter-row">
            <input type="checkbox" checked={filter.examOnly} onChange={(e) => onChange({ ...filter, examOnly: e.target.checked })} />
            <span>
              수능 빈출만
              <small>수능 연표에 자주 나오는 사건</small>
            </span>
          </label>
          <fieldset className="filter-bands">
            <legend>분야</legend>
            {BANDS.map((b) => (
              <label key={b.id} className="chip">
                <input
                  type="checkbox"
                  checked={filter.bands.length === 0 || filter.bands.includes(b.id)}
                  onChange={() => toggleBand(b.id)}
                />
                <span>{b.label}</span>
              </label>
            ))}
          </fieldset>
          <button className="filter-reset" onClick={() => onChange(EMPTY_FILTER)} disabled={count === 0}>
            필터 초기화
          </button>
        </div>
      )}
    </div>
  );
}
