/**
 * OpenFreeMap 벡터 지도 스타일을 한국어 지명으로 바꾼다.
 *
 * OpenFreeMap 스타일은 기본으로 영문(name_en)이나 "영문 + 현지어"를 쓴다.
 * 모든 글자 레이어를 name:ko(한국어 이름)가 있으면 그것을, 없으면 현지 이름(name)을 쓰도록 바꾼다.
 * 한글은 MapLibre가 기기 글꼴로 그리므로(localIdeographFontFamily) 따로 글꼴을 받을 필요가 없다.
 */

// 외부 스타일 JSON은 구조가 깊고 느슨해서 필요한 부분만 좁혀서 다룬다
export interface StyleLayer {
  id: string;
  type: string;
  'source-layer'?: string;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Style {
  layers: StyleLayer[];
  [key: string]: unknown;
}

export const KOREAN_NAME = ['coalesce', ['get', 'name:ko'], ['get', 'name']];

/** 지형·위성 위에 얹을 때 남길 글자 레이어 (지명, 바다·강 이름, 산 이름) */
const LABEL_SOURCE_LAYERS = new Set(['place', 'water_name', 'waterway', 'mountain_peak']);

export interface KoreanizeOptions {
  /** 배경과 도로를 빼고 지명 글자만 남긴다 (래스터 지도 위에 얹을 때) */
  labelsOnly?: boolean;
  /** 위성 사진 위에서 읽히도록 흰 글자에 어두운 테두리 */
  lightText?: boolean;
}

function usesName(textField: unknown): boolean {
  return JSON.stringify(textField ?? '').includes('name');
}

export function koreanizeStyle(style: Style, opts: KoreanizeOptions = {}): Style {
  let layers = style.layers.map((layer) => {
    if (layer.type !== 'symbol' || !usesName(layer.layout?.['text-field'])) return layer;
    const next: StyleLayer = { ...layer, layout: { ...layer.layout, 'text-field': KOREAN_NAME } };
    if (opts.lightText) {
      next.paint = { ...layer.paint, 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.75)', 'text-halo-width': 1.4 };
    }
    return next;
  });
  if (opts.labelsOnly) {
    layers = layers.filter(
      (l) => l.type === 'symbol' && LABEL_SOURCE_LAYERS.has(l['source-layer'] ?? '') && usesName(l.layout?.['text-field']),
    );
  }
  return { ...style, layers };
}
