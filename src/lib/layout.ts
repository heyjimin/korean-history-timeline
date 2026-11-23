/**
 * 타임라인 줄(lane) 배치.
 *
 * 핵심 사건을 먼저 배치하고 상세 사건은 남는 자리에만 넣는다.
 * 줄이 모자라면 상세 사건은 숨기고, 핵심 사건은 이름 없이 점으로만 남긴다.
 * 그래서 많이 축소하면 자연스럽게 핵심 사건만 보이고, 확대할수록 상세 사건이 나타난다.
 */

export interface LayoutInput {
  id: string;
  core: boolean;
  /** 화면 픽셀 */
  x0: number;
  x1: number;
  labelWidth: number;
}

export type Placement =
  | { id: string; mode: 'full'; lane: number }
  | { id: string; mode: 'dot' };

const GAP = 10;

export function estimateLabelWidth(title: string): number {
  // 한글 13px 기준 대략 13px, 영문·숫자·기호는 그 절반 정도
  let w = 0;
  for (const ch of title) w += /[ㄱ-힝]/.test(ch) ? 13 : 7;
  return w + 22; // 점과 여백
}

export function layoutLanes(items: LayoutInput[], maxLanes: number): Placement[] {
  const result: Placement[] = [];
  const ordered = [...items].sort((a, b) => Number(b.core) - Number(a.core) || a.x0 - b.x0);

  // 줄마다 차지한 구간 목록 (핵심을 먼저 넣으므로 x 순서가 섞인다 → 구간 겹침으로 검사)
  const lanes: [number, number][][] = [];
  for (const item of ordered) {
    const start = item.x0;
    const end = Math.max(item.x1, item.x0 + item.labelWidth);
    let placed = -1;
    for (let i = 0; i < maxLanes; i++) {
      const occupied = (lanes[i] ??= []);
      if (occupied.every(([a, b]) => end + GAP <= a || start >= b + GAP)) {
        occupied.push([start, end]);
        placed = i;
        break;
      }
    }
    if (placed >= 0) result.push({ id: item.id, mode: 'full', lane: placed });
    else if (item.core) result.push({ id: item.id, mode: 'dot' });
  }
  return result;
}
