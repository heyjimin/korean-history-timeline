import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HistoryEvent, Place } from '../src/data/schema.ts';
import { buildMapContent } from '../src/lib/mapData.ts';

const places = [
  { id: 'p1', name: 'P1', coords: [37, 127], precision: 'exact', modernRegion: '' },
  { id: 'p2', name: 'P2', coords: [35, 129], precision: 'approx', modernRegion: '' },
].map((p) => Place.parse(p));

const ev = (id: string, year: number, extra: Record<string, unknown> = {}) =>
  HistoryEvent.parse({
    id, title: id, era: 'joseon', date: { start: { year } }, importance: 'detail', categories: ['전쟁'],
    summary: 's', sources: [{ name: 'x', url: 'https://example.org' }], ...extra,
  });

const events = [
  ev('a', 1592, { locations: [{ place: 'p1' }], importance: 'core' }),
  ev('b', 1592, { locations: [{ place: 'p1' }] }),
  ev('c', 1600, { locations: [{ place: 'p1', role: 'start' }, { place: 'p2', role: 'end' }], route: true }),
  ev('d', 1592),
];

test('같은 장소의 사건은 한 묶음이 되고 경로가 만들어진다', () => {
  const m = buildMapContent(events, places, { range: null, coreOnly: false, selectedId: null });
  assert.deepEqual(m.groups.find((g) => g.place.id === 'p1')?.eventIds, ['a', 'b', 'c']);
  assert.equal(m.routes.length, 1);
  assert.deepEqual(m.routes[0]!.coords, [[37, 127], [35, 129]]);
  assert.equal(m.unlocated, 1);
});

test('타임라인 기간 밖의 사건은 빠진다', () => {
  const m = buildMapContent(events, places, { range: [1591, 1593], coreOnly: false, selectedId: null });
  assert.deepEqual(m.groups.flatMap((g) => g.eventIds), ['a', 'b']);
  assert.equal(m.routes.length, 0);
});

test('핵심만 보기에서는 상세 사건이 빠지지만, 선택·연결된 사건은 항상 남는다', () => {
  const m = buildMapContent(events, places, {
    range: [1591, 1593], coreOnly: true, selectedId: 'b', alwaysShow: new Set(['c']),
  });
  assert.deepEqual(m.groups.find((g) => g.place.id === 'p1')?.eventIds, ['a', 'b', 'c']);
  assert.equal(m.routes.length, 1);
});

test('지도 이동: 정확도별 확대, 여러 곳은 범위로, 장소 없으면 연결 사건 범위로', async () => {
  const { focusFor, FOCUS_ZOOM } = await import('../src/lib/mapData.ts');
  const a = events[0]!; // p1 (exact)
  assert.deepEqual(focusFor(a, [], places), { kind: 'point', center: [37, 127], zoom: FOCUS_ZOOM.exact });
  const c = events[2]!; // p1(exact) + p2(approx) 경로
  const fc = focusFor(c, [], places);
  assert.equal(fc?.kind, 'bounds');
  assert.equal(fc?.kind === 'bounds' && fc.maxZoom, FOCUS_ZOOM.approx);
  const d = events[3]!; // 장소 없음
  assert.equal(focusFor(d, [], places), null);
  const viaRelated = focusFor(d, [a, c], places);
  assert.equal(viaRelated?.kind === 'bounds' && viaRelated.maxZoom, 7);
});
