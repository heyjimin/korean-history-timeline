import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { HistoryEvent, Place } from '../data/schema.ts';
import { buildMapContent, focusFor } from '../lib/mapData.ts';
import { koreanizeStyle, type KoreanizeOptions, type Style } from '../lib/mapStyle.ts';
import { onThemeChange } from '../lib/theme.ts';
import 'maplibre-gl/dist/maplibre-gl.css';

interface Props {
  events: HistoryEvent[];
  places: Place[];
  selectedId: string | null;
  relatedIds: Set<string>;
  /** 인물을 골랐으면 그 인물의 사건 장소로 지도를 옮긴다 */
  personId?: string | null;
  coreOnly: boolean;
  /** 타임라인에 보이는 기간 */
  range: [number, number] | null;
  onSelect: (id: string) => void;
}

// 한반도와 일본 열도가 함께 보이는 범위
const HOME_BOUNDS: Leaflet.LatLngBoundsExpression = [
  [32.5, 124],
  [41.5, 140.5],
];
/** region(넓은 지역) 장소를 그리는 원의 반지름 (m) */
const REGION_RADIUS = 18000;

/**
 * 지도 레이아웃 (배경 지도). 모두 키 없이 출처 표기 조건으로 쓸 수 있다.
 * - raster: 바탕 이미지 타일 (Esri)
 * - vector: OpenFreeMap 벡터 지도. 지명을 한국어로 바꿔 그린다 (src/lib/mapStyle.ts)
 * - darkFilter: 다크 모드에서 바탕에 씌울 필터 (app.css의 .map[data-dark-filter])
 */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자';
const OFM_ATTR = '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> · ' + OSM_ATTR;
const ESRI_RELIEF = { url: `${ESRI}/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 13 };
const ESRI_IMAGERY = { url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 18 };

interface BasemapDef {
  id: string;
  label: string;
  hint: string;
  raster: { url: string; maxNativeZoom: number }[];
  vector: { style: 'positron' | 'liberty' } & KoreanizeOptions;
  attribution: string;
  darkFilter: 'invert' | 'dim' | 'none';
}

export const BASEMAPS = [
  {
    id: 'simple', label: '단순', hint: '도로 없이 옅은 바탕에 한국어 지명',
    raster: [], vector: { style: 'positron' }, attribution: OFM_ATTR, darkFilter: 'invert',
  },
  {
    id: 'terrain', label: '지형', hint: '산과 강 같은 지형 위에 한국어 지명',
    raster: [ESRI_RELIEF], vector: { style: 'positron', labelsOnly: true },
    attribution: 'Tiles &copy; Esri · 지명 ' + OFM_ATTR, darkFilter: 'dim',
  },
  {
    id: 'satellite', label: '위성', hint: '위성 사진 위에 한국어 지명',
    raster: [ESRI_IMAGERY], vector: { style: 'positron', labelsOnly: true, lightText: true },
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics · 지명 ' + OFM_ATTR, darkFilter: 'none',
  },
  {
    id: 'detailed', label: '상세 (도로 포함)', hint: '도로와 건물까지 나오는 지도',
    raster: [], vector: { style: 'liberty' }, attribution: OFM_ATTR, darkFilter: 'invert',
  },
] as const satisfies readonly BasemapDef[];
type BasemapId = (typeof BASEMAPS)[number]['id'];

/**
 * MapLibre와 Leaflet 연결 모듈을 불러온다.
 * MapLibre는 지도 타일을 웹 워커에서 처리하는데, 번들러를 거치면 기본 워커 주소가 깨지므로
 * Vite가 따로 묶은 워커 파일의 주소를 직접 알려 준다.
 */
let maplibreReady: Promise<typeof import('@maplibre/maplibre-gl-leaflet')> | null = null;
function loadMaplibre() {
  maplibreReady ??= Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
    import('@maplibre/maplibre-gl-leaflet'),
  ]).then(([maplibre, worker, bridge]) => {
    maplibre.setWorkerUrl(worker.default);
    return bridge;
  });
  return maplibreReady;
}

// 스타일 JSON은 레이아웃을 바꿀 때마다 다시 받지 않도록 한 번만 받아 둔다
const styleCache = new Map<string, Promise<Style>>();
function fetchStyle(name: string): Promise<Style> {
  let p = styleCache.get(name);
  if (!p) {
    p = fetch(`https://tiles.openfreemap.org/styles/${name}`).then((r) => {
      if (!r.ok) throw new Error(`지도 스타일 ${name}: ${r.status}`);
      return r.json() as Promise<Style>;
    });
    p.catch(() => styleCache.delete(name));
    styleCache.set(name, p);
  }
  return p;
}
const BASEMAP_KEY = 'kht:basemap';

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function MapView({ events, places, selectedId, relatedIds, personId = null, coreOnly, range, onSelect }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ L: typeof Leaflet; map: Leaflet.Map; layer: Leaflet.LayerGroup } | null>(null);
  const [ready, setReady] = useState(false);
  // 탭 전환으로 숨겨지면 크기가 0이 된다. 그동안 지도를 움직이면 좌표 계산이 깨지므로 보일 때까지 미룬다
  const [hasSize, setHasSize] = useState(false);
  const [basemap, setBasemap] = useState<BasemapId>('simple');
  // 화면 모드가 바뀌면 표시 색(CSS 변수)을 다시 읽어 그린다
  const [themeKey, setThemeKey] = useState(0);
  useEffect(() => onThemeChange(() => setThemeKey((k) => k + 1)), []);
  const tilesRef = useRef<Leaflet.LayerGroup | null>(null);
  // 고른 지도 레이아웃은 이 브라우저에만 기억한다
  useEffect(() => {
    try {
      const saved = localStorage.getItem(BASEMAP_KEY);
      if (BASEMAPS.some((b) => b.id === saved)) setBasemap(saved as BasemapId);
    } catch {}
  }, []);
  const chooseBasemap = (id: BasemapId) => {
    setBasemap(id);
    try {
      localStorage.setItem(BASEMAP_KEY, id);
    } catch {}
  };
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Leaflet은 window가 필요하므로 브라우저에서만 불러온다
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    import('leaflet').then((mod) => {
      const L = (mod.default ?? mod) as typeof Leaflet;
      if (disposed || !elRef.current) return;
      const map = L.map(elRef.current, { zoomSnap: 0.5, worldCopyJump: false, minZoom: 3 });
      if (elRef.current.clientWidth > 0) map.fitBounds(HOME_BOUNDS);
      else map.setView([36.5, 132], 5);
      tilesRef.current = L.layerGroup().addTo(map);
      // 벡터 지도(지명)를 이미지 타일 위, 사건 표시 아래에 그리는 칸
      map.createPane('vectorPane').style.zIndex = '250';
      const layer = L.layerGroup().addTo(map);
      // 지도가 들어 있는 칸의 크기가 바뀌면 다시 맞춘다
      const el = elRef.current;
      let fitted = el.clientWidth > 0;
      const ro = new ResizeObserver(() => {
        const visible = el.clientWidth > 0 && el.clientHeight > 0;
        if (visible) {
          map.invalidateSize();
          if (!fitted) {
            map.fitBounds(HOME_BOUNDS);
            fitted = true;
          }
        }
        setHasSize(visible);
      });
      ro.observe(el);
      mapRef.current = { L, map, layer };
      setReady(true);
      cleanup = () => {
        ro.disconnect();
        map.remove();
      };
    });
    return () => {
      disposed = true;
      cleanup();
      mapRef.current = null;
    };
  }, []);

  // 배경 지도 바꾸기
  useEffect(() => {
    const m = mapRef.current;
    const tiles = tilesRef.current;
    if (!ready || !m || !tiles) return;
    let cancelled = false;
    const def: BasemapDef = BASEMAPS.find((b) => b.id === basemap) ?? BASEMAPS[0];
    tiles.clearLayers();
    // 출처 표기: 벡터 지도 레이어는 Leaflet 출처 칸에 스스로 이름을 올리지 않으므로 직접 넣는다
    const attribution = m.map.attributionControl;
    attribution.addAttribution(def.attribution);
    for (const l of def.raster) m.L.tileLayer(l.url, { maxZoom: 18, maxNativeZoom: l.maxNativeZoom }).addTo(tiles);
    // 벡터 지도(한국어 지명)는 MapLibre로 그려 Leaflet 위에 얹는다. 처음 쓸 때만 불러온다.
    Promise.all([fetchStyle(def.vector.style), loadMaplibre()])
      .then(([raw, bridge]) => {
        if (cancelled) return;
        const style = koreanizeStyle(raw, def.vector);
        const options = { style, attributionControl: false, pane: 'vectorPane' };
        bridge.maplibreGL(options as unknown as Parameters<typeof bridge.maplibreGL>[0]).addTo(tiles);
      })
      .catch((err) => {
        // 벡터 지도를 못 불러오면 OpenStreetMap 기본 지도라도 보여 준다
        console.error('벡터 지도를 불러오지 못했습니다', err);
        if (cancelled) return;
        m.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(tiles);
      });
    return () => {
      cancelled = true;
      attribution.removeAttribution(def.attribution);
    };
  }, [ready, basemap]);

  const content = useMemo(
    () => buildMapContent(events, places, { range, coreOnly, selectedId, alwaysShow: relatedIds }),
    [events, places, range, coreOnly, selectedId, relatedIds],
  );
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  // 표시물 그리기
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    const { L, layer } = m;
    layer.clearLayers();
    const accent = cssVar('--accent') || '#3457c9';
    const related = cssVar('--related') || '#d9822b';
    const neutral = cssVar('--map-neutral') || '#5b6b8c';
    const hasSel = selectedId !== null;

    const roleOf = (ids: string[]) =>
      ids.includes(selectedId ?? '') ? 'selected' : ids.some((id) => relatedIds.has(id)) ? 'related' : hasSel ? 'dim' : 'normal';
    const colorOf = (role: string) => (role === 'selected' ? accent : role === 'related' ? related : neutral);

    // 경로: 경유지를 순서대로 직선으로 잇는다 (실제 항로가 아닌 개략도)
    for (const r of content.routes) {
      const role = roleOf([r.eventId]);
      L.polyline(r.coords, {
        color: colorOf(role),
        weight: role === 'selected' ? 4 : 2.5,
        opacity: role === 'dim' ? 0.25 : 0.85,
        dashArray: '6 6',
        interactive: false,
      }).addTo(layer);
    }

    // 선택된 것이 위에 오도록 그리는 순서를 정한다
    const order = { dim: 0, normal: 1, related: 2, selected: 3 } as const;
    const groups = [...content.groups].sort((a, b) => order[roleOf(a.eventIds)] - order[roleOf(b.eventIds)]);

    for (const g of groups) {
      const role = roleOf(g.eventIds);
      const color = colorOf(role);
      const opacity = role === 'dim' ? 0.3 : 1;
      const latlng = g.place.coords;
      const titles = g.eventIds.map((id) => byId.get(id)?.title ?? id);
      let marker: Leaflet.Path;
      if (g.place.precision === 'region') {
        marker = L.circle(latlng, {
          radius: REGION_RADIUS, color, weight: 1.5, opacity, fillColor: color, fillOpacity: 0.12 * opacity, dashArray: '4 4',
        });
      } else if (g.place.precision === 'approx') {
        marker = L.circleMarker(latlng, {
          radius: 9, color, weight: 2, opacity, fillColor: color, fillOpacity: 0.3 * opacity, dashArray: '3 3',
        });
      } else {
        marker = L.circleMarker(latlng, {
          radius: 7, color: '#fff', weight: 2, opacity, fillColor: color, fillOpacity: opacity,
        });
      }
      const precisionNote = { exact: '', approx: ' (대략적 위치)', region: ' (지역)' }[g.place.precision];
      marker.bindTooltip(`<strong>${esc(g.place.name)}</strong>${precisionNote}<br>${titles.map(esc).join('<br>')}`, {
        direction: 'top',
        offset: [0, -6],
      });
      marker.on('click', () => {
        if (g.eventIds.length === 1) {
          onSelectRef.current(g.eventIds[0]!);
          return;
        }
        // 한 장소에 사건이 여럿이면 목록을 띄워 고르게 한다
        const box = document.createElement('div');
        box.className = 'map-popup';
        const h = document.createElement('strong');
        h.textContent = g.place.name;
        box.append(h);
        for (const id of g.eventIds) {
          const b = document.createElement('button');
          b.textContent = byId.get(id)?.title ?? id;
          if (id === selectedId) b.className = 'current';
          b.onclick = () => {
            m.map.closePopup();
            onSelectRef.current(id);
          };
          box.append(b);
        }
        L.popup({ offset: [0, -4] }).setLatLng(latlng).setContent(box).openOn(m.map);
      });
      marker.addTo(layer);
    }
  }, [ready, content, selectedId, relatedIds, byId, themeKey]);

  // 사건을 고르면 그 장소로 부드럽게 날아가 확대한다.
  // 지도가 숨겨져 있을 때(연결 관계 탭 등) 고른 사건은 지도가 보일 때 이동한다.
  const lastFocusRef = useRef<string | null>(null);
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m || !hasSize) return;
    const key = selectedId ?? (personId ? `person:${personId}` : null);
    if (!key) {
      lastFocusRef.current = null;
      return;
    }
    if (lastFocusRef.current === key) return;
    const related = [...relatedIds].map((id) => byId.get(id)).filter((e) => e !== undefined);
    // 인물은 자기 장소가 없으므로 그 인물의 사건 장소를 모아 보여 준다
    const focus = focusFor(selectedId ? byId.get(selectedId) : undefined, related, places);
    lastFocusRef.current = key;
    if (!focus) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 화면 크기에 맞춘 여백 (표시와 범례에 가리지 않도록)
    const pad = Math.round(Math.min(m.map.getSize().x, m.map.getSize().y) * 0.15);
    if (focus.kind === 'point') {
      if (reduceMotion) m.map.setView(focus.center, focus.zoom);
      else m.map.flyTo(focus.center, focus.zoom, { duration: 1.2, easeLinearity: 0.2 });
    } else {
      const bounds = m.L.latLngBounds(focus.points);
      const opts = { maxZoom: focus.maxZoom, padding: [pad, pad] as [number, number] };
      if (reduceMotion) m.map.fitBounds(bounds, opts);
      else m.map.flyToBounds(bounds, { ...opts, duration: 1.2, easeLinearity: 0.2 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedId, personId, byId, places, hasSize, relatedIds]);

  const selected = selectedId ? byId.get(selectedId) : undefined;

  return (
    <div className="map-wrap">
      <div
        ref={elRef}
        className="map"
        role="region"
        aria-label="사건 지도"
        data-dark-filter={(BASEMAPS.find((b) => b.id === basemap) ?? BASEMAPS[0]).darkFilter}
      />
      <div className="map-legend">
        <span><i className="lg-exact" />정확한 위치</span>
        <span><i className="lg-approx" />대략적 위치</span>
        <span><i className="lg-region" />넓은 지역</span>
        {content.routes.length > 0 && <span><i className="lg-route" />경로(개략)</span>}
      </div>
      {selected && selected.locations.length === 0 && (
        <div className="map-note">
          「{selected.title}」은(는) 장소 정보가 없어{relatedIds.size > 0 ? ' 연결된 사건의 장소를 보여줍니다.' : ' 지도에 표시되지 않습니다.'}
        </div>
      )}
      {!selected && content.unlocated > 0 && (
        <div className="map-note muted">지금 기간의 사건 중 {content.unlocated}건은 장소 정보가 없어 지도에 나오지 않습니다.</div>
      )}
      <div className="map-tools">
        <label className="map-basemap">
          <span>지도</span>
          <select value={basemap} onChange={(e) => chooseBasemap(e.target.value as BasemapId)} aria-label="지도 레이아웃">
            {BASEMAPS.map((b) => (
              <option key={b.id} value={b.id} title={b.hint}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      <button
        className="map-home"
        onClick={() => mapRef.current?.map.flyToBounds(HOME_BOUNDS, { duration: 0.6 })}
        aria-label="지도 처음 위치로"
      >
          처음 위치
        </button>
      </div>
    </div>
  );
}
