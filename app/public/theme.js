// Applies the stored theme choice before the first paint, on the app and the pre-login pages
// alike: loaded as a plain blocking script in <head>, so the page never flashes in the wrong
// theme. A file of its own because the Content-Security-Policy allows no inline script. Without a
// stored choice nothing is set and the CSS follows the system's setting. The key and values are
// THEME_STORAGE_KEY and ThemeChoice in app/src/lib/theme.ts: change both. Type-checked with
// app/tsconfig.public.json.
(() => {
  try {
    const choice = localStorage.getItem('theme');
    if (choice === 'light' || choice === 'dark') document.documentElement.dataset.theme = choice;
  } catch {
    // Storage blocked (private mode, site data off): follow the system.
  }
})();
