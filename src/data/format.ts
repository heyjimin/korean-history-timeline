import type { DatePoint, EventDate, Person } from './schema.ts';

export function formatYear(year: number): string {
  return year < 0 ? `기원전 ${-year}년` : `${year}년`;
}

export function formatPoint(d: DatePoint): string {
  let s = formatYear(d.year);
  if (d.month) s += ` ${d.month}월`;
  if (d.day) s += ` ${d.day}일`;
  return s;
}

export function formatDate(date: EventDate): string {
  const prefix = date.approximate ? '약 ' : '';
  let s = prefix + formatPoint(date.start);
  if (date.end) s += ` ~ ${formatPoint(date.end)}`;
  const hasMonth = date.start.month !== undefined || date.end?.month !== undefined;
  if (hasMonth && date.calendar === 'lunar') s += ' (음력)';
  return s;
}

/** 인물 생몰년: "1545~1598", "?~1598", "1545~?" (모르면 빈 문자열) */
export function formatLifespan(p: Pick<Person, 'born' | 'died' | 'approximate'>): string {
  if (p.born === undefined && p.died === undefined) return '';
  const y = (n: number | undefined) => (n === undefined ? '?' : n < 0 ? `기원전 ${-n}` : `${n}`);
  return `${p.approximate ? '약 ' : ''}${y(p.born)}~${y(p.died)}`;
}

/**
 * 화면에 보이지 않게 할 태그. '수능빈출'은 '핵심'과 거의 겹쳐서 데이터에는 남기되 표시는 '핵심'만 한다.
 */
export const HIDDEN_TAGS: readonly string[] = ['수능빈출'];
export const displayTags = (tags: readonly string[]) => tags.filter((t) => !HIDDEN_TAGS.includes(t));
