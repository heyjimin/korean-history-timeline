import type { HistoryEvent, Place } from '../data/schema.ts';
import { eventSpan } from './timeScale.ts';

/** 지도에 그릴 것: 장소별 사건 묶음과 경로 */
export interface PlaceGroup {
  place: Place;
  eventIds: string[];
}

export interface Route {
  eventId: string;
  coords: [number, number][];
}

export interface MapContent {
  groups: PlaceGroup[];
  routes: Route[];
  /** 지금 보이는 기간에 있지만 장소 정보가 없는 사건 수 */
  unlocated: number;
}

interface Options {
  /** 타임라인에 보이는 기간 (연속 시간 t). null이면 전체 */
  range: [number, number] | null;
  coreOnly: boolean;
  selectedId: string | null;
  /** 기간·핵심 필터와 상관없이 항상 그릴 사건 (선택된 사건과 연결된 사건) */
  alwaysShow?: Set<string>;
}

export function visibleInRange(e: HistoryEvent, range: [number, number] | null): boolean {
  if (!range) return true;
  const [s, en] = eventSpan(e.date);
  return en >= range[0] && s <= range[1];
}

export function buildMapContent(events: HistoryEvent[], places: Place[], opts: Options): MapContent {
  const placeById = new Map(places.map((p) => [p.id, p]));
  const byPlace = new Map<string, string[]>();
  const routes: Route[] = [];
  let unlocated = 0;

  for (const e of events) {
    const pinned = e.id === opts.selectedId || (opts.alwaysShow?.has(e.id) ?? false);
    if (!pinned) {
      if (opts.coreOnly && e.importance !== 'core') continue;
      if (!visibleInRange(e, opts.range)) continue;
    }
    if (e.locations.length === 0) {
      unlocated++;
      continue;
    }
    for (const loc of e.locations) {
      if (!placeById.has(loc.place)) continue;
      const list = byPlace.get(loc.place) ?? [];
      if (!list.includes(e.id)) list.push(e.id);
      byPlace.set(loc.place, list);
    }
    if (e.route) {
      const coords = e.locations.map((l) => placeById.get(l.place)?.coords).filter((c) => c !== undefined);
      if (coords.length >= 2) routes.push({ eventId: e.id, coords });
    }
  }

  const groups = [...byPlace].map(([placeId, eventIds]) => ({ place: placeById.get(placeId)!, eventIds }));
  return { groups, routes, unlocated };
}

/** 사건을 골랐을 때 지도를 어디로, 얼마나 확대해 옮길지 */
export type MapFocus =
  | { kind: 'point'; center: [number, number]; zoom: number }
  | { kind: 'bounds'; points: [number, number][]; maxZoom: number };

/** 장소 정확도에 따른 확대 정도: 정확한 지점일수록 더 가까이 */
export const FOCUS_ZOOM: Record<Place['precision'], number> = { exact: 11, approx: 9, region: 7 };

export function focusFor(
  event: HistoryEvent | undefined,
  relatedEvents: HistoryEvent[],
  places: Place[],
): MapFocus | null {
  const placeById = new Map(places.map((p) => [p.id, p]));
  const own = (event?.locations ?? []).map((l) => placeById.get(l.place)).filter((p) => p !== undefined);
  if (own.length === 1) return { kind: 'point', center: own[0]!.coords, zoom: FOCUS_ZOOM[own[0]!.precision] };
  if (own.length > 1) {
    // 여러 곳(경로 등): 모두 보이게 맞추되, 가장 넓은 장소의 정확도만큼만 확대한다
    return { kind: 'bounds', points: own.map((p) => p.coords), maxZoom: Math.min(...own.map((p) => FOCUS_ZOOM[p.precision])) };
  }
  // 장소가 없는 상위 사건(전쟁 등): 연결된 사건들의 장소를 모아 넓게 보여 준다
  const related = relatedEvents.flatMap((e) => e.locations.map((l) => placeById.get(l.place))).filter((p) => p !== undefined);
  if (related.length === 0) return null;
  if (related.length === 1) return { kind: 'point', center: related[0]!.coords, zoom: 7 };
  return { kind: 'bounds', points: related.map((p) => p.coords), maxZoom: 7 };
}
