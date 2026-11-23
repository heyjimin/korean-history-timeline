// 사건마다 공유 미리보기 이미지 (/og/<id>.png). 빌드할 때 한 번 만든다.
import type { APIRoute, GetStaticPaths } from 'astro';
import { loadDataset } from '../../data/load.ts';
import { formatDate } from '../../data/format.ts';
import { renderOg } from '../../lib/og.ts';

export const getStaticPaths: GetStaticPaths = () => {
  const { dataset } = loadDataset();
  const eraById = new Map(dataset.eras.map((e) => [e.id, e]));
  return dataset.events.map((e) => {
    const era = eraById.get(e.era);
    return {
      params: { id: e.id },
      props: { title: e.title, kicker: `${era?.name ?? ''} · ${formatDate(e.date)}`, summary: e.summary, color: era?.color ?? '#3457c9' },
    };
  });
};

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOg(props as Parameters<typeof renderOg>[0]);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
