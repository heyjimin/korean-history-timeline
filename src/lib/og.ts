/**
 * 공유 미리보기 이미지(1200×630 PNG)를 빌드할 때 만든다.
 * satori로 HTML 비슷한 구조를 SVG로 그리고, resvg로 PNG로 바꾼다.
 * 글꼴은 사이트와 같은 Pretendard(OFL)를 쓴다.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { SITE } from '../site.ts';

const require = createRequire(import.meta.url);
const fontPath = (weight: string) => require.resolve(`pretendard/dist/public/static/Pretendard-${weight}.otf`);
let fonts: { name: string; data: Buffer; weight: 400 | 700 | 800; style: 'normal' }[] | null = null;
function loadFonts() {
  fonts ??= [
    { name: 'Pretendard', data: readFileSync(fontPath('Regular')), weight: 400, style: 'normal' },
    { name: 'Pretendard', data: readFileSync(fontPath('Bold')), weight: 700, style: 'normal' },
    { name: 'Pretendard', data: readFileSync(fontPath('ExtraBold')), weight: 800, style: 'normal' },
  ];
  return fonts;
}

// satori는 React 요소 모양의 객체를 받는다 (JSX 없이 작은 도우미로 만든다)
type Node = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
  type,
  props: { style, children },
});

export interface OgInput {
  title: string;
  /** 제목 위 작은 줄 (시대 · 날짜) */
  kicker: string;
  summary: string;
  color: string;
}

/**
 * 이미지 하나를 만드는 데 0.3초쯤 걸려 사건이 수백 개면 빌드가 몇 분씩 걸린다.
 * 내용이 같으면 다시 그리지 않도록 node_modules/.cache 에 저장해 둔다.
 * 디자인을 바꾸면 OG_VERSION 을 올려 캐시를 무효화한다.
 */
const OG_VERSION = 'v1';
const CACHE_DIR = join(process.cwd(), 'node_modules', '.cache', 'kht-og');

export async function renderOg(input: OgInput): Promise<Buffer> {
  const key = createHash('sha1').update(OG_VERSION + SITE.name + JSON.stringify(input)).digest('hex');
  const file = join(CACHE_DIR, `${key}.png`);
  if (existsSync(file)) return readFileSync(file);
  const png = await draw(input);
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, png);
  } catch {
    // 캐시를 못 쓰면 매번 그릴 뿐이다
  }
  return png;
}

async function draw({ title, kicker, summary, color }: OgInput): Promise<Buffer> {
  const titleSize = title.length > 18 ? 58 : 72;
  const tree = h(
    'div',
    {
      width: 1200, height: 630, display: 'flex', background: '#fbfaf7', fontFamily: 'Pretendard', color: '#1f1d1a',
    },
    [
      h('div', { width: 28, height: '100%', background: color }),
      h(
        'div',
        { display: 'flex', flexDirection: 'column', flex: 1, padding: '64px 72px 56px 64px' },
        [
          h('div', { fontSize: 30, fontWeight: 700, color }, kicker),
          h('div', { fontSize: titleSize, fontWeight: 800, lineHeight: 1.2, marginTop: 18, letterSpacing: -1 }, title),
          h(
            'div',
            {
              fontSize: 30, lineHeight: 1.55, color: '#5f5a52', marginTop: 28, maxHeight: 140, overflow: 'hidden',
              display: 'block', lineClamp: 3,
            },
            summary,
          ),
          h('div', { flex: 1 }),
          h('div', { display: 'flex', alignItems: 'center', gap: 16 }, [
            // 타임라인 모양 표시: 선 위의 점 셋
            h('div', { display: 'flex', alignItems: 'center', width: 120, height: 20, position: 'relative' }, [
              h('div', { position: 'absolute', left: 0, right: 0, top: 9, height: 3, background: '#d9d4c9' }),
              h('div', { position: 'absolute', left: 4, top: 2, width: 16, height: 16, borderRadius: 8, background: '#d9d4c9' }),
              h('div', { position: 'absolute', left: 52, top: 0, width: 20, height: 20, borderRadius: 10, background: color }),
              h('div', { position: 'absolute', left: 100, top: 2, width: 16, height: 16, borderRadius: 8, background: '#d9d4c9' }),
            ]),
            h('div', { fontSize: 30, fontWeight: 800 }, SITE.name),
          ]),
        ],
      ),
    ],
  );
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width: 1200, height: 630, fonts: loadFonts() });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
