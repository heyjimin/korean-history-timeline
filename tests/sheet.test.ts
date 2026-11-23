import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextOnTap, snapAfterDrag } from '../src/lib/sheet.ts';

test('천천히 끌면 가장 가까운 높이에 멈춘다', () => {
  assert.equal(snapAfterDrag('half', 0.3, 0), 'peek');
  assert.equal(snapAfterDrag('half', 0.5, 0.1), 'half');
  assert.equal(snapAfterDrag('peek', 0.85, -0.1), 'full');
});

test('빠르게 쓸면 놓은 위치와 상관없이 쓴 방향으로 한 단계', () => {
  // 반쯤 상태에서 조금만 휙 내려도 접힌다
  assert.equal(snapAfterDrag('half', 0.52, 0.8), 'peek');
  // 전체에서 휙 내리면 반으로 (한 번에 접히지 않음)
  assert.equal(snapAfterDrag('full', 0.85, 1.2), 'half');
  // 접힌 상태에서 휙 올리면 반으로
  assert.equal(snapAfterDrag('peek', 0.28, -0.9), 'half');
  // 끝에서는 더 가지 않는다
  assert.equal(snapAfterDrag('peek', 0.2, 2), 'peek');
  assert.equal(snapAfterDrag('full', 0.95, -2), 'full');
});

test('손잡이 탭', () => {
  assert.equal(nextOnTap('peek'), 'half');
  assert.equal(nextOnTap('half'), 'full');
  assert.equal(nextOnTap('full'), 'peek');
});
