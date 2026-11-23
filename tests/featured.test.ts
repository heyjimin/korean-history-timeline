import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDataset } from '../src/data/load.ts';
import { FEATURED } from '../src/data/featured.ts';

test('첫 화면 추천 사건이 모두 데이터에 있다', () => {
  const ids = new Set(loadDataset().dataset.events.map((e) => e.id));
  for (const f of FEATURED) assert.ok(ids.has(f.id), f.id);
});
