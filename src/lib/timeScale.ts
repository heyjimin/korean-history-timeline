import type { DatePoint, Era, EventDate } from '../data/schema.ts';

/**
 * 시대별 축척(piecewise linear) 시간 척도.
 *
 * 4천 년이 넘는 기간을 한 축에 그대로 놓으면 사건이 몰린 근현대는 점 하나가 되고
 * 고조선은 텅 빈 공간이 된다. 그래서 시대 경계마다 구간을 나누고,
 * 구간마다 "얼마나 길게 보여줄지(units)"를 따로 정해 그 안에서만 선형으로 늘린다.
 *
 * 내부 계산은 연속 시간 t를 쓴다. 0년이 없으므로 기원전 n년은 t = -n + 1
 * (BC 1년 = 0, AD 1년 = 1)로 바꿔 빈틈 없이 잇는다.
 */

export interface Segment {
  start: number; // t
  end: number; // t
  units: number; // 화면에서 차지하는 상대 길이
  offset: number; // 앞 구간들의 units 합
}

export function yearToT(year: number): number {
  return year < 0 ? year + 1 : year;
}

export function tToYear(t: number): number {
  const y = Math.floor(t);
  return y <= 0 ? y - 1 : y;
}

/** 날짜의 시작 시점 */
export function pointToT(d: DatePoint): number {
  return yearToT(d.year) + ((d.month ?? 1) - 1) / 12 + ((d.day ?? 1) - 1) / 365;
}

/** 날짜의 끝 시점: 연도만 있으면 그 해 끝, 월까지 있으면 그 달 끝 */
export function pointEndToT(d: DatePoint): number {
  const base = pointToT(d);
  if (d.month === undefined) return base + 1;
  if (d.day === undefined) return base + 1 / 12;
  return base + 1 / 365;
}

export function eventSpan(date: EventDate): [number, number] {
  const start = pointToT(date.start);
  const end = date.end ? pointEndToT(date.end) : start;
  return [start, end];
}

/**
 * 구간 길이 = 기간의 로그 + 사건 수.
 * 사건이 많은 구간일수록 넓어지므로, 데이터가 늘어나면 축척이 저절로 맞춰진다.
 */
export function buildSegments(eras: Era[], eventTimes: number[], now = new Date().getFullYear()): Segment[] {
  const points = new Set<number>();
  for (const e of eras) {
    points.add(yearToT(e.start));
    points.add(yearToT(e.end ?? now + 1));
  }
  const sorted = [...points].sort((a, b) => a - b);
  const segments: Segment[] = [];
  let offset = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]!;
    const end = sorted[i + 1]!;
    const count = eventTimes.filter((t) => t >= start && t < end).length;
    const units = 20 * Math.log10(end - start + 1) + 4 * count;
    segments.push({ start, end, units, offset });
    offset += units;
  }
  return segments;
}

export class TimeScale {
  readonly totalUnits: number;
  constructor(
    readonly segments: Segment[],
    /** 확대 1배일 때 units 하나의 픽셀 수 */
    readonly pxPerUnit: number,
  ) {
    const last = segments[segments.length - 1];
    this.totalUnits = last ? last.offset + last.units : 0;
  }

  get width(): number {
    return this.totalUnits * this.pxPerUnit;
  }

  get domain(): [number, number] {
    return [this.segments[0]!.start, this.segments[this.segments.length - 1]!.end];
  }

  segmentAt(t: number): Segment {
    const segs = this.segments;
    if (t <= segs[0]!.start) return segs[0]!;
    for (const s of segs) if (t < s.end) return s;
    return segs[segs.length - 1]!;
  }

  /** 확대 1배 기준 픽셀 위치 */
  x(t: number): number {
    const s = this.segmentAt(t);
    const clamped = Math.min(Math.max(t, s.start), s.end);
    return (s.offset + ((clamped - s.start) / (s.end - s.start)) * s.units) * this.pxPerUnit;
  }

  invert(x: number): number {
    const u = x / this.pxPerUnit;
    for (const s of this.segments) {
      if (u < s.offset + s.units) return s.start + ((u - s.offset) / s.units) * (s.end - s.start);
    }
    return this.domain[1];
  }

  /** 확대 1배에서 해당 구간의 1년당 픽셀 */
  pxPerYear(s: Segment): number {
    return (s.units * this.pxPerUnit) / (s.end - s.start);
  }
}

export interface Tick {
  t: number;
  label: string;
}

const STEPS = [1 / 12, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 50000, 100000, 500000];

export function formatTickYear(year: number): string {
  return year < 0 ? `BC ${-year}` : `${year}`;
}

/**
 * 화면에 보이는 범위의 눈금. 구간마다 축척이 다르므로 구간별로 간격을 고른다.
 * k: 확대 배율, x0/x1: 확대 1배 기준으로 바꾼 화면 좌우 끝 픽셀.
 */
export function ticks(scale: TimeScale, k: number, x0: number, x1: number, minGapPx = 90): Tick[] {
  const out: Tick[] = [];
  let lastX = -Infinity;
  for (const s of scale.segments) {
    const sx0 = scale.x(s.start);
    const sx1 = scale.x(s.end);
    if (sx1 < x0 || sx0 > x1) continue;
    const pxPerYear = scale.pxPerYear(s) * k;
    const step = STEPS.find((st) => st * pxPerYear >= minGapPx) ?? STEPS[STEPS.length - 1]!;
    const from = Math.max(s.start, scale.invert(x0));
    const to = Math.min(s.end, scale.invert(x1));

    if (step >= 1) {
      // 달력 연도 기준으로 깔끔한 배수 (BC 100, BC 50, 1, 50, 100 ...)
      const yFrom = tToYear(from);
      const yTo = tToYear(to);
      for (let y = Math.ceil(yFrom / step) * step; y <= yTo; y += step) {
        const year = y === 0 ? 1 : y;
        const t = yearToT(year);
        if (t < s.start || t >= s.end) continue;
        const px = scale.x(t) * k;
        if (px - lastX < minGapPx * 0.7) continue;
        out.push({ t, label: formatTickYear(year) });
        lastX = px;
      }
    } else {
      for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
        const tt = Math.round(t * 12) / 12;
        if (tt < s.start || tt >= s.end) continue;
        const px = scale.x(tt) * k;
        if (px - lastX < minGapPx * 0.7) continue;
        const year = tToYear(tt);
        const month = Math.round((tt - Math.floor(tt)) * 12) + 1;
        out.push({ t: tt, label: month === 1 ? formatTickYear(year) : `${year}.${month}` });
        lastX = px;
      }
    }
  }
  return out;
}
