// 휴대폰 홈 화면 아이콘 (180×180). favicon.svg 를 PNG로 바꾼다.
import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

export const GET: APIRoute = () => {
  // iOS 아이콘은 둥근 모서리를 기기가 씌우므로 꽉 찬 사각형으로 만든다
  const svg = readFileSync(join(process.cwd(), 'public', 'favicon.svg'), 'utf8').replace('rx="8"', 'rx="0"');
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 180 } }).render().asPng();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
