import type { HistoryEvent, RelationType } from './schema.ts';

const OUTGOING: Record<RelationType, string> = {
  part_of: '상위 사건',
  followed_by: '이어지는 사건',
  led_to: '결과',
  related: '관련 사건',
};
const INCOMING: Record<RelationType, string> = {
  part_of: '하위 사건',
  followed_by: '앞선 사건',
  led_to: '원인',
  related: '관련 사건',
};
/** 상세 패널에 보여줄 순서 */
export const LINK_ORDER = ['상위 사건', '원인', '앞선 사건', '이어지는 사건', '결과', '하위 사건', '관련 사건'];

export interface EventLink {
  label: string;
  targetId: string;
  note?: string;
}

/** 나가는 관계와 들어오는 관계를 모두 모아 사람이 읽는 말로 바꾼다 */
export function linksOf(event: HistoryEvent, all: HistoryEvent[]): EventLink[] {
  const links: EventLink[] = [];
  const ids = new Set(all.map((e) => e.id));
  for (const r of event.relations) {
    if (ids.has(r.target)) links.push({ label: OUTGOING[r.type], targetId: r.target, note: r.note });
  }
  for (const other of all) {
    for (const r of other.relations) {
      if (r.target === event.id && !links.some((l) => l.targetId === other.id)) {
        links.push({ label: INCOMING[r.type], targetId: other.id, note: r.note });
      }
    }
  }
  return links;
}
