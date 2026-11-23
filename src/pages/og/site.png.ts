// 첫 화면·표 보기의 공유 미리보기 이미지 (/og/site.png)
import type { APIRoute } from 'astro';
import { loadDataset } from '../../data/load.ts';
import { renderOg } from '../../lib/og.ts';
import { SITE } from '../../site.ts';

export const GET: APIRoute = async () => {
  const { dataset } = loadDataset();
  const png = await renderOg({
    title: SITE.tagline,
    kicker: `선사 시대부터 현대까지 · 사건 ${dataset.events.length}건`,
    summary: '시대와 시간 순서, 일어난 장소, 사건 사이의 연결 관계를 타임라인·지도·그래프로 함께 살펴봅니다.',
    color: '#2f5aa0',
  });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
