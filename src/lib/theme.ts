/**
 * 화면 모드: 시스템 설정 따르기 / 밝게 / 어둡게.
 * 고른 값은 이 브라우저에 기억하고, <html data-theme="light|dark">로 적용한다.
 * 시스템 설정을 따를 때는 data-theme을 지워 CSS의 prefers-color-scheme이 정하게 한다.
 */
export type ThemePref = 'system' | 'light' | 'dark';

export const THEME_KEY = 'kht:theme';
const EVENT = 'kht-themechange';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {}
  return 'system';
}

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {}
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** 지금 실제로 어두운 화면인가 */
export function isDark(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** 모드가 바뀌면 (직접 바꾸거나 시스템 설정이 바뀌면) 알려 준다 */
export function onThemeChange(cb: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  window.addEventListener(EVENT, cb);
  media.addEventListener('change', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    media.removeEventListener('change', cb);
  };
}

export const NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
export const LABEL: Record<ThemePref, string> = { system: '시스템 설정', light: '밝게', dark: '어둡게' };
