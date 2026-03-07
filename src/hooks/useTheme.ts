import { useCallback, useEffect, useState } from 'react';

export type ThemePreset =
  | 'hp37000'
  | 'hp9845'
  | 'hp54600-new'
  | 'hp54600-aged'
  | 'paris'
  | 'iknowiletudown'
  | 'dynamicron-e180'
  | 'vhs-future-1976'
  | 'vhs-pixel-sunset'
  | 'basf-sm90'
  | 'vhs-t120-light';

const THEME_KEY = 'artemis-theme';
const THEME_ORDER: ThemePreset[] = [
  'hp37000',
  'hp9845',
  'hp54600-new',
  'hp54600-aged',
  'paris',
  'iknowiletudown',
  'dynamicron-e180',
  'vhs-future-1976',
  'vhs-pixel-sunset',
  'basf-sm90',
  'vhs-t120-light',
];

const THEME_CLASS_MAP: Record<ThemePreset, string> = {
  hp37000: 'theme-hp37000',
  hp9845: 'theme-hp9845',
  'hp54600-new': 'theme-hp54600-new',
  'hp54600-aged': 'theme-hp54600-aged',
  paris: 'theme-paris',
  iknowiletudown: 'theme-iknowiletudown',
  'dynamicron-e180': 'theme-dynamicron-e180',
  'vhs-future-1976': 'theme-vhs-future-1976',
  'vhs-pixel-sunset': 'theme-vhs-pixel-sunset',
  'basf-sm90': 'theme-basf-sm90',
  'vhs-t120-light': 'theme-vhs-t120-light',
};

const THEME_LABEL_MAP: Record<ThemePreset, string> = {
  hp37000: 'HP37000 信令分析仪',
  hp9845: 'HP9845 终端',
  'hp54600-new': 'HP54600 示波器（新机）',
  'hp54600-aged': 'HP54600 示波器（老化）',
  paris: 'Paris',
  iknowiletudown: 'I Know I Let You Down',
  'dynamicron-e180': 'Dynamicron E-180 VHS',
  'vhs-future-1976': 'VHS The Future Is Here',
  'vhs-pixel-sunset': 'VHS Pixel Sunset',
  'basf-sm90': 'BASF SM90',
  'vhs-t120-light': 'VHS T-120 Light',
};

const THEME_OPTIONS: Array<{ value: ThemePreset; label: string }> = THEME_ORDER.map((value) => ({
  value,
  label: THEME_LABEL_MAP[value],
}));

function getNextTheme(current: ThemePreset): ThemePreset {
  const currentIndex = THEME_ORDER.indexOf(current);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % THEME_ORDER.length : 0;
  return THEME_ORDER[nextIndex] ?? 'hp37000';
}

function getSystemTheme(): ThemePreset {
  if (typeof window === 'undefined' || !window.matchMedia) return 'hp37000';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'hp37000' : 'hp9845';
}

function isThemePreset(value: string | null): value is ThemePreset {
  return value === 'hp37000'
    || value === 'hp9845'
    || value === 'hp54600-new'
    || value === 'hp54600-aged'
    || value === 'paris'
    || value === 'iknowiletudown'
    || value === 'dynamicron-e180'
    || value === 'vhs-future-1976'
    || value === 'vhs-pixel-sunset'
    || value === 'basf-sm90'
    || value === 'vhs-t120-light';
}

function getStoredTheme(): ThemePreset | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(THEME_KEY);
  return isThemePreset(value) ? value : null;
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemePreset>(() => getStoredTheme() ?? getSystemTheme());
  const [hasManualPreference, setHasManualPreference] = useState<boolean>(() => getStoredTheme() !== null);
  const themeLabel = THEME_LABEL_MAP[theme];

  useEffect(() => {
    document.body.classList.remove(...Object.values(THEME_CLASS_MAP));
    document.body.classList.add(THEME_CLASS_MAP[theme]);
  }, [theme]);

  useEffect(() => {
    if (hasManualPreference || !window.matchMedia) return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'hp37000' : 'hp9845');
    };

    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [hasManualPreference]);

  const setThemePreset = useCallback((next: ThemePreset) => {
    setTheme(next);
    window.localStorage.setItem(THEME_KEY, next);
    setHasManualPreference(true);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = getNextTheme(prev);
      window.localStorage.setItem(THEME_KEY, next);
      return next;
    });
    setHasManualPreference(true);
  }, []);

  return { theme, themeLabel, themeOptions: THEME_OPTIONS, setThemePreset, toggleTheme };
}
