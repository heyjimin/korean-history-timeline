/**
 * 데이터 검증: npm run validate
 * 오류가 있으면 종료 코드 1로 끝나서 빌드·배포가 멈춘다. 경고는 표시만 한다.
 */
import { loadDataset } from '../src/data/load.ts';

const { dataset, issues } = loadDataset();
const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warning');

for (const i of [...errors, ...warnings]) {
  const mark = i.level === 'error' ? '✖' : '⚠';
  console.log(`${mark} ${i.where}: ${i.message}`);
}

const core = dataset.events.filter((e) => e.importance === 'core').length;
console.log(
  `\n사건 ${dataset.events.length}건 (핵심 ${core}건) · 시대 ${dataset.eras.length}개 · 장소 ${dataset.places.length}곳 · 인물 ${dataset.people.length}명` +
    ` · 오류 ${errors.length} · 경고 ${warnings.length}`,
);

if (errors.length > 0) process.exit(1);
