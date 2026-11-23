import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimeScale, buildSegments, pointToT, tToYear, ticks, yearToT } from '../src/lib/timeScale.ts';
import { layoutLanes } from '../src/lib/layout.ts';

const eras = [
  { id: 'a', name: 'A', start: -2333, end: -108, color: '#000000' },
  { id: 'b', name: 'B', start: 1392, end: 1863, color: '#000000' },
];

test('기원전과 기원후가 0년 없이 이어진다', () => {
  assert.equal(yearToT(-1), 0);
  assert.equal(yearToT(1), 1);
  assert.equal(tToYear(0.5), -1);
  assert.equal(tToYear(1.5), 1);
  assert.equal(tToYear(yearToT(-2333)), -2333);
});

test('월·일이 연도 안에서 순서대로 놓인다', () => {
  const a = pointToT({ year: 1592, month: 4, day: 13 });
  const b = pointToT({ year: 1592, month: 7, day: 8 });
  assert.ok(1592 < a && a < b && b < 1593);
});

test('척도는 단조 증가하고 invert가 x의 역함수다', () => {
  const segs = buildSegments(eras, [1592, 1593, 1597], 2026);
  const s = new TimeScale(segs, 2);
  let prev = -Infinity;
  for (const t of [-2332, -500, -108, 0, 500, 1392, 1592, 1700, 1862]) {
    const x = s.x(t);
    assert.ok(x > prev, `x(${t}) 증가`);
    prev = x;
    assert.ok(Math.abs(s.invert(x) - t) < 1e-6, `invert(x(${t}))`);
  }
});

test('사건이 많은 구간이 더 넓다', () => {
  const segs = buildSegments(eras, Array.from({ length: 20 }, () => 1592), 2026);
  const joseon = segs.find((x) => x.start === 1392)!;
  const gap = segs.find((x) => x.start === yearToT(-108))!;
  assert.ok(joseon.units > gap.units);
});

test('눈금 라벨에 0년이 없고 겹치지 않는다', () => {
  const s = new TimeScale(buildSegments(eras, [], 2026), 1);
  const list = ticks(s, 1, 0, s.width, 40);
  assert.ok(list.length > 0);
  assert.ok(!list.some((t) => t.label === '0' || t.label === 'BC 0'));
});

test('줄이 모자라면 상세는 숨기고 핵심은 점으로 남긴다', () => {
  const items = [
    { id: 'c1', core: true, x0: 0, x1: 0, labelWidth: 100 },
    { id: 'd1', core: false, x0: 10, x1: 10, labelWidth: 100 },
    { id: 'c2', core: true, x0: 20, x1: 20, labelWidth: 100 },
  ];
  const out = layoutLanes(items, 1);
  assert.deepEqual(out.find((p) => p.id === 'c1'), { id: 'c1', mode: 'full', lane: 0 });
  assert.deepEqual(out.find((p) => p.id === 'c2'), { id: 'c2', mode: 'dot' });
  assert.equal(out.find((p) => p.id === 'd1'), undefined);
  // 줄이 넉넉하면 모두 이름과 함께 보인다
  assert.ok(layoutLanes(items, 3).every((p) => p.mode === 'full'));
});
