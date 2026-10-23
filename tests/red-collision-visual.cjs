/* Independent sprite/rendering regression. Uses natural spawns and ordinary pointer input only. */
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
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };

function serverForProject() {
  return http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://test.invalid').pathname;
    if (pathname === '/favicon.ico') return response.writeHead(204).end();
    if (!pathname.startsWith(prefix)) return response.writeHead(404).end();
    const file = path.resolve(root, decodeURIComponent(pathname.slice(prefix.length)) || 'index.html');
    if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) return response.writeHead(404).end();
      let start = 0, end = stat.size - 1;
      const headers = { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
      const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
      if (range) {
        start = Number(range[1]);
        if (range[2]) end = Math.min(end, Number(range[2]));
        if (start > end) return response.writeHead(416).end();
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length'] = end - start + 1;
      response.writeHead(range ? 206 : 200, headers);
      if (request.method === 'HEAD') response.end();
      else fs.createReadStream(file, { start, end }).pipe(response);
    });
  });
}

async function observeRendering(context) {
  await context.addInitScript(() => {
    let seed = 42;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const rect = element => {
      const r = element.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    window.__redDraws = [];
    window.__redContacts = [];
    const originalClear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.id === 'red-canvas') window.__redDraws = [];
      return originalClear.apply(this, args);
    };
    const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (this.canvas.id === 'red-canvas' && image.dataset?.yoyo) {
        const m = this.getTransform();
        window.__redDraws.push({ type: image.dataset.yoyo, args, matrix: { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f } });
      }
      return originalDraw.call(this, image, ...args);
    };
    const snapshot = state => ({
      width: state.width, height: state.height, elapsed: state.elapsed,
      status: state.status, lives: state.lives, invulnerable: state.invulnerable,
      hitFeedback: state.hitFeedback, impact: state.impact && { ...state.impact },
      player: { ...state.player }, yoyos: state.yoyos.map(yoyo => ({ ...yoyo }))
    });
    let api;
    Object.defineProperty(window, 'HikariRedModel', {
      configurable: true,
      get() { return api; },
      set(value) {
        api = { ...value, createGame(...args) {
          const game = value.createGame(...args);
          window.__redGameUnderTest = game;
          const originalStep = game.step;
          // Observe frame boundaries without changing state, rules, hazards, or elapsed time.
          game.step = function (seconds) {
            const before = snapshot(game.state);
            const canvas = document.getElementById('red-canvas');
            const arena = document.getElementById('red-arena');
            const rendered = {
              girl: rect(document.getElementById('red-character')),
              canvas: { ...rect(canvas), backingWidth: canvas.width, backingHeight: canvas.height },
              arena: { ...rect(arena), clientLeft: arena.clientLeft, clientTop: arena.clientTop, clientWidth: arena.clientWidth, clientHeight: arena.clientHeight },
              draws: window.__redDraws.map(draw => ({ ...draw, args: draw.args.slice(), matrix: { ...draw.matrix } }))
            };
            const result = originalStep(seconds);
            if (before.lives !== game.state.lives) window.__redContacts.push({ before, after: snapshot(game.state), ...rendered });
            return result;
          };
          return game;
        } };
      }
    });
  });
}

async function ready(page, base) {
  await page.goto(`${base}index.html#red`);
  await page.waitForFunction(() => {
    const screen = document.querySelector('#red-preview');
    return screen.classList.contains('active') && getComputedStyle(screen).opacity === '1' && !document.querySelector('#red-start').disabled;
  });
  await page.evaluate(async () => {
    await Promise.all([...document.images].map(image => image.decode()));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.locator('#red-start').tap();
  const initial = await page.evaluate(() => {
    const canvas = document.querySelector('#red-canvas').getBoundingClientRect();
    const state = window.__redGameUnderTest.state;
    return { x: canvas.left + state.player.x / state.width * canvas.width, y: canvas.top + (state.player.top + state.player.height * .5) / state.height * canvas.height };
  });
  if (engine === 'chromium') {
    // Exercise the real touch/pointer path on the Android profile, including pointer capture.
    page.collisionTouch = await page.context().newCDPSession(page);
    await page.collisionTouch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...initial, id: 1 }] });
  } else {
    await page.mouse.move(initial.x, initial.y);
    await page.mouse.down();
  }
}

async function steerToNaturalContact(page, region) {
  for (let i = 0; i < 450; i++) {
    const target = await page.evaluate(wanted => {
      const state = window.__redGameUnderTest.state;
      if (window.__redContacts.length) return { hit: true };
      const yoyo = state.yoyos.find(item => item.id === 0);
      if (!yoyo) return null;
      // Targeting may read the live model. The collision oracle below uses original PNG alpha
      // and measured rendering transforms, not playerBody or the model's collision mask.
      const ball = window.HikariRedModel.yoyoBody(yoyo);
      if (wanted === 'torso' && !window.__redTransparentSample &&
          ball.y > state.player.top + state.player.height * .04 &&
          ball.y < state.player.top + state.player.height * .08) {
        const girl = document.querySelector('#red-character').getBoundingClientRect();
        const canvasElement = document.querySelector('#red-canvas');
        const canvas = canvasElement.getBoundingClientRect();
        window.__redTransparentSample = {
          lives: state.lives, elapsed: state.elapsed,
          girl: { left: girl.left, top: girl.top, width: girl.width, height: girl.height },
          canvas: { left: canvas.left, top: canvas.top, width: canvas.width, height: canvas.height, backingWidth: canvasElement.width, backingHeight: canvasElement.height },
          draw: window.__redDraws.find(item => item.type === yoyo.type),
          yoyo: { ...yoyo }
        };
      }
      const localX = wanted === 'head' ? .62 : .04;
      const arrivalY = state.player.top + state.player.height * (wanted === 'head' ? .05 : .45);
      const time = Math.max(0, (arrivalY - ball.radius - ball.y) / yoyo.vy);
      const logical = Math.max(state.player.width / 2, Math.min(state.width - state.player.width / 2,
        ball.x + yoyo.vx * time + (.5 - localX) * state.player.width));
      const canvas = document.querySelector('#red-canvas').getBoundingClientRect();
      return { x: canvas.left + logical / state.width * canvas.width, y: canvas.top + (state.player.top + state.player.height * .5) / state.height * canvas.height };
    }, region);
    if (target?.hit) return;
    if (target) {
      if (page.collisionTouch) await page.collisionTouch.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: target.x, y: target.y, id: 1 }]
      });
      else await page.mouse.move(target.x, target.y);
    }
    await page.clock.runFor(20);
  }
  throw new Error(`No natural ${region} contact within nine seconds`);
}

async function spriteOverlapEvidence(page, region) {
  return page.evaluate(wanted => {
    const event = window.__redContacts[0];
    const removed = event.before.yoyos.filter(yoyo => !event.after.yoyos.some(item => item.id === yoyo.id));
    if (removed.length !== 1) throw new Error('Expected exactly one removed hit hazard');
    const yoyo = removed[0];
    if (yoyo.id !== 0) throw new Error(`Unexpected hazard ${yoyo.id} reached the player before the targeted natural spawn`);
    const draw = event.draws.find(item => item.type === yoyo.type);
    if (!draw) throw new Error('Hit hazard was not drawn in the previous real animation frame');
    const canvas = event.canvas;
    const scaleX = canvas.width / canvas.backingWidth, scaleY = canvas.height / canvas.backingHeight;
    const renderedCenter = { x: canvas.left + draw.matrix.e * scaleX, y: canvas.top + draw.matrix.f * scaleY };
    const expectedCenter = { x: canvas.left + yoyo.x / event.before.width * canvas.width, y: canvas.top + yoyo.y / event.before.height * canvas.height };
    const girl = document.getElementById('red-character');
    const r = girl.getBoundingClientRect();
    const expectedGirl = {
      left: canvas.left + (event.after.player.x - event.after.player.width / 2) / event.after.width * canvas.width,
      top: canvas.top + event.after.player.top / event.after.height * canvas.height,
      width: event.after.player.width / event.after.width * canvas.width,
      height: event.after.player.height / event.after.height * canvas.height
    };
    const girlError = Math.max(...Object.keys(expectedGirl).map(key => Math.abs(r[key] - expectedGirl[key])));
    const centerError = Math.hypot(renderedCenter.x - expectedCenter.x, renderedCenter.y - expectedCenter.y);
    const dt = event.after.elapsed - event.before.elapsed;
    // The game removes a hit hazard before the next paint. Advance its last measured draw
    // matrix by that one frame; this is not a test-injected or repositioned hazard.
    const angle = yoyo.spin * dt, cos = Math.cos(angle), sin = Math.sin(angle), m = draw.matrix;
    const next = {
      a: m.a * cos + m.c * sin, b: m.b * cos + m.d * sin,
      c: -m.a * sin + m.c * cos, d: -m.b * sin + m.d * cos,
      e: m.e + yoyo.vx * dt * canvas.backingWidth / event.before.width,
      f: m.f + yoyo.vy * dt * canvas.backingHeight / event.before.height
    };
    const image = document.querySelector(`#red-sprite-assets [data-yoyo="${yoyo.type}"]`);
    const [dx, dy, width, height] = draw.args;
    function alphaOverlap(girlRect, canvasRect, matrix, drawArgs) {
      const resolution = 4;
      function layer() {
        const element = document.createElement('canvas');
        element.width = Math.ceil(innerWidth * resolution); element.height = Math.ceil(innerHeight * resolution);
        return element;
      }
      const girlLayer = layer(), ballLayer = layer();
      const girlBrush = girlLayer.getContext('2d'), ballBrush = ballLayer.getContext('2d');
      const sx = canvasRect.width / canvasRect.backingWidth, sy = canvasRect.height / canvasRect.backingHeight;
      girlBrush.scale(resolution, resolution);
      girlBrush.drawImage(girl, girlRect.left, girlRect.top, girlRect.width, girlRect.height);
      ballBrush.setTransform(resolution * sx * matrix.a, resolution * sy * matrix.b,
        resolution * sx * matrix.c, resolution * sy * matrix.d,
        resolution * (canvasRect.left + sx * matrix.e), resolution * (canvasRect.top + sy * matrix.f));
      const [x, y, w, h] = drawArgs;
      // Only the opaque lower half of the rubber-ball PNG is used as this oracle. This
      // excludes its trailing string entirely and is independent of YOYO_BODIES constants.
      ballBrush.drawImage(image, 0, image.naturalHeight / 2, image.naturalWidth, image.naturalHeight / 2,
        x, y + h / 2, w, h / 2);
      const a = girlBrush.getImageData(0, 0, girlLayer.width, girlLayer.height).data;
      const b = ballBrush.getImageData(0, 0, ballLayer.width, ballLayer.height).data;
      let pixels = 0, headPixels = 0, torsoPixels = 0, minY = Infinity, maxY = -Infinity, sumX = 0, sumY = 0;
      for (let i = 3; i < a.length; i += 4) if (a[i] >= 100 && b[i] >= 100) {
        const pixel = (i - 3) / 4, px = (pixel % girlLayer.width + .5) / resolution, py = (Math.floor(pixel / girlLayer.width) + .5) / resolution;
        const localY = (py - girlRect.top) / girlRect.height;
        pixels++; sumX += px; sumY += py;
        if (localY < .3) headPixels++;
        if (localY > .3 && localY < .7) torsoPixels++;
        minY = Math.min(minY, localY); maxY = Math.max(maxY, localY);
      }
      const corners = [[x, y + h / 2], [x + w, y + h / 2], [x, y + h], [x + w, y + h]].map(([px, py]) => ({
        x: canvasRect.left + (matrix.a * px + matrix.c * py + matrix.e) * sx,
        y: canvasRect.top + (matrix.b * px + matrix.d * py + matrix.f) * sy
      }));
      const rectangleOverlap = Math.min(girlRect.left + girlRect.width, Math.max(...corners.map(p => p.x))) > Math.max(girlRect.left, Math.min(...corners.map(p => p.x))) &&
        Math.min(girlRect.top + girlRect.height, Math.max(...corners.map(p => p.y))) > Math.max(girlRect.top, Math.min(...corners.map(p => p.y)));
      return { pixels, headPixels, torsoPixels, minY, maxY, centroid: pixels ? { x: sumX / pixels, y: sumY / pixels } : null, rectangleOverlap };
    }
    const overlap = alphaOverlap(r, canvas, next, draw.args);
    const sample = window.__redTransparentSample;
    const transparentApproach = sample && { lives: sample.lives, elapsed: sample.elapsed, ...alphaOverlap(sample.girl, sample.canvas, sample.draw.matrix, sample.draw.args) };
    const feedback = document.querySelector('#red-hit-effect');
    const feedbackRect = feedback.getBoundingClientRect();
    const impact = event.after.impact;
    const impactCSS = impact && { x: canvas.left + impact.x / event.after.width * canvas.width, y: canvas.top + impact.y / event.after.height * canvas.height };
    return {
      region: wanted, hazard: { id: yoyo.id, type: yoyo.type, direction: yoyo.direction, size: yoyo.size },
      frameSeconds: dt, elapsed: event.after.elapsed, centerError, girlError,
      overlapPixelsAt4x: overlap.pixels, overlapGirlY: { min: overlap.minY, max: overlap.maxY },
      overlapHeadPixels: overlap.headPixels, overlapTorsoPixels: overlap.torsoPixels,
      overlapCentroid: overlap.centroid, transparentApproach,
      impactCSS, beforeLives: event.before.lives, afterLives: event.after.lives,
      remaining: document.querySelector('#red-lives').dataset.remaining,
      hearts: document.querySelector('#red-lives').textContent,
      feedback: { hidden: feedback.hidden, width: feedbackRect.width, height: feedbackRect.height },
      invulnerability: event.after.invulnerable,
      girlRect: { left: r.left, top: r.top, width: r.width, height: r.height },
      canvasRect: canvas, arenaRect: event.arena,
      drawnSize: { width, height }
    };
  }, region);
}

async function runProfile(browser, base, viewport) {
  const profile = viewport.width === 360 ? playwright.devices['Pixel 5'] : playwright.devices['iPhone 13'];
  const results = [];
  for (const region of ['head', 'torso']) {
    // Playwright's virtual clock applies across pages in a context. Keep each scenario
    // isolated so a prior paused clock cannot freeze the next page's initial layout.
    const context = await browser.newContext({ viewport, userAgent: profile.userAgent, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await observeRendering(context);
    try {
      const page = await context.newPage();
      const problems = [];
      page.on('pageerror', error => problems.push(error.message));
      try {
        await ready(page, base);
        await steerToNaturalContact(page, region);
        const evidence = await spriteOverlapEvidence(page, region);
        fs.writeFileSync(path.join(artifacts, `${engine}-${viewport.width}-collision-${region}-evidence.json`), JSON.stringify(evidence, null, 2) + '\n');
        await page.screenshot({ path: path.join(artifacts, `${engine}-${viewport.width}-collision-${region}.png`) });
        assert.equal(evidence.beforeLives, 3);
        assert.equal(evidence.afterLives, 2, 'one naturally arriving body contact consumes exactly one life');
        assert.equal(evidence.remaining, '2', 'HUD changes in the same painted frame as the hit');
        assert.equal((evidence.hearts.match(/♥/g) || []).length, 2);
        assert.equal((evidence.hearts.match(/♡/g) || []).length, 1);
        assert.ok(evidence.girlError < 1, `DOM girl and logical coordinates differ by ${evidence.girlError}px`);
        assert.ok(evidence.centerError < .1, `actual canvas draw and hazard center differ by ${evidence.centerError}px`);
        assert.ok(evidence.frameSeconds > 0 && evidence.frameSeconds < .04, 'contact evidence comes from consecutive actual animation frames');
        assert.equal(evidence.drawnSize.width, evidence.hazard.size);
        assert.equal(evidence.drawnSize.height, evidence.hazard.size);
        assert.ok(evidence.overlapPixelsAt4x > 0, 'original opaque girl and rubber-ball pixels actually overlap at contact');
        if (region === 'head') assert.ok(evidence.overlapGirlY.max < .3, 'regression hits the visible head, above the former torso circle');
        else {
          assert.ok(evidence.overlapTorsoPixels > 0 && evidence.overlapGirlY.max < .7, 'natural contact reaches visible torso/arm pixels');
          const impactY = (evidence.impactCSS.y - evidence.girlRect.top) / evidence.girlRect.height;
          assert.ok(impactY > .3 && impactY < .7, 'collision impact is on the visible torso/arm area');
          assert.equal(evidence.transparentApproach?.lives, 3, 'transparent approach does not take a life');
          assert.equal(evidence.transparentApproach.rectangleOverlap, true, 'image rectangles really overlap during the transparent approach');
          assert.equal(evidence.transparentApproach.pixels, 0, 'independent original PNG alpha confirms the overlapping rectangle area is transparent');
        }
        assert.equal(evidence.feedback.hidden, false, 'small hit effect is shown on the first hit frame');
        assert.ok(evidence.feedback.width > 0 && evidence.feedback.width < 80 && evidence.feedback.height < 80);
        assert.ok(evidence.invulnerability > 1.05 && evidence.invulnerability <= 1.1, 'hit starts approximately 1.1 seconds of grace');
        const opacity = [];
        for (let i = 0; i < 8; i++) {
          opacity.push(await page.locator('#red-character').evaluate(el => Number(getComputedStyle(el).opacity)));
          await page.clock.runFor(40);
        }
        assert.ok(Math.min(...opacity) < .8 && Math.max(...opacity) > .8, `girl visibly blinks after a hit: ${opacity}`);
        evidence.blinkOpacity = opacity;
        for (let i = 0; i < 40; i++) {
          const state = await page.evaluate(() => ({ elapsed: window.__redGameUnderTest.state.elapsed, lives: window.__redGameUnderTest.state.lives, invulnerable: window.__redGameUnderTest.state.invulnerable }));
          if (state.elapsed - evidence.elapsed >= 1) { evidence.graceAfterOneSecond = state; break; }
          assert.equal(state.lives, 2, 'overlap during grace never takes another life');
          await page.clock.runFor(20);
        }
        assert.equal(evidence.graceAfterOneSecond?.lives, 2);
        assert.ok(evidence.graceAfterOneSecond.invulnerable > 0 && evidence.graceAfterOneSecond.invulnerable < .15);
        if (page.collisionTouch) await page.collisionTouch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        else await page.mouse.up();
        await page.locator('#red-pause').tap();
        const frozen = await page.evaluate(() => window.__redGameUnderTest.state.elapsed);
        await page.clock.runFor(500);
        assert.equal(await page.evaluate(() => window.__redGameUnderTest.state.elapsed), frozen);
        await page.locator('#red-resume').tap();
        assert.equal(await page.evaluate(() => window.__redGameUnderTest.state.status), 'playing');
        assert.deepEqual(problems, []);
        results.push({ viewport, profile: viewport.width === 360 ? 'Android-like UA + touch' : 'iPhone-like UA + touch', ...evidence });
        console.log(`PASS ${engine} ${viewport.width}px rendered ${region} contact, immediate HUD, blink/effect, 1.1s grace and touch pause/resume`);
      } finally { await page.close(); }
    } finally { await context.close(); }
  }
  return results;
}

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const resultPath = path.join(artifacts, `${engine}-collision-results.json`);
  if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
  const server = serverForProject();
  let browser;
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const options = { headless: true };
    if (engine === 'chromium') { options.executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium'; options.args = ['--no-sandbox']; }
    if (engine === 'webkit' && process.env.WEBKIT_EXECUTABLE_PATH) options.executablePath = process.env.WEBKIT_EXECUTABLE_PATH;
    browser = await playwright[engine].launch(options);
    const results = [];
    for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) results.push(...await runProfile(browser, `http://127.0.0.1:${server.address().port}${prefix}`, viewport));
    fs.writeFileSync(resultPath, JSON.stringify({ engine, browserVersion: browser.version(), passed: results.length, failed: 0, note: 'Actual browser engine with mobile UA/touch emulation; physical devices were not used. Natural default-rule spawns only; original sprite alpha and captured DOM/canvas transforms form the independent collision oracle.', results }, null, 2) + '\n');
    console.log(`${results.length} rendered collision scenarios passed (${engine}).`);
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { if (browser) await browser.close(); server.close(); }
})();
