/**
 * 모바일 하단 시트의 멈춤 지점 계산 (화면에 의존하지 않는 순수 함수).
 */
export type SheetState = 'peek' | 'half' | 'full';
export const SHEET_ORDER: SheetState[] = ['peek', 'half', 'full'];
/** 화면 높이에 대한 비율 */
export const SNAP: Record<SheetState, number> = { peek: 0.24, half: 0.56, full: 0.92 };
/** 이보다 빠르게 쓸면(px/ms) 놓은 위치와 상관없이 쓴 방향으로 한 단계 움직인다 */
export const FLICK_VELOCITY = 0.45;

/**
 * 끌기를 놓았을 때 멈출 상태.
 * @param from 끌기 시작 전 상태
 * @param ratio 놓은 순간 시트 높이 / 화면 높이
 * @param velocity 아래쪽이 +인 속도 (px/ms)
 */
export function snapAfterDrag(from: SheetState, ratio: number, velocity: number): SheetState {
  const i = SHEET_ORDER.indexOf(from);
  if (velocity > FLICK_VELOCITY) return SHEET_ORDER[Math.max(i - 1, 0)]!;
  if (velocity < -FLICK_VELOCITY) return SHEET_ORDER[Math.min(i + 1, SHEET_ORDER.length - 1)]!;
  return SHEET_ORDER.reduce((a, b) => (Math.abs(SNAP[b] - ratio) < Math.abs(SNAP[a] - ratio) ? b : a));
}

/** 손잡이를 탭했을 때: 접힘 → 반 → 전체 → 접힘 */
export function nextOnTap(s: SheetState): SheetState {
  return s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek';
}
