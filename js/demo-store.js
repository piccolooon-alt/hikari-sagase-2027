/* Device-only preview data. No participant IDs, timestamps, location or network calls. */
(() => {
  'use strict';
  const prefix = 'hikari-sagase-2027:preview:v1:';
  const memory = new Map();
  const key = (day, collection) => `${prefix}day${day === 2 ? 2 : 1}:${collection}`;
  window.HikariDemoStore = Object.freeze({
    read(day, collection, fallback) {
      const name = key(day, collection);
      if (memory.has(name)) return memory.get(name);
      try {
        const raw = localStorage.getItem(name);
        if (raw !== null) return JSON.parse(raw);
      } catch (_) { /* Private mode or damaged local data: use this page's memory. */ }
      return fallback;
    },
    write(day, collection, value) {
      const name = key(day, collection);
      memory.set(name, value);
      try { localStorage.setItem(name, JSON.stringify(value)); return true; }
      catch (_) { return false; }
    },
    getMuted() {
      try { return localStorage.getItem(`${prefix}music-muted`) === 'true'; }
      catch (_) { return false; }
    },
    setMuted(value) {
      try { localStorage.setItem(`${prefix}music-muted`, String(value)); } catch (_) { /* Optional preference. */ }
    }
  });
})();
