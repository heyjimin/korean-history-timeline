// 전체 데이터를 /data.json 하나로 내보낸다. 모든 페이지가 이 파일을 공유한다.
import type { APIRoute } from 'astro';
import { loadDataset } from '../data/load.ts';

export const GET: APIRoute = () => {
  const { dataset } = loadDataset();
  return new Response(JSON.stringify(dataset), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
