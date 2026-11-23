import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { Era, EraFile, HistoryEvent, Person, Place, type DatePoint } from './schema.ts';
import { existsSync } from 'node:fs';

export interface Dataset {
  eras: Era[];
  places: Place[];
  events: HistoryEvent[];
  people: Person[];
}

export interface Issue {
  level: 'error' | 'warning';
  where: string;
  message: string;
}

const DATA_DIR = join(process.cwd(), 'data');

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function describeZodError(where: string, error: z.ZodError): Issue[] {
  return error.issues.map((i) => ({
    level: 'error',
    where: `${where} › ${i.path.join('.') || '(root)'}`,
    message: i.message,
  }));
}

/** data/ 아래 JSON을 모두 읽고 스키마 검사와 교차 참조 검사를 한다. */
export function loadDataset(): { dataset: Dataset; issues: Issue[] } {
  const issues: Issue[] = [];

  const erasResult = z.array(Era).safeParse(readJson(join(DATA_DIR, 'eras.json')));
  if (!erasResult.success) issues.push(...describeZodError('eras.json', erasResult.error));
  const eras = erasResult.data ?? [];

  const placesResult = z.array(Place).safeParse(readJson(join(DATA_DIR, 'places.json')));
  if (!placesResult.success) issues.push(...describeZodError('places.json', placesResult.error));
  const places = placesResult.data ?? [];

  const peopleFile = join(DATA_DIR, 'people.json');
  const peopleResult = z.array(Person).safeParse(existsSync(peopleFile) ? readJson(peopleFile) : []);
  if (!peopleResult.success) issues.push(...describeZodError('people.json', peopleResult.error));
  const people = peopleResult.data ?? [];

  const events: HistoryEvent[] = [];
  const eventsDir = join(DATA_DIR, 'events');
  for (const file of readdirSync(eventsDir).filter((f) => f.endsWith('.json')).sort()) {
    const where = `events/${file}`;
    // 사건 하나의 오류가 나머지 사건 검사를 가리지 않도록 사건 단위로 검사한다
    const shell = EraFile.extend({ events: z.array(z.unknown()) }).safeParse(readJson(join(eventsDir, file)));
    if (!shell.success) {
      issues.push(...describeZodError(where, shell.error));
      continue;
    }
    shell.data.events.forEach((raw, index) => {
      const result = HistoryEvent.safeParse(raw);
      const label = (raw as { id?: unknown })?.id ?? `#${index}`;
      if (!result.success) {
        issues.push(...describeZodError(`${where} › ${String(label)}`, result.error));
        return;
      }
      const e = result.data;
      if (e.era !== shell.data.era) {
        issues.push({ level: 'error', where: `${where} › ${e.id}`, message: `era "${e.era}"가 파일의 era "${shell.data.era}"와 다르다` });
      }
      events.push(e);
    });
  }

  const dataset = { eras, places, events, people };
  issues.push(...checkReferences(dataset));
  return { dataset, issues };
}

function findDuplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const i of ids) (seen.has(i) ? dup : seen).add(i);
  return [...dup];
}

/** 날짜 비교용 정렬 키 (월·일이 없으면 그 해/달의 처음으로 본다) */
export function dateKey(d: DatePoint): number {
  return d.year * 10000 + (d.month ?? 0) * 100 + (d.day ?? 0);
}

/**
 * 두 날짜를 둘 다 아는 정밀도까지만 비교한다.
 * 예: 1905년 11월(일 모름)과 1905년 11월 17일은 같은 것으로 본다.
 */
export function comparePrecise(a: DatePoint, b: DatePoint): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month === undefined || b.month === undefined) return 0;
  if (a.month !== b.month) return a.month - b.month;
  if (a.day === undefined || b.day === undefined) return 0;
  return a.day - b.day;
}

function checkReferences({ eras, places, events, people }: Dataset): Issue[] {
  const issues: Issue[] = [];
  const err = (where: string, message: string) => issues.push({ level: 'error', where, message });
  const warn = (where: string, message: string) => issues.push({ level: 'warning', where, message });

  for (const d of findDuplicates(eras.map((e) => e.id))) err('eras.json', `중복된 시대 id: ${d}`);
  for (const d of findDuplicates(places.map((p) => p.id))) err('places.json', `중복된 장소 id: ${d}`);
  for (const d of findDuplicates(events.map((e) => e.id))) err('events', `중복된 사건 id: ${d}`);
  for (const d of findDuplicates(people.map((p) => p.id))) err('people.json', `중복된 인물 id: ${d}`);
  const personIds = new Set(people.map((p) => p.id));
  const usedPeople = new Set<string>();
  for (const p of people) {
    if (p.born !== undefined && p.died !== undefined && p.died < p.born) err(`people.json › ${p.id}`, '죽은 해가 태어난 해보다 앞선다');
  }

  const eraIds = new Set(eras.map((e) => e.id));
  const placeIds = new Set(places.map((p) => p.id));
  const byId = new Map(events.map((e) => [e.id, e]));
  const usedPlaces = new Set<string>();

  for (const e of events) {
    const where = e.id;
    if (!eraIds.has(e.era)) err(where, `없는 시대: ${e.era}`);

    const { start, end } = e.date;
    if (end && dateKey(end) < dateKey(start)) err(where, '종료일이 시작일보다 앞선다');

    for (const loc of e.locations) {
      usedPlaces.add(loc.place);
      if (!placeIds.has(loc.place)) err(where, `없는 장소: ${loc.place}`);
    }
    for (const pid of e.people) {
      usedPeople.add(pid);
      if (!personIds.has(pid)) err(where, `없는 인물: ${pid}`);
    }
    if (new Set(e.people).size !== e.people.length) err(where, '같은 인물이 두 번 들어 있다');
    if (e.route && e.locations.length < 2) err(where, 'route가 true이면 장소가 2곳 이상이어야 한다');

    const seenRel = new Set<string>();
    for (const r of e.relations) {
      const key = `${r.type}:${r.target}`;
      if (seenRel.has(key)) err(where, `중복된 관계: ${key}`);
      seenRel.add(key);
      if (r.target === e.id) err(where, '자기 자신을 가리키는 관계');
      const target = byId.get(r.target);
      if (!target) {
        err(where, `없는 사건을 가리킨다: ${r.target}`);
        continue;
      }
      if (r.type === 'part_of') {
        // 하위 사건은 상위 사건 기간 안에 있어야 자연스럽다
        const pStart = dateKey(target.date.start);
        const pEnd = dateKey(target.date.end ?? target.date.start);
        const cStart = dateKey(start);
        // 월·일이 비어 있는 상위 사건 끝은 그 해/달 전체로 본다
        const pEndInclusive = pEnd + (target.date.end?.day ? 0 : target.date.end?.month ? 99 : 9999);
        if (cStart < pStart || cStart > pEndInclusive) warn(where, `상위 사건 ${r.target}의 기간 밖에서 시작한다`);
      }
      if ((r.type === 'followed_by' || r.type === 'led_to') && comparePrecise(target.date.start, start) < 0) {
        warn(where, `${r.type} 대상 ${r.target}이 이 사건보다 먼저 시작한다`);
      }
    }

    for (const s of e.sources) {
      if (s.kind === 'adapted' && s.url.includes('wikipedia.org')) {
        err(where, '위키백과(CC BY-SA) 문장은 비영리 라이선스(CC BY-NC-SA)와 호환되지 않아 adapted로 쓸 수 없다');
      }
    }
  }

  // part_of 순환 검사
  for (const e of events) {
    const chain = new Set<string>([e.id]);
    let cur: HistoryEvent | undefined = e;
    while (cur) {
      const parentId: string | undefined = cur.relations.find((r) => r.type === 'part_of')?.target;
      if (!parentId) break;
      if (chain.has(parentId)) {
        err(e.id, `part_of 관계가 순환한다: ${[...chain, parentId].join(' → ')}`);
        break;
      }
      chain.add(parentId);
      cur = byId.get(parentId);
    }
  }

  for (const p of places) if (!usedPlaces.has(p.id)) warn('places.json', `어느 사건도 쓰지 않는 장소: ${p.id}`);
  for (const p of people) if (!usedPeople.has(p.id)) warn('people.json', `어느 사건에도 연결되지 않은 인물: ${p.id}`);

  return issues;
}
