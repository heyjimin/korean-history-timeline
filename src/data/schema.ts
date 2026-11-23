import { z } from 'zod';

/**
 * 한국사 연표 데이터 스키마.
 *
 * - 연도는 역사학 표기를 따른다: 기원전은 음수(BC 2333 → -2333), 0년은 없다.
 * - 조선 시대까지의 월·일은 대부분 음력이다. calendar 필드로 구분한다.
 * - 관계는 사건 쪽에 "나가는 방향"으로 적는다 (예: 전투 → part_of → 전쟁).
 */

const id = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id는 영문 소문자·숫자·하이픈(kebab-case)만 쓴다');

export const DatePoint = z
  .object({
    year: z.number().int().refine((y) => y !== 0, '0년은 없다 (BC 1년 다음은 AD 1년)'),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
  })
  .refine((d) => d.day === undefined || d.month !== undefined, '일(day)이 있으면 월(month)도 있어야 한다');

export const EventDate = z.object({
  start: DatePoint,
  end: DatePoint.optional(),
  /** 연도 자체가 추정치이면 true (예: "4세기경") */
  approximate: z.boolean().default(false),
  /** 월·일의 역법. 연도만 있으면 의미 없음 */
  calendar: z.enum(['lunar', 'solar']).default('lunar'),
});

export const RelationType = z.enum([
  /** 하위 사건: 전투 → 전쟁 */
  'part_of',
  /** 시간상 이어지는 후속 사건: 임진왜란 → 정유재란 */
  'followed_by',
  /** 원인 → 결과 */
  'led_to',
  /** 그 밖의 관련 */
  'related',
]);

export const Relation = z.object({
  type: RelationType,
  target: id,
  /** 관계에 대한 짧은 설명 (선택) */
  note: z.string().optional(),
});

export const EventLocation = z.object({
  place: id,
  role: z.enum(['main', 'start', 'via', 'end']).default('main'),
});

export const Source = z.object({
  name: z.string(),
  url: z.url(),
  /**
   * reference: 사실 확인용으로만 참고 (문장을 옮기지 않음)
   * adapted: 문장을 각색해서 씀 → 화면에 출처·라이선스를 표시해야 함.
   *          위키백과(CC BY-SA)는 비영리 조건과 호환되지 않으므로 adapted로 쓸 수 없다.
   */
  kind: z.enum(['reference', 'adapted']).default('reference'),
});

export const Category = z.enum(['정치', '전쟁', '외교', '경제', '사회', '문화', '제도']);

export const HistoryEvent = z.object({
  id,
  title: z.string().min(1),
  era: id,
  date: EventDate,
  /** core: 핵심 연표에도 표시, detail: 상세 연표에서만 표시 */
  importance: z.enum(['core', 'detail']),
  categories: z.array(Category).min(1),
  /** 수험생용 2~3문장 요약 */
  summary: z.string().min(1),
  /** 일반 독자용 긴 설명 (마크다운) */
  detail: z.string().optional(),
  tags: z.array(z.string()).default([]),
  locations: z.array(EventLocation).default([]),
  /** 경로가 있는 사건이면 locations의 순서대로 선을 잇는다 */
  route: z.boolean().default(false),
  relations: z.array(Relation).default([]),
  /** 관련 인물 (people.json의 id) */
  people: z.array(id).default([]),
  sources: z.array(Source).min(1),
});

export const EraFile = z.object({
  era: id,
  events: z.array(HistoryEvent),
});

export const Era = z.object({
  id,
  name: z.string(),
  start: z.number().int(),
  end: z.number().int().nullable(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});

export const Person = z.object({
  id,
  name: z.string(),
  /** 다른 이름 (호, 시호, 묘호 등). 검색에 쓴다 */
  aliases: z.array(z.string()).default([]),
  /** 태어난 해·죽은 해 (기원전은 음수). 모르면 비운다 */
  born: z.number().int().optional(),
  died: z.number().int().optional(),
  /** 생몰년이 추정이면 true */
  approximate: z.boolean().default(false),
  /** 한 줄 소개 (예: "조선 수군 장수") */
  role: z.string(),
  summary: z.string(),
});

export const Place = z.object({
  id,
  name: z.string(),
  historicalNames: z.array(z.string()).default([]),
  /** [위도, 경도] */
  coords: z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]),
  /** exact: 정확한 지점, approx: 대략적 위치, region: 넓은 지역 */
  precision: z.enum(['exact', 'approx', 'region']),
  modernRegion: z.string(),
});

export type DatePoint = z.infer<typeof DatePoint>;
export type EventDate = z.infer<typeof EventDate>;
export type RelationType = z.infer<typeof RelationType>;
export type HistoryEvent = z.infer<typeof HistoryEvent>;
export type Era = z.infer<typeof Era>;
export type Place = z.infer<typeof Place>;
export type Person = z.infer<typeof Person>;
