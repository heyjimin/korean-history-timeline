import type { HistoryEvent, Person, Place } from '../data/schema.ts';
import { bandOf, type BandId } from './bands.ts';
import { displayTags } from '../data/format.ts';

/**
 * 사건 검색과 필터.
 * - 띄어쓰기를 무시하고 찾는다 ("임진 왜란" = "임진왜란")
 * - 초성으로도 찾는다 ("ㅇㅈㅇㄹ" → 임진왜란)
 * - 제목이 맞으면 설명이 맞는 것보다 위에 둔다
 */

const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s·・,.()「」『』"'“”‘’-]/g, '');
}

export function toChoseong(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0) - 0xac00;
    out += code >= 0 && code < 11172 ? CHOSEONG[Math.floor(code / 588)] : ch;
  }
  return out;
}

const isChoseongQuery = (q: string) => /^[ㄱ-ㅎ]+$/.test(q);

export interface SearchHit {
  id: string;
  score: number;
  /** 어디에서 맞았는지 (결과 목록에 보여 준다) */
  matched: 'title' | 'tag' | 'person' | 'place' | 'text';
}

export function searchEvents(
  events: HistoryEvent[],
  places: Place[],
  query: string,
  limit = 20,
  people: Person[] = [],
): SearchHit[] {
  const q = normalize(query);
  if (!q) return [];
  const placeName = new Map(places.map((p) => [p.id, normalize([p.name, ...p.historicalNames, p.modernRegion].join(' '))]));
  const personName = new Map(people.map((p) => [p.id, normalize([p.name, ...p.aliases].join(' '))]));
  const chosung = isChoseongQuery(q);
  const hits: SearchHit[] = [];

  for (const e of events) {
    const title = normalize(e.title);
    let hit: SearchHit | null = null;
    if (chosung) {
      if (toChoseong(title).includes(q)) hit = { id: e.id, score: 80, matched: 'title' };
    } else if (title === q) {
      hit = { id: e.id, score: 120, matched: 'title' };
    } else if (title.startsWith(q)) {
      hit = { id: e.id, score: 100, matched: 'title' };
    } else if (title.includes(q)) {
      hit = { id: e.id, score: 90, matched: 'title' };
    } else if (displayTags(e.tags).some((t) => normalize(t).includes(q))) {
      hit = { id: e.id, score: 60, matched: 'tag' };
    } else if (e.people.some((pid) => personName.get(pid)?.includes(q))) {
      hit = { id: e.id, score: 55, matched: 'person' };
    } else if (e.locations.some((l) => placeName.get(l.place)?.includes(q))) {
      hit = { id: e.id, score: 50, matched: 'place' };
    } else if (normalize(`${e.summary} ${e.detail ?? ''}`).includes(q)) {
      hit = { id: e.id, score: 40, matched: 'text' };
    }
    if (hit) {
      // 같은 점수면 핵심 사건을 먼저
      if (e.importance === 'core') hit.score += 5;
      hits.push(hit);
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export interface EventFilter {
  /** 보여 줄 분야 띠 (비어 있으면 모두) */
  bands: BandId[];
  coreOnly: boolean;
  examOnly: boolean;
}

export const EMPTY_FILTER: EventFilter = { bands: [], coreOnly: false, examOnly: false };

/** 필터를 통과하는가. 선택한 사건은 필터와 상관없이 늘 보여 준다. */
export function passesFilter(e: HistoryEvent, f: EventFilter, selectedId: string | null = null): boolean {
  if (e.id === selectedId) return true;
  if (f.coreOnly && e.importance !== 'core') return false;
  if (f.examOnly && !e.tags.includes('수능빈출')) return false;
  if (f.bands.length > 0 && !f.bands.includes(bandOf(e))) return false;
  return true;
}

export function activeFilterCount(f: EventFilter): number {
  return Number(f.coreOnly) + Number(f.examOnly) + (f.bands.length > 0 ? 1 : 0);
}

export interface PersonHit {
  id: string;
  score: number;
}

/** 인물 검색: 이름과 다른 이름(호·묘호 등), 초성 */
export function searchPeople(people: Person[], query: string, limit = 5): PersonHit[] {
  const q = normalize(query);
  if (!q) return [];
  const chosung = isChoseongQuery(q);
  const hits: PersonHit[] = [];
  for (const p of people) {
    const names = [p.name, ...p.aliases].map(normalize);
    let score = 0;
    for (const n of names) {
      const target = chosung ? toChoseong(n) : n;
      if (target === q) score = Math.max(score, 120);
      else if (target.startsWith(q)) score = Math.max(score, 100);
      else if (target.includes(q)) score = Math.max(score, 80);
    }
    if (score > 0) hits.push({ id: p.id, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
