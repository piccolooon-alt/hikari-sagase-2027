/* Browser checks for the published-project subpath. Runtime site has no npm dependency. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const playwright = require('playwright');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(__dirname, 'artifacts');
const prefix = '/hikari-sagase-2027/';
const engine = process.env.BROWSER || 'chromium';
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
let passed = 0;

function serverForProject() {
  return http.createServer((request, response) => {
    let requested;
    try { requested = decodeURIComponent(new URL(request.url, 'http://test.invalid').pathname); }
    catch { response.writeHead(400).end(); return; }
    if (requested === '/favicon.ico') { response.writeHead(204).end(); return; }
    if (!requested.startsWith(prefix)) { response.writeHead(404).end(); return; }
    const relative = requested.slice(prefix.length) || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || relative.split('/').some(piece => piece.startsWith('.'))) {
      response.writeHead(403).end(); return;
    }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) { response.writeHead(404).end(); return; }
      const headers = { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
      const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
      let start = 0, end = stat.size - 1;
      if (range) {
        start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2]));
        if (start > end) { response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return; }
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length'] = end - start + 1;
      response.writeHead(range ? 206 : 200, headers);
      if (request.method === 'HEAD') response.end();
      else fs.createReadStream(file, { start, end }).pipe(response);
    });
  });
}

async function run(name, callback) {
  try { await callback(); passed++; console.log(`PASS ${name}`); }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
async function active(page, id) {
  await page.waitForFunction(target => { const active = document.querySelector('.screen.active'); return active?.id === target && getComputedStyle(active).opacity === '1' && active.getAttribute('aria-hidden') === 'false'; }, id);
  // Let visibility inheritance reach newly displayed children, including reduced-motion transitions.
  if (id !== 'loading') await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('.screen.active').count(), 1);
}
async function resources(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
  });
  assert.equal(await page.evaluate(() => [...document.images].every(image => image.complete && image.naturalWidth > 0)), true);
  assert.equal(await page.evaluate(() => document.fonts.check('700 16px "M PLUS Rounded 1c"', '光をさがせ！')), true);
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'page must not scroll sideways');
}
async function snapshot(page, label) {
  await noOverflow(page);
  await page.screenshot({ path: path.join(artifacts, `${engine}-${label}.png`) });
}
function diagnostics(page, origin) {
  const problems = [];
  page.on('pageerror', error => problems.push(error.message));
  page.on('response', response => { if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`); });
  page.on('requestfailed', request => {
    // A browser can cancel an audio range request during navigation; that is expected.
    if (!request.failure()?.errorText.includes('ERR_ABORTED')) problems.push(`${request.failure()?.errorText}: ${request.url()}`);
  });
  page.on('request', request => { if (!request.url().startsWith(origin + '/')) problems.push(`Unexpected external request: ${request.url()}`); });
  return () => assert.deepEqual(problems, [], 'page errors or resource/network failures');
}

async function mobileFlow(browser, base, viewport) {
  // UA and touch profiles exercise responsive handling; the engine remains Chromium.
  const profile = viewport.width === 360 ? playwright.devices['Pixel 5'] : playwright.devices['iPhone 13'];
  const context = await browser.newContext({ viewport, userAgent: profile.userAgent, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    window.__privacyCalls = [];
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => { window.__privacyCalls.push('camera'); throw new Error('Camera must not be requested'); };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition = () => { window.__privacyCalls.push('GPS'); };
      navigator.geolocation.watchPosition = () => { window.__privacyCalls.push('GPS'); };
    }
  });
  const page = await context.newPage();
  const check = diagnostics(page, new URL(base).origin);
  const width = viewport.width;
  try {
    await run(`${width}px startup, original home and help navigation`, async () => {
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await active(page, 'loading');
      await active(page, 'welcome');
      await resources(page);
      await snapshot(page, `${width}-welcome`);
      await page.locator('#welcome [data-open-howto]').click();
      await active(page, 'howtopage');
      await snapshot(page, `${width}-howto`);
      await page.locator('#howto-back').click();
      await active(page, 'welcome');
      await page.locator('#btn-start').click();
      await active(page, 'home');
      const orbs = await page.locator('.orb-row [data-orb]').evaluateAll(elements => elements.map(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })));
      assert.equal(orbs.length, 4);
      assert.ok(orbs.every(orb => Math.abs(orb.y - orbs[0].y) < 2), 'four orbs remain in one row');
      assert.ok(orbs.every((orb, i) => !i || orb.x > orbs[i - 1].x), 'red blue yellow white ordering');
      for (const selector of ['#home-qr-scan', '#home-hintbook', '#home-shops', '#home .help-btn']) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box && box.y >= 0 && box.y + box.height <= viewport.height + 1, `${selector} must fit the viewport`);
      }
      await snapshot(page, `${width}-home`);
      await page.locator('#home-qr-scan').click(); await active(page, 'scan');
      await page.goBack(); await active(page, 'home');
      await page.locator('#home-qr-scan').click(); await active(page, 'scan');
      assert.match(await page.locator('#scan-status').innerText(), /カメラ.*使いません/);
      assert.equal(await page.locator('input[type="file"]').count(), 0);
      await snapshot(page, `${width}-scan`);
    });
    await run(`${width}px BGM continuity, red materials and local discovery`, async () => {
      await page.waitForFunction(() => !document.querySelector('#suzuran-bgm').paused && document.querySelector('#suzuran-bgm').currentTime > 0);
      const before = await page.locator('#suzuran-bgm').evaluate(audio => audio.currentTime);
      await page.locator('#scan-demo').click(); await active(page, 'discovered');
      assert.equal(await page.locator('#found-name').innerText(), 'あかの光');
      await snapshot(page, `${width}-discovered`);
      await page.locator('#found-play').click(); await active(page, 'red-preview');
      assert.equal(await page.locator('.falling-yoyo').count(), 6);
      assert.match(await page.locator('#red-character').getAttribute('src'), /approved_yukata_character\.png$/);
      assert.match(await page.locator('#red-preview .art').getAttribute('src'), /red_game_fixed_1918\.png$/);
      assert.equal(await page.locator('#red-canvas,#red-time,#red-lives').count(), 0);
      const originalX = await page.locator('#red-character').evaluate(image => image.getBoundingClientRect().x);
      await page.locator('#red-left').click();
      assert.ok(await page.locator('#red-character').evaluate(image => image.getBoundingClientRect().x) < originalX, 'position preview moves left');
      await page.locator('#red-right').click();
      await page.locator('#red-motion').click();
      assert.equal(await page.locator('#red-motion').getAttribute('aria-pressed'), 'true');
      await snapshot(page, `${width}-red`);
      assert.equal(await page.locator('#suzuran-bgm').evaluate(audio => audio.paused), false);
      await page.waitForFunction(time => document.querySelector('#suzuran-bgm').currentTime > time, before);
      await page.locator('#bgm-toggle').click();
      assert.equal(await page.locator('#suzuran-bgm').evaluate(audio => audio.paused), true);
      await page.locator('#red-preview-back').click(); await active(page, 'discovered');
      assert.equal(await page.locator('#suzuran-bgm').evaluate(audio => audio.paused), true, 'muted music stays muted across screens');
      await page.locator('#bgm-toggle').click();
      await page.waitForFunction(() => !document.querySelector('#suzuran-bgm').paused);
    });
    await run(`${width}px hints, day separation, safe text and reload persistence`, async () => {
      await page.locator('#found-hint').click(); await active(page, 'posthint');
      assert.equal(await page.locator('#hint-submit').isDisabled(), true);
      await page.locator('#hint-input').fill('木');
      assert.equal(await page.locator('#hint-submit').isDisabled(), true);
      await page.locator('#hint-input').fill('大きな木が目印かも！');
      await page.locator('#hint-submit').click(); await active(page, 'hintsent');
      await page.locator('#hint-openbook').click(); await active(page, 'hintbook');
      assert.match(await page.locator('#hintbook-list').innerText(), /大きな木/);
      await page.locator('[data-hint-tab="blue"]').click();
      assert.equal(await page.locator('.hint-book-entry').count(), 0);
      await page.locator('[data-hint-tab="red"]').click();
      await page.locator('#hint-day').selectOption('2');
      assert.equal(await page.locator('.hint-book-entry').count(), 0, 'day two must not contain day one hints');
      assert.match(await page.locator('#daylabel').textContent(), /2日目/);
      await page.locator('#hint-day').selectOption('1');
      assert.match(await page.locator('#hintbook-list').innerText(), /大きな木/);
      await page.reload(); await active(page, 'hintbook'); await resources(page);
      assert.match(await page.locator('#hintbook-list').innerText(), /大きな木/);
      await snapshot(page, `${width}-hints`);
      await page.locator('#hintbook-back').click(); await active(page, 'home');
      assert.match(await page.locator('[data-orb="0"] .orb-status').innerText(), /みつけた/);
    });
    await run(`${width}px shop name, one stamp and comment; no uploads`, async () => {
      await page.locator('#home-shops').click(); await active(page, 'shops');
      await page.locator('#shop-open-compose').click(); await active(page, 'shopcompose');
      assert.equal(await page.locator('input[type="file"]').count(), 0);
      assert.equal(await page.locator('[name="shop-stamp"]').count(), 4);
      await page.locator('#shop-name').fill('やきそば屋さん');
      assert.equal(await page.locator('#shop-submit').isDisabled(), true);
      const comment = '<img src=x onerror="window.injected=true">';
      await page.locator('#shop-comment').fill(comment);
      await page.locator('input[name="shop-stamp"][value="💕"]').check();
      assert.equal(await page.locator('[name="shop-stamp"]:checked').count(), 1);
      await snapshot(page, `${width}-shop-compose`);
      await page.locator('#shop-submit').click(); await active(page, 'shops');
      assert.equal(await page.locator('#shop-list .shop-card-icon').innerText(), '💕');
      assert.match(await page.locator('#shop-list').innerText(), /やきそば屋さん/);
      assert.equal(await page.locator('#shop-list img').count(), 0);
      await page.reload(); await active(page, 'shops');
      await page.locator('.shop-card').click(); await active(page, 'shopdetail');
      assert.equal(await page.locator('#shop-detail-comment').innerText(), comment);
      assert.equal(await page.evaluate(() => window.injected), undefined);
      await snapshot(page, `${width}-shop-detail`);
      await page.locator('#shopdetail-back').click(); await active(page, 'shops');
      await page.locator('#shops-home').click(); await active(page, 'home');
      await page.locator('#home .help-btn').click(); await active(page, 'howtopage');
      await page.locator('#howto-back').click(); await active(page, 'home');
      assert.deepEqual(await page.evaluate(() => window.__privacyCalls), []);
      check();
    });
  } finally { await context.close(); }
}

async function projectorFlow(browser, base) {
  await run('1920px projector corner order, independent monotonic counts and real assets', async () => {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const check = diagnostics(page, new URL(base).origin);
    try {
      await page.goto(`${base}projector.html`); await resources(page);
      assert.deepEqual(await page.locator('[data-counter]').allTextContents(), ['0', '0', '0', '0']);
      const phone = await context.newPage();
      await phone.goto(`${base}index.html#scan`);
      await phone.locator('#scan-demo').click(); await active(phone, 'discovered');
      await phone.close();
      assert.deepEqual(await page.locator('[data-counter]').allTextContents(), ['0', '0', '0', '0'], 'phone demo does not change projector counts, even in the same browser');
      const positions = await page.locator('.zone-counter').evaluateAll(elements => elements.map(el => {
        const box = el.getBoundingClientRect(); return { x: box.x, y: box.y };
      }));
      assert.ok(positions[0].x < positions[2].x && positions[0].y < positions[1].y);
      assert.ok(positions[1].x < positions[3].x && positions[2].y < positions[3].y);
      await page.locator('[data-color="0"]').click();
      assert.deepEqual(await page.locator('[data-counter]').allTextContents(), ['1', '0', '0', '0']);
      await page.locator('#sample').click();
      assert.deepEqual(await page.locator('[data-counter]').allTextContents(), ['6', '5', '5', '5']);
      await page.reload(); await resources(page);
      assert.deepEqual(await page.locator('[data-counter]').allTextContents(), ['6', '5', '5', '5']);
      const stage = await page.locator('#stage').boundingBox();
      assert.ok(Math.abs(stage.width / stage.height - 16 / 9) < 0.002, 'fixed 16:9 stage');
      await snapshot(page, '1920-projector');
      for (const width of [360, 390, 430]) {
        await page.setViewportSize({ width, height: 844 }); await noOverflow(page);
        await snapshot(page, `${width}-projector`);
      }
      check();
    } finally { await context.close(); }
  });
}

async function routeRegression(browser, base) {
  await run('blue discovery reload and day/color history do not create discoveries', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const check = diagnostics(page, new URL(base).origin);
    const savedFound = day => page.evaluate(value => window.HikariDemoStore.read(value, 'found', []), day);
    try {
      await page.goto(`${base}index.html#scan`);
      await page.locator('[data-demo-color="blue"]').click(); await active(page, 'discovered');
      assert.equal(await page.locator('#found-name').innerText(), 'あおの光');
      assert.deepEqual(await savedFound(1), ['blue']);
      await page.reload(); await active(page, 'discovered');
      assert.equal(await page.locator('#found-name').innerText(), 'あおの光', 'reload preserves the displayed color');
      assert.deepEqual(await savedFound(1), ['blue'], 'rendering a route must not discover red');
      await page.locator('#found-home').click(); await active(page, 'home');
      await page.locator('#home-hintbook').click(); await active(page, 'hintbook');
      await page.locator('#hint-day').selectOption('2');
      await page.locator('#hintbook-back').click(); await active(page, 'home');
      await page.locator('#home-qr-scan').click(); await active(page, 'scan');
      await page.locator('[data-demo-color="white"]').click(); await active(page, 'discovered');
      assert.deepEqual(await savedFound(2), ['white']);
      for (const screen of ['scan', 'home', 'hintbook', 'home', 'discovered']) {
        await page.goBack(); await active(page, screen);
      }
      assert.equal(await page.locator('#found-name').innerText(), 'あおの光');
      assert.match(await page.locator('#daylabel').textContent(), /1日目/);
      assert.deepEqual(await savedFound(1), ['blue']);
      assert.deepEqual(await savedFound(2), ['white'], 'history across days does not create a new discovery');
      check();
    } finally { await context.close(); }
  });
}

async function storageUnavailable(browser, base) {
  await run('blocked storage and reduced-motion preview remain usable', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
    });
    const page = await context.newPage();
    const check = diagnostics(page, new URL(base).origin);
    try {
      await page.goto(`${base}index.html#red`); await active(page, 'red-preview'); await resources(page);
      assert.equal(await page.locator('#red-motion').getAttribute('aria-pressed'), 'true');
      await page.goto(`${base}index.html#shopcompose`); await active(page, 'shopcompose');
      await page.locator('#shop-name').fill('おためし屋さん');
      await page.locator('#shop-comment').fill('きらきらしていたよ');
      await page.locator('#shop-submit').click(); await active(page, 'shops');
      await page.locator('#shop-toast').waitFor({ state: 'visible' });
      assert.match(await page.locator('#shop-toast').innerText(), /閉じると消えます/);
      await page.locator('#shops-home').click(); await active(page, 'home');
      await page.locator('#home-shops').click(); await active(page, 'shops');
      await page.locator('.shop-card').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('.shop-card-name')?.innerText === 'おためし屋さん');
      assert.match(await page.locator('#shop-list').innerText(), /おためし屋さん/);
      await page.goto(`${base}projector.html`); await resources(page);
      await page.locator('[data-color="0"]').click();
      assert.equal(await page.locator('[data-counter="0"]').innerText(), '1');
      assert.match(await page.locator('#projector-status').innerText(), /保存でき/);
      check();
    } finally { await context.close(); }
  });
}

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const resultPath = path.join(artifacts, `${engine}-results.json`);
  if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
  const server = serverForProject();
  let browser;
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}${prefix}`;
    assert.ok(playwright[engine], `Unknown browser engine: ${engine}`);
    const options = { headless: true };
    if (engine === 'chromium') {
      const system = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
      if (fs.existsSync(system)) options.executablePath = system;
      options.args = ['--no-sandbox'];
    }
    if (engine === 'webkit' && process.env.WEBKIT_EXECUTABLE_PATH) {
      assert.ok(fs.existsSync(process.env.WEBKIT_EXECUTABLE_PATH), 'WebKit executable must exist');
      options.executablePath = process.env.WEBKIT_EXECUTABLE_PATH;
    }
    browser = await playwright[engine].launch(options);
    for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await mobileFlow(browser, base, viewport);
    }
    await routeRegression(browser, base);
    await projectorFlow(browser, base);
    await storageUnavailable(browser, base);
    fs.writeFileSync(resultPath, JSON.stringify({ engine, browserVersion: browser.version(), passed, failed: 0, mobileWidths: [360, 390, 430], mobileProfiles: ['Android-like UA + touch', 'iPhone-like UA + touch'], note: 'Mobile profiles use the selected engine; they are not physical iOS/Android devices.' }, null, 2) + '\n');
    console.log(`${passed} scenarios passed (${engine}). Screenshots: tests/artifacts/`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})();
