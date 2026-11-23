import type { HistoryEvent } from '../data/schema.ts';

/**
 * 타임라인 세로축: 분야별 띠.
 * 사건은 첫 번째 분야(categories[0])로 띠를 정한다. 데이터 작성 시 가장 중요한 분야를 맨 앞에 적는다.
 * 띠 높이는 사건 수에 맞춘 고정 비율(weight)로 나눈다.
 */
export const BANDS = [
  { id: 'politics', label: '정치·제도', categories: ['정치', '제도'], weight: 3 },
  { id: 'war', label: '전쟁·외교', categories: ['전쟁', '외교'], weight: 3 },
  { id: 'society', label: '경제·사회', categories: ['경제', '사회'], weight: 2 },
  { id: 'culture', label: '문화', categories: ['문화'], weight: 1.5 },
] as const;

export type BandId = (typeof BANDS)[number]['id'];

export function bandOf(event: Pick<HistoryEvent, 'categories'>): BandId {
  const first = event.categories[0];
  return BANDS.find((b) => (b.categories as readonly string[]).includes(first ?? ''))?.id ?? 'politics';
}

export interface BandBox {
  id: BandId;
  label: string;
  top: number;
  height: number;
}

/**
 * 주어진 높이를 띠별로 나눈다.
 * need(띠별로 사건 이름을 다 놓는 데 필요한 높이, px)를 주면:
 *  - 모두 들어가면 각 띠에 필요한 만큼 주고, 남는 높이는 모든 띠에 고르게 나눈다
 *    (사건이 몇 개뿐인 띠가 화면 대부분을 차지하지 않도록)
 *  - 모자라면 최소 높이를 먼저 주고, 나머지를 부족한 만큼에 비례해 나눈다
 * need가 없으면 고정 비율(weight)로 나눈다.
 */
export function bandBoxes(
  top: number,
  height: number,
  need?: Partial<Record<BandId, number>>,
  minHeight = 24,
  /** 보여 줄 띠 (분야 필터). 비어 있으면 모두 */
  only: readonly BandId[] = [],
): BandBox[] {
  const bands: readonly (typeof BANDS)[number][] = only.length > 0 ? BANDS.filter((b) => only.includes(b.id)) : BANDS;
  const n = bands.length;
  const base = Math.min(minHeight, height / n);
  let heights: number[];
  if (!need) {
    const total = bands.reduce((s, b) => s + b.weight, 0);
    heights = bands.map((b) => (height * b.weight) / total);
  } else {
    const want = bands.map((b) => Math.max(base, need[b.id] ?? 0));
    const sumWant = want.reduce((s, w) => s + w, 0);
    if (sumWant <= height) {
      const extra = (height - sumWant) / n;
      heights = want.map((w) => w + extra);
    } else {
      const deficit = want.map((w) => w - base);
      const sumDef = deficit.reduce((s, d) => s + d, 0);
      const rest = height - base * n;
      heights = deficit.map((d) => base + (sumDef > 0 ? (rest * d) / sumDef : rest / n));
    }
  }
  let y = top;
  return bands.map((b, i) => {
    const box = { id: b.id, label: b.label, top: y, height: heights[i]! };
    y += heights[i]!;
    return box;
  });
}
