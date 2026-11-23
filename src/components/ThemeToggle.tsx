import { useEffect, useState } from 'react';
import { LABEL, NEXT, getThemePref, setThemePref, type ThemePref } from '../lib/theme.ts';

/** 화면 모드 버튼: 누를 때마다 시스템 설정 → 밝게 → 어둡게 순서로 바뀐다 */
export default function ThemeToggle() {
  // 서버에서 그릴 때는 알 수 없으므로 'system'으로 시작하고, 브라우저에서 저장된 값을 읽는다
  const [pref, setPref] = useState<ThemePref>('system');
  useEffect(() => setPref(getThemePref()), []);
  const next = NEXT[pref];
  return (
    <button
      type="button"
      className="header-link theme-toggle"
      onClick={() => {
        setThemePref(next);
        setPref(next);
      }}
      title={`화면 모드: ${LABEL[pref]} (누르면 ${LABEL[next]})`}
      aria-label={`화면 모드: ${LABEL[pref]}. 누르면 ${LABEL[next]}`}
    >
      <ThemeIcon pref={pref} />
      <span>{LABEL[pref]}</span>
    </button>
  );
}

export function ThemeIcon({ pref }: { pref: ThemePref }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {pref === 'light' && (
        <>
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
        </>
      )}
      {pref === 'dark' && <path d="M13.5 9.6A5.5 5.5 0 0 1 6.4 2.5a5.5 5.5 0 1 0 7.1 7.1z" />}
      {pref === 'system' && (
        <>
          <rect x="1.8" y="2.5" width="12.4" height="8.5" rx="1.4" />
          <path d="M5.5 13.5h5M8 11v2.5" />
        </>
      )}
    </svg>
  );
}
