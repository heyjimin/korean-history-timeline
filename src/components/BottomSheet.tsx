import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SNAP, nextOnTap, snapAfterDrag, type SheetState } from '../lib/sheet.ts';

export type { SheetState } from '../lib/sheet.ts';

/**
 * 모바일 하단 시트. 데스크톱에서는 CSS로 시트 모양을 끄고 원래 오른쪽 패널로 보인다 (display: contents).
 *
 * 손가락으로 잡기 쉽도록:
 *  - 접힘·반 상태에서는 시트 어디를 위아래로 끌어도 시트가 움직인다
 *  - 전체 상태에서는 윗부분(손잡이·제목)을 끌거나, 내용이 맨 위까지 스크롤된 상태에서 아래로 끌면 내려간다
 *  - 빠르게 휙 쓸면 놓은 위치와 상관없이 쓴 방향으로 한 단계 움직인다
 *  - 끌기를 마친 직후의 탭은 무시해 링크나 사건이 잘못 눌리지 않게 한다
 */

/** 이 요소에서 시작한 끌기는 언제나 시트를 움직인다 (전체 상태 포함) */
const GRAB_SELECTOR = '.sheet-handle, .sheet-top, .panel-meta, .panel > h1, .panel-kicker, .panel-hero';
/** 끌기로 판단하기 전 허용하는 흔들림 (px) */
const SLOP = 8;

interface Props {
  state: SheetState;
  onChange: (s: SheetState) => void;
  children: ReactNode;
}

export default function BottomSheet({ state, onChange, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragH, setDragH] = useState<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 접히면 내용 스크롤을 맨 위로
  useEffect(() => {
    if (state === 'peek') ref.current?.querySelector('.panel')?.scrollTo({ top: 0 });
  }, [state]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const viewport = () => window.visualViewport?.height ?? window.innerHeight;
    let g: {
      y0: number;
      h0: number;
      mode: 'undecided' | 'drag' | 'scroll';
      grab: boolean;
      atTop: boolean;
      samples: { y: number; t: number }[];
    } | null = null;
    let suppressClickUntil = 0;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || getComputedStyle(el).display === 'contents') return;
      const target = e.target as Element;
      const panel = el.querySelector('.panel');
      const t = e.touches[0]!;
      g = {
        y0: t.clientY,
        h0: el.getBoundingClientRect().height,
        mode: 'undecided',
        grab: !!target.closest(GRAB_SELECTOR) && !target.closest('.sheet-top button, .panel-close'),
        atTop: !panel || panel.scrollTop <= 0,
        samples: [{ y: t.clientY, t: e.timeStamp }],
      };
    };

    const onMove = (e: TouchEvent) => {
      if (!g || e.touches.length !== 1) return;
      const t = e.touches[0]!;
      const dy = t.clientY - g.y0; // 아래로 +
      if (g.mode === 'undecided') {
        if (Math.abs(dy) < SLOP) return;
        const s = stateRef.current;
        // 접힘·반: 어디서든 시트를 끈다 / 전체: 윗부분이거나, 맨 위에서 아래로 끌 때만
        g.mode = s !== 'full' || g.grab || (g.atTop && dy > 0) ? 'drag' : 'scroll';
      }
      if (g.mode !== 'drag') return;
      // 시트를 끄는 동안 브라우저 스크롤·당겨서 새로고침을 막는다
      e.preventDefault();
      const vh = viewport();
      setDragH(Math.min(Math.max(g.h0 - dy, vh * 0.1), vh * SNAP.full));
      g.samples.push({ y: t.clientY, t: e.timeStamp });
      if (g.samples.length > 6) g.samples.shift();
    };

    const onEnd = (e: TouchEvent) => {
      if (!g) return;
      const gesture = g;
      g = null;
      if (gesture.mode !== 'drag') return;
      // 마지막 100ms 정도의 움직임으로 속도를 잰다
      const last = gesture.samples[gesture.samples.length - 1]!;
      const first = gesture.samples.find((p) => last.t - p.t <= 100) ?? gesture.samples[0]!;
      const velocity = last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
      const vh = viewport();
      const h = gesture.h0 - (last.y - gesture.y0);
      onChangeRef.current(snapAfterDrag(stateRef.current, h / vh, velocity));
      setDragH(null);
      suppressClickUntil = e.timeStamp + 400;
    };

    // 끌기 직후에 따라오는 클릭은 버린다 (링크·사건이 잘못 눌리지 않도록)
    const onClickCapture = (e: MouseEvent) => {
      if (e.timeStamp < suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    el.addEventListener('click', onClickCapture, true);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  const expandLabel = state === 'full' ? '패널 줄이기' : '패널 펼치기';

  return (
    <div
      className={`sheet sheet-${state} ${dragH !== null ? 'dragging' : ''}`}
      style={dragH !== null ? { height: dragH } : undefined}
      ref={ref}
    >
      <div className="sheet-top">
        {/* 손잡이: 탭하면 접힘 → 반 → 전체 → 접힘, 끌면 원하는 높이로 */}
        <button className="sheet-handle" aria-label={expandLabel} onClick={() => onChange(nextOnTap(state))}>
          <span />
        </button>
        {/* 끌기가 어려울 때를 위한 버튼 */}
        <button
          className="sheet-toggle"
          aria-label={expandLabel}
          title={expandLabel}
          onClick={() => onChange(state === 'full' ? 'half' : state === 'half' ? 'full' : 'half')}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {state === 'full' ? <path d="M4 6.5 8 10.5l4-4" /> : <path d="M4 9.5 8 5.5l4 4" />}
          </svg>
        </button>
      </div>
      {/* 접힌 상태에서 내용을 탭하면 펼친다 (아래 링크로 바로 가지 않고) */}
      <div
        className="sheet-body"
        onClickCapture={(e) => {
          // 데스크톱(시트가 아닌 오른쪽 패널)과 닫기 버튼은 그대로 둔다
          if (state !== 'peek' || !window.matchMedia('(max-width: 767px)').matches) return;
          if ((e.target as Element).closest('.panel-close')) return;
          e.preventDefault();
          e.stopPropagation();
          onChange('half');
        }}
      >
        {children}
      </div>
    </div>
  );
}
