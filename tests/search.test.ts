import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HistoryEvent, Place } from '../src/data/schema.ts';
import { EMPTY_FILTER, passesFilter, searchEvents, searchPeople, toChoseong } from '../src/lib/search.ts';
import { Person } from '../src/data/schema.ts';

const ev = (id: string, title: string, extra: Record<string, unknown> = {}) =>
  HistoryEvent.parse({
    id, title, era: 'joseon', date: { start: { year: 1600 } }, importance: 'detail', categories: ['전쟁'],
    summary: '요약', sources: [{ name: 'x', url: 'https://example.org' }], ...extra,
  });

const places = [Place.parse({ id: 'p1', name: '한산도 앞바다', coords: [34.7, 128.4], precision: 'approx', modernRegion: '경상남도 통영시' })];
const events = [
  ev('imjin', '임진왜란', { importance: 'core', tags: ['수능빈출'] }),
  ev('hansan', '한산도 대첩', { locations: [{ place: 'p1' }], tags: ['임진왜란 3대첩'] }),
  ev('culture', '훈민정음 창제', { categories: ['문화'], summary: '세종이 만든 글자' }),
];

test('초성 변환', () => {
  assert.equal(toChoseong('임진왜란'), 'ㅇㅈㅇㄹ');
});

test('제목 일치가 태그·장소·설명 일치보다 위에 온다', () => {
  const hits = searchEvents(events, places, '임진왜란');
  assert.deepEqual(hits.map((h) => h.id), ['imjin', 'hansan']);
  assert.equal(hits[1]!.matched, 'tag');
});

test('띄어쓰기를 무시하고, 초성으로도 찾는다', () => {
  assert.equal(searchEvents(events, places, '한산 도')[0]!.id, 'hansan');
  assert.equal(searchEvents(events, places, 'ㅎㅁㅈㅇ')[0]!.id, 'culture');
});

test('장소 이름과 설명으로도 찾는다', () => {
  assert.equal(searchEvents(events, places, '통영')[0]!.id, 'hansan');
  assert.equal(searchEvents(events, places, '세종')[0]!.matched, 'text');
  assert.deepEqual(searchEvents(events, places, '   '), []);
});

test('필터: 분야·핵심·수능빈출, 선택한 사건은 항상 통과', () => {
  const f = { ...EMPTY_FILTER, bands: ['culture' as const] };
  assert.deepEqual(events.filter((e) => passesFilter(e, f)).map((e) => e.id), ['culture']);
  assert.ok(passesFilter(events[0]!, f, 'imjin'));
  assert.deepEqual(events.filter((e) => passesFilter(e, { ...EMPTY_FILTER, examOnly: true })).map((e) => e.id), ['imjin']);
});

test('인물: 이름·다른 이름·초성으로 찾고, 사건도 인물 이름으로 찾는다', () => {
  const people = [Person.parse({ id: 'yi', name: '이순신', aliases: ['충무공'], role: '장수', summary: 's' })];
  assert.equal(searchPeople(people, '충무')[0]!.id, 'yi');
  assert.equal(searchPeople(people, 'ㅇㅅㅅ')[0]!.id, 'yi');
  const evs = [ev('x', '어떤 해전', { people: ['yi'] })];
  const hit = searchEvents(evs, places, '이순신', 20, people)[0]!;
  assert.equal(hit.id, 'x');
  assert.equal(hit.matched, 'person');
});
