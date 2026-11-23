import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANDS, bandBoxes, bandOf } from '../src/lib/bands.ts';
import { Category } from '../src/data/schema.ts';

test('첫 번째 분야로 띠를 정한다', () => {
  assert.equal(bandOf({ categories: ['외교', '정치'] }), 'war');
  assert.equal(bandOf({ categories: ['제도'] }), 'politics');
  assert.equal(bandOf({ categories: ['문화', '전쟁'] }), 'culture');
});

test('스키마의 모든 분야가 어느 띠에든 속한다', () => {
  const covered = new Set(BANDS.flatMap((b) => [...b.categories]));
  for (const c of Category.options) assert.ok(covered.has(c), c);
});

test('띠는 겹치지 않고 주어진 높이를 꽉 채운다', () => {
  const boxes = bandBoxes(60, 300);
  assert.equal(boxes[0]!.top, 60);
  for (let i = 1; i < boxes.length; i++) {
    assert.ok(Math.abs(boxes[i]!.top - (boxes[i - 1]!.top + boxes[i - 1]!.height)) < 1e-9);
  }
  const last = boxes[boxes.length - 1]!;
  assert.ok(Math.abs(last.top + last.height - 360) < 1e-9);
});

test('모두 들어가면 필요한 만큼 주고 남는 높이는 고르게 나눈다 (한 띠가 독차지하지 않는다)', () => {
  // 정치 띠에 사건 하나(필요 50px)뿐이고 나머지는 비어 있을 때
  const boxes = bandBoxes(0, 400, { politics: 50 }, 30);
  const h = Object.fromEntries(boxes.map((b) => [b.id, b.height]));
  assert.ok(Math.abs(h.politics! - h.war! - 20) < 1e-9, '필요한 만큼(50-30)만 더 받는다');
  assert.ok(h.war! === h.society! && h.society! === h.culture!);
  assert.ok(Math.abs(boxes.reduce((s, b) => s + b.height, 0) - 400) < 1e-9);
});

test('모자라면 최소 높이를 지키고 부족한 만큼에 비례해 나눈다', () => {
  const boxes = bandBoxes(0, 300, { war: 600, politics: 200 }, 30);
  const h = Object.fromEntries(boxes.map((b) => [b.id, b.height]));
  assert.ok(h.war! > h.politics! && h.politics! > h.culture!);
  assert.ok(Math.abs(h.culture! - 30) < 1e-9);
  assert.ok(Math.abs(boxes.reduce((s, b) => s + b.height, 0) - 300) < 1e-9);
});
