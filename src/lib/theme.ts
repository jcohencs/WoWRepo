export type Theme = 'light' | 'dark';

const KEY = 'parsecheck-theme';

/** The visitor's saved choice, else their system setting. */
export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be unavailable (private mode); fall back to the system setting.
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(theme: Theme, remember = false) {
  document.documentElement.dataset.theme = theme;
  if (!remember) return;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Not remembered; it still applies for this visit.
  }
}
