import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HistoryEvent } from '../src/data/schema.ts';
import { buildEgoGraph } from '../src/lib/graphData.ts';

const ev = (id: string, relations: { type: string; target: string }[] = [], importance = 'detail') =>
  HistoryEvent.parse({
    id, title: id, era: 'joseon', date: { start: { year: 1600 } }, importance, categories: ['전쟁'],
    summary: 's', sources: [{ name: 'x', url: 'https://example.org' }], relations,
  });

// war ← battle1, battle2 / battle1 → battle2 / war → treaty → mission / a ↔ b (related, 양쪽에 적힘)
const events = [
  ev('war', [{ type: 'led_to', target: 'treaty' }], 'core'),
  ev('battle1', [{ type: 'part_of', target: 'war' }, { type: 'followed_by', target: 'battle2' }]),
  ev('battle2', [{ type: 'part_of', target: 'war' }]),
  ev('treaty', [{ type: 'followed_by', target: 'mission' }], 'core'),
  ev('mission'),
  ev('a', [{ type: 'related', target: 'b' }]),
  ev('b', [{ type: 'related', target: 'a' }]),
];

test('1단계는 직접 연결된 사건만, 들어오는 관계도 포함한다', () => {
  const g = buildEgoGraph(events, 'war', 1);
  assert.deepEqual(g.nodes.map((n) => n.id).sort(), ['battle1', 'battle2', 'treaty', 'war']);
  // 이웃끼리의 관계(battle1 → battle2)도 함께 그린다
  assert.ok(g.edges.some((e) => e.source === 'battle1' && e.target === 'battle2'));
  assert.ok(!g.nodes.some((n) => n.id === 'mission'));
});

test('2단계는 이웃의 이웃까지 깊이와 함께 모은다', () => {
  const g = buildEgoGraph(events, 'war', 2);
  assert.equal(g.nodes.find((n) => n.id === 'mission')?.depth, 2);
  assert.equal(g.nodes.find((n) => n.id === 'war')?.depth, 0);
});

test('양쪽에 적힌 related 관계는 하나로 친다', () => {
  const g = buildEgoGraph(events, 'a', 1);
  assert.equal(g.edges.length, 1);
});

test('최대 개수를 넘으면 가까운 단계와 핵심 사건을 남긴다', () => {
  const g = buildEgoGraph(events, 'battle2', 2, 3);
  // battle2 → (war, battle1) → treaty 4개 중 3개만 남긴다. mission은 3단계라 애초에 빠진다
  assert.equal(g.truncated, 1);
  assert.deepEqual(g.nodes.map((n) => n.id).sort(), ['battle1', 'battle2', 'war']);
});

test('없는 사건이면 빈 그래프', () => {
  assert.deepEqual(buildEgoGraph(events, 'nope', 2), { nodes: [], edges: [], truncated: 0 });
});

test('역할 배치: 상위는 위, 하위는 아래, 결과는 오른쪽', async () => {
  const { roleLayout } = await import('../src/lib/graphData.ts');
  const g = buildEgoGraph(events, 'battle1', 1);
  const pos = roleLayout(g, 'battle1', () => 0);
  assert.ok(pos.get('war')!.y < 0, '상위 사건은 위');
  assert.ok(pos.get('battle2')!.x > 0, '이어지는 사건은 오른쪽');
  const g2 = buildEgoGraph(events, 'war', 1);
  const pos2 = roleLayout(g2, 'war', () => 0);
  assert.ok(pos2.get('battle1')!.y > 0 && pos2.get('battle2')!.y > 0, '하위 사건은 아래');
  assert.ok(pos2.get('treaty')!.x > 0, '결과는 오른쪽');
  assert.equal(pos2.size, g2.nodes.length);
  // battle1은 war의 하위 사건이기도 하지만, battle2 기준으로는 "앞선 사건"이라 왼쪽이어야 한다
  const g3 = buildEgoGraph(events, 'battle2', 1);
  const pos3 = roleLayout(g3, 'battle2', () => 0);
  assert.ok(pos3.get('battle1')!.x < 0, '앞선 사건은 왼쪽');
});
