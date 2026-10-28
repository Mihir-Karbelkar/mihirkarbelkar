export type Theme = 'light' | 'dark';
const COLORS: Record<Theme, string> = { light: '#fbf9f7', dark: '#1c1727' };
export const currentTheme = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
/** Applies and remembers a theme; the nav toggle listens for the event to update its label. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute('content', COLORS[theme]));
  try {
    localStorage.setItem('portfolio-theme', theme);
  } catch {}
  dispatchEvent(new CustomEvent('portfolio:theme', { detail: theme }));
}
