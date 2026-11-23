import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KOREAN_NAME, koreanizeStyle, type Style } from '../src/lib/mapStyle.ts';

const style: Style = {
  version: 8,
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
    { id: 'water', type: 'fill', 'source-layer': 'water' },
    { id: 'road', type: 'line', 'source-layer': 'transportation' },
    { id: 'place_city', type: 'symbol', 'source-layer': 'place', layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']] } },
    { id: 'road_label', type: 'symbol', 'source-layer': 'transportation_name', layout: { 'text-field': '{name}' } },
    { id: 'housenumber', type: 'symbol', 'source-layer': 'housenumber', layout: { 'text-field': '{housenumber}' } },
    { id: 'sea', type: 'symbol', 'source-layer': 'water_name', layout: { 'text-field': ['get', 'name:latin'] } },
  ],
};

test('지명 글자를 한국어 이름(없으면 현지 이름)으로 바꾼다', () => {
  const out = koreanizeStyle(style);
  const field = (id: string) => out.layers.find((l) => l.id === id)!.layout!['text-field'];
  assert.deepEqual(field('place_city'), KOREAN_NAME);
  assert.deepEqual(field('road_label'), KOREAN_NAME);
  assert.deepEqual(field('sea'), KOREAN_NAME);
  // 이름이 아닌 글자(번지)는 그대로 둔다
  assert.equal(field('housenumber'), '{housenumber}');
  assert.equal(out.layers.length, style.layers.length);
});

test('지명만 남기기: 배경·도로·도로 이름을 빼고 지명과 바다 이름만 남는다', () => {
  const out = koreanizeStyle(style, { labelsOnly: true });
  assert.deepEqual(out.layers.map((l) => l.id), ['place_city', 'sea']);
});

test('위성용 흰 글자', () => {
  const out = koreanizeStyle(style, { labelsOnly: true, lightText: true });
  assert.equal(out.layers[0]!.paint!['text-color'], '#ffffff');
});

test('원본 스타일은 바꾸지 않는다', () => {
  const before = JSON.stringify(style);
  koreanizeStyle(style, { labelsOnly: true, lightText: true });
  assert.equal(JSON.stringify(style), before);
});
