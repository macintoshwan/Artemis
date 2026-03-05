import { useCallback, useEffect, useState } from 'react';

export type ThemePreset =
  | 'hp37000'
  | 'hp9845'
  | 'hp54600-new'
  | 'hp54600-aged'
  | 'paris'
  | 'iknowiletudown';

const THEME_KEY = 'artemis-theme';
const THEME_ORDER: ThemePreset[] = [
  'hp37000',
  'hp9845',
  'hp54600-new',
  'hp54600-aged',
  'paris',
  'iknowiletudown',
];

const THEME_CLASS_MAP: Record<ThemePreset, string> = {
  hp37000: 'theme-hp37000',
  hp9845: 'theme-hp9845',
  'hp54600-new': 'theme-hp54600-new',
  'hp54600-aged': 'theme-hp54600-aged',
  paris: 'theme-paris',
  iknowiletudown: 'theme-iknowiletudown',
};

const THEME_LABEL_MAP: Record<ThemePreset, string> = {
  hp37000: 'HP37000 信令分析仪',
  hp9845: 'HP9845 终端',
  'hp54600-new': 'HP54600 示波器（新机）',
  'hp54600-aged': 'HP54600 示波器（老化）',
  paris: 'Paris',
  iknowiletudown: 'I Know I Let You Down',
};

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
    || value === 'iknowiletudown';
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

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = getNextTheme(prev);
      window.localStorage.setItem(THEME_KEY, next);
      return next;
    });
    setHasManualPreference(true);
  }, []);

  return { theme, themeLabel, toggleTheme };
}
