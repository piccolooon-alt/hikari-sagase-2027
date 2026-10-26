/* Blue light, 2027: bridge the shared festival route and self-contained illustrated cooking game. */
(() => {
  'use strict';
  const screen = document.getElementById('blue-preview');
  const frame = document.getElementById('blue-live-frame');
  const back = document.getElementById('blue-preview-back');
  if (!screen || !frame || !back) return;

  let entered = false, activeDay = 1;
  const page = new URL('blue-game/index.html', document.baseURI);

  function openDay(day) {
    activeDay = day === 2 ? 2 : 1;
    const url = new URL(page);
    url.searchParams.set('day', String(activeDay));
    // Versioned URL also refreshes previously cached app contents on Android.
    url.searchParams.set('v', '20261026-blueart1');
    frame.src = url.href;
  }

  window.addEventListener('message', event => {
    if (!entered || event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (!event.data || event.data.type !== 'hikari-blue-back') return;
    // Existing adventure app decides whether the user returns to light discovery or home.
    back.click();
  });

  window.HikariBlueGame = Object.freeze({
    enter(day) {
      entered = true;
      openDay(day);
    },
    leave() {
      entered = false;
      frame.removeAttribute('src'); // Release the embedded game timers on navigation.
    }
  });
})();
