// Playwright 画面テスト： node tests/screens.js   （../tools の Playwright を読み取り専用で使用）
// タイトル → 狙う（実マウスのドラッグ）→ 投げる（実クリック）→ 着弾で黒くなる → 5個投げ切る → 結果カード、をスクリーンショット付きで確認。
// 加えて trivial strategy（何もしない／同じ場所に5個／全部外す）を実画面で確認する。
const path = require('path');
const fs = require('fs');
// Playwright：app/node_modules の playwright-core＋インストール済みChromeを優先し、無ければ従来の ../tools の playwright
const LOCAL_PW = path.resolve(__dirname, '../node_modules/playwright-core');
const useLocal = fs.existsSync(LOCAL_PW);
const { chromium } = require(useLocal ? LOCAL_PW : path.resolve(__dirname, '../../tools/node_modules/playwright'));
const LAUNCH = useLocal ? { channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {};

const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '../index.html');
const checks = [], errors = [], requests = [];
const log = (...a) => console.log(...a);
const check = (name, ok, detail) => { checks.push({ name, ok }); log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? '  ' + detail : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage({ viewport: { width: 390, height: 693 } });   // 9:16
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) requests.push(r.url()); });
  const S = () => page.evaluate(() => window.__bf.state());
  const shot = async name => { await page.screenshot({ path: path.join(OUT, name + '.png') }); log('    [shot] ' + name + '.png'); };
  const waitPhase = (ph, timeout = 120000) => page.waitForFunction(p => [].concat(p).includes(window.__bf.state().phase), ph, { timeout, polling: 50 });
  const throwAndLand = async (useButton = true) => {
    const before = (await S()).thrown;
    if (useButton) await page.click('#throwBtn'); else await page.evaluate(() => __bf.throwBall());
    await page.waitForFunction(n => window.__bf.state().thrown > n, before, { timeout: 120000, polling: 30 });
    await waitPhase(['aim', 'ending', 'result']);
    return S();
  };

  // 回転速度の実測：aim 中に角度とシミュレーション時間を2回読み、Δangle / ΔsimTime を返す（ヘッドレスは ~1fps で dt が上限 0.05 に張り付くので壁時計ではなくゲーム内時間で割る）
  const measureSpeed = async (minSim = 0.25) => {
    const a = await S();
    await page.waitForFunction(([t0, m]) => window.__bf.state().simTime - t0 >= m, [a.simTime, minSim], { timeout: 120000, polling: 50 });
    const b = await S();
    if (a.phase !== 'aim' || b.phase !== 'aim' || a.paused || b.paused) throw new Error('measureSpeed: not in running aim phase');
    return (b.angle - a.angle) / (b.simTime - a.simTime);
  };

  // v5：描画に使われる文字の回転（wordGroup.matrixWorld から復元、(-π,π] に折り返し）を rAF ごとにページ内でサンプリングし、
  // 折り返しを戻して（unwrap）角速度を出す。時間軸は ゲーム内時間 simTime と 壁時計 performance.now の両方。
  // 1フレームの dt は 0.05 s が上限なので 8.8 rad/s でも 1フレームの回転は ≤ 0.44 rad < π → unwrap は一意（エイリアス無し）。
  const sampleRotation = (frames = 8) => page.evaluate(n => new Promise(res => {
    const out = [];
    (function f() { const st = __bf.state(); out.push({ a: __bf.renderedAngle(), sim: st.simTime, t: performance.now(), ph: st.phase, gp: st.gaugePhase, paused: st.paused });
      if (out.length < n) requestAnimationFrame(f); else res(out); })();
  }), frames);
  const analyse = smp => {
    let tot = 0, maxStep = 0;
    for (let i = 1; i < smp.length; i++) { let d = smp[i].a - smp[i - 1].a; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI; tot += d; maxStep = Math.max(maxStep, Math.abs(d)); }
    const dSim = smp[smp.length - 1].sim - smp[0].sim, dWall = (smp[smp.length - 1].t - smp[0].t) / 1000;
    return { omegaSim: tot / dSim, omegaWall: tot / dWall, gaugeOmega: (smp[smp.length - 1].gp - smp[0].gp) / dSim, total: tot, dSim, dWall, maxStep, frames: smp.length,
      ok: smp.every(x => x.ph === 'aim' && !x.paused) };
  };
  const gaugeUI = () => page.evaluate(() => ({ top: document.getElementById('gMarker').style.top, pct: document.getElementById('gPct').textContent,
    visible: getComputedStyle(document.getElementById('gauge')).opacity === '1' && document.getElementById('gauge').getBoundingClientRect().height > 50, g: __bf.getGauge() }));

  // v8：マーカーの実寸（getBoundingClientRect）、中心位置、背景色、トラックの塗り方、ラベルとの重なりを読む
  const markerInfo = () => page.evaluate(() => {
    const m = document.getElementById('gMarker'), t = document.getElementById('gTrack'), G = document.getElementById('gauge');
    const mr = m.getBoundingClientRect(), tr = t.getBoundingClientRect(), gr = G.getBoundingClientRect();
    const mx = G.querySelector('.gend.max').getBoundingClientRect(), mn = G.querySelector('.gend.min').getBoundingClientRect();
    const cs = getComputedStyle(m), ts = getComputedStyle(t), shape = document.getElementById('gShape');
    const grads = [G, ...G.querySelectorAll('*')].filter(e => /gradient/i.test(getComputedStyle(e).backgroundImage)).map(e => e.id || e.className.baseVal || e.className);
    return { w: mr.width, h: mr.height, cy: (mr.top + mr.height / 2 - tr.top) / tr.height, cx: mr.left + mr.width / 2 - (tr.left + tr.width / 2),
      bg: cs.backgroundColor, frozen: G.classList.contains('frozen'), trackBgImage: ts.backgroundImage, trackBgColor: ts.backgroundColor,
      shapeFill: shape.getAttribute('fill'), shapeHasGradRef: /url\(/.test(shape.getAttribute('fill') + getComputedStyle(shape).fill), grads,
      inside: mr.left >= gr.left - 0.5 && mr.right <= gr.right + 0.5, clearOfMax: mr.top >= mx.bottom - 0.5, clearOfMin: mr.bottom <= mn.top + 0.5,
      trackTopW: tr.width, g: __bf.getGauge() };
  });
  const v8 = {}, v10 = {};

  await page.goto(URL);
  await page.waitForFunction(() => window.__bf && window.__bf.state, null, { timeout: 60000 });
  // v6：投げるボタンのクリック（キャプチャ段階＝ゲームのハンドラより前）でその瞬間のゲージ値と位相を記録する。
  // ゲージは rAF の中でしか進まないので、この値はゲームの throwBall() が読む値と同じフレームのもの。
  await page.evaluate(() => { window.__clickG = []; document.addEventListener('click', e => { if (e.target && e.target.closest && e.target.closest('#throwBtn')) { const st = __bf.state(); window.__clickG.push({ g: __bf.getGauge(), phase: st.gaugePhase, sim: st.simTime, inAim: st.phase === 'aim' }); } }, true); });
  // fps 目安（ヘッドレス＝ソフトウェア描画）
  const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { if (++n < 20) requestAnimationFrame(f); else r(n / ((performance.now() - t0) / 1000)); })(); }));
  log(`headless fps ≈ ${fps.toFixed(1)} (software rendering)`);

  log('title');
  await sleep(800);
  await shot('01_title');
  let s = await S();
  check('title screen shown', s.phase === 'title' && await page.isVisible('#startBtn'));
  // v10：見出し（黒に塗りつぶせ／BLACK FRIDAY）・絵で見る遊び方・旧ルール文の撤去・フレーム内に収まるか
  const T = await page.evaluate(() => {
    const app = document.getElementById('app').getBoundingClientRect(), R = e => { const r = e.getBoundingClientRect(); return { top: r.top - app.top, bottom: r.bottom - app.top, left: r.left - app.left, right: r.right - app.left, w: r.width, h: r.height }; };
    const title = document.getElementById('title'), bf = document.getElementById('bfBig'), tm = document.getElementById('tMain'), howto = document.getElementById('howto'), start = document.getElementById('startBtn');
    const steps = [...howto.querySelectorAll('.step')].map(st => { const svg = st.querySelector('svg.sPic'), cap = st.querySelector('.sCap');
      return { svgH: svg ? svg.getBoundingClientRect().height : 0, inlineSvg: !!svg && !svg.querySelector('image'), cap: cap ? cap.innerText.replace(/\n/g, ' / ') : '',
        capPx: cap ? parseFloat(getComputedStyle(cap).fontSize) : 0, capFits: cap ? cap.scrollWidth <= cap.clientWidth + 0.5 : false, num: (st.querySelector('.sNum') || {}).textContent, box: R(st) }; });
    const titleText = title.innerText;
    const inside = r => r.top >= -0.5 && r.left >= -0.5 && r.bottom <= app.height + 0.5 && r.right <= app.width + 0.5;
    const els = [bf, tm, howto, start, ...howto.querySelectorAll('.step')].map(R);
    const ov = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return { docTitle: document.title, titleText, bfText: bf.textContent, bfPx: parseFloat(getComputedStyle(bf).fontSize), bfW: R(bf).w, tmText: tm.textContent, tmPx: parseFloat(getComputedStyle(tm).fontSize),
      steps, arrows: howto.querySelectorAll('.sArrow').length, ballDots: howto.querySelectorAll('#step1 .hDots circle').length,
      allInside: els.every(inside), howtoR: R(howto), startR: R(start), bfR: R(bf), tmR: R(tm), howtoOverStart: ov(R(howto), R(start)), howtoOverTitle: ov(R(howto), R(tm)),
      noScroll: title.scrollHeight <= title.clientHeight + 1 && document.documentElement.scrollHeight <= innerHeight + 1,
      extImg: document.querySelectorAll('#title img, #title image').length, cam: __bf.titleCam() };
  });
  log('    title layout: ' + JSON.stringify({ bfPx: T.bfPx, tmPx: T.tmPx, bf: T.bfR, tm: T.tmR, howto: T.howtoR, start: T.startR, cam: T.cam }));
  v10.bfPx = T.bfPx; v10.tmPx = T.tmPx;
  check('v10 title: 「黒に塗りつぶせ」 is the main heading', T.tmText === '黒に塗りつぶせ' && T.titleText.includes('黒に塗りつぶせ') && T.tmPx >= 40, `${T.tmPx.toFixed(1)}px`);
  check('v10 title: <title> tag is 黒に塗りつぶせ', T.docTitle === '黒に塗りつぶせ', T.docTitle);
  check('v10 title: BLACK FRIDAY element present, computed font size ≥ 40px', T.bfText === 'BLACK FRIDAY' && T.bfPx >= 40, `${T.bfPx.toFixed(1)}px, ${T.bfW.toFixed(0)}px wide`);
  check('v10 how-to: 3 steps, each an inline SVG picture ≥ 64px tall', T.steps.length === 3 && T.steps.every(x => x.svgH >= 64 && x.inlineSvg) && T.extImg === 0, T.steps.map(x => x.svgH.toFixed(0) + 'px').join(' / '));
  check('v10 how-to: captions present, ≥ 14px, not clipped', T.steps.length === 3 && T.steps.every(x => x.cap && x.capPx >= 14 && x.capFits), T.steps.map(x => `「${x.cap}」 ${x.capPx}px`).join(' | '));
  check('v10 how-to: captions say ドラッグでねらう / ボールは5個 / ゲージが大きいときに投げる / 塗れた分だけ % OFF',
    T.steps[0].cap.includes('ドラッグでねらう') && T.steps[0].cap.includes('ボールは5個') && T.steps[1].cap.replace(/ \/ /g, '').includes('ゲージが大きいときに投げる') && T.steps[2].cap.includes('塗れた分だけ') && T.steps[2].cap.includes('% OFF'));
  check('v10 how-to: step numbers 1-2-3 and 2 arrows between steps; step 1 shows 5 ball dots', T.steps.map(x => x.num).join('') === '123' && T.arrows === 2 && T.ballDots === 5);
  check('v10 title: old small-print rules text removed', !/黒い塗料ボールを5個|ドラッグで照準|塗った所に重ねても|そのまま割引率|25〜100%/.test(T.titleText) && !(await page.$('#title .rules')));
  check('v10 title: everything fits the 9:16 frame, no scrolling, how-to clear of start button and headings', T.allInside && T.noScroll && !T.howtoOverStart && !T.howtoOverTitle && T.howtoR.bottom <= T.startR.top);
  check('v10 title: rotating letters sit between the headings and the how-to (title-only camera fit)', T.cam.wordTop >= T.tmR.bottom - 1 && T.cam.wordBottom <= T.howtoR.top + 1 && T.cam.zoom < 1,
    `letters ${T.cam.wordTop.toFixed(0)}–${T.cam.wordBottom.toFixed(0)}px, headings end ${T.tmR.bottom.toFixed(0)}px, how-to starts ${T.howtoR.top.toFixed(0)}px, zoom ${T.cam.zoom.toFixed(3)}`);
  { const bb = T.howtoR, a0 = await page.evaluate(() => document.getElementById('app').getBoundingClientRect().toJSON());
    await page.screenshot({ path: path.join(OUT, '01b_howto_crop.png'), clip: { x: a0.x + bb.left - 4, y: a0.y + bb.top - 4, width: bb.w + 8, height: bb.h + 8 }, timeout: 60000 }); log('    [shot] 01b_howto_crop.png'); }
  check('glyph voxels built from system font', s.total > 1500, `${s.total} surface blocks / ${s.voxels} voxels`);
  await sleep(2500);
  check('trivial: idle on title does not start', (await S()).phase === 'title');
  check('gauge hidden on the title screen', !(await gaugeUI()).visible);

  log('start (real click)');
  await page.click('#startBtn');
  await waitPhase('aim');
  s = await S();
  check('start → aim, 5 balls, 0%', s.phase === 'aim' && s.ballsLeft === 5 && s.percent === 0);
  { const c = await page.evaluate(() => __bf.titleCam()); check('v10: gameplay camera is the v9 camera (zoom 1, no view offset) after leaving the title', c.cameraZoom === 1 && !c.viewOffset, JSON.stringify({ zoom: c.cameraZoom, viewOffset: c.viewOffset })); }
  await sleep(3000);
  s = await S();
  check('trivial: idle in aim → nothing happens (no timer, no auto-throw)', s.phase === 'aim' && s.ballsLeft === 5 && s.percent === 0 && s.thrown === 0);
  log('gauge (v5)');
  const gs = [await gaugeUI()];
  for (let k = 0; k < 2; k++) { const t0 = (await S()).simTime; await page.waitForFunction(t => window.__bf.state().simTime - t >= 0.35, t0, { timeout: 120000, polling: 50 }); gs.push(await gaugeUI()); }
  check('gauge element visible during aim with label ぬり範囲 + MIN/MAX', gs[0].visible && (await page.textContent('#gauge')).includes('ぬり範囲') && (await page.textContent('#gauge')).includes('MAX'));
  check('gauge marker and % readout change over time (samples differ)', new Set(gs.map(x => x.top)).size >= 2 && new Set(gs.map(x => x.pct)).size >= 2, gs.map(x => `${x.pct}@top ${parseFloat(x.top).toFixed(1)}%`).join(' → '));
  check('gauge readout within 25–100% and equals round(100·(0.25+0.75g))', gs.every(x => { const v = parseInt(x.pct); return v >= 25 && v <= 100 && v === Math.round(100 * (0.25 + 0.75 * x.g)); }));
  await shot('02a_gauge');

  log('aim by real mouse drag');
  const r0 = s.reticle;
  const box = await page.locator('#app').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5 + 40, box.y + box.height * 0.6 - 30, { steps: 6 });
  await page.mouse.up();
  const r1 = (await S()).reticle;
  check('drag moves the reticle right & up', r1.x > r0.x + 0.1 && r1.y > r0.y + 0.05, `(${r0.x.toFixed(2)},${r0.y.toFixed(2)}) → (${r1.x.toFixed(2)},${r1.y.toFixed(2)})`);
  const retPos = await page.evaluate(() => { const a = document.getElementById('app').getBoundingClientRect(), r = document.getElementById('reticle').getBoundingClientRect(); return { x: (r.left + r.width / 2 - a.left) / a.width, y: (r.top + r.height / 2 - a.top) / a.height }; });
  check('reticle element drawn where the state says', Math.abs(retPos.x - (r1.x + 1) / 2) < 0.01 && Math.abs(retPos.y - (1 - r1.y) / 2) < 0.01);
  await shot('02_aim_drag');

  log('first throw: front-on, aim at 曜 centre, real click on 投げる');
  const Ls = await page.evaluate(() => __bf.letters());
  await page.evaluate(() => __bf.setRotation(0, true));
  await page.evaluate(() => __bf.setGauge(1));
  await page.evaluate(l => __bf.aimVoxel(l.cx, l.cy), Ls[1]);
  await sleep(300);
  check('setGauge(1) pins the gauge: readout 100%, value stays 1', (await gaugeUI()).pct === '100%' && (await page.evaluate(() => __bf.getGauge())) === 1);
  v8.aim1 = await markerInfo();
  await page.screenshot({ path: path.join(OUT, '09b_gauge_pinned1.png') }); log('    [shot] 09b_gauge_pinned1.png');
  await page.screenshot({ path: path.join(OUT, '09b_gauge_pinned1_zoom.png'), clip: await page.evaluate(() => { const r = document.getElementById('gauge').getBoundingClientRect(); return { x: r.left - 8, y: r.top - 8, width: r.width + 16, height: r.height + 16 }; }) });
  const px0 = await page.evaluate(() => __bf.pixelStats());
  await page.click('#throwBtn');
  await page.waitForFunction(() => window.__bf.state().flying, null, { timeout: 30000, polling: 20 });
  // 二重投げ：飛行中に投げるボタンを押しても無視される
  v8.fly1 = await markerInfo();
  const lock1 = await page.evaluate(() => __bf.locked());
  const dbl = await page.evaluate(() => __bf.throwBall());
  const btnDisabled = await page.isDisabled('#throwBtn');
  const lock1b = await page.evaluate(() => __bf.locked());
  await shot('03_ball_flying');
  await page.waitForFunction(() => window.__bf.state().thrown >= 1, null, { timeout: 120000, polling: 30 });
  s = await S();
  check('during flight: throw ignored & button disabled', dbl === false && btnDisabled);
  check('v6: throw locks g_throw=1 → radius 11 / 範囲 100% in state; second throw during flight leaves the lock unchanged', lock1 && lock1.gauge === 1 && lock1.radius === 11 && lock1.range === 100 && lock1b && lock1b.gauge === 1, JSON.stringify(lock1));
  check('ball landed: 1 ball used, hit (not miss)', s.thrown === 1 && s.ballsLeft === 4 && s.last && !s.last.miss, JSON.stringify(s.last));
  check('coverage % increased from 0', s.percent > 0, s.percent + '%');
  check('gauge pinned at 1: centre hit paints radius 11', s.last.radius === 11 && s.last.gauge === 1 && s.last.range === 100, `r=${s.last.radius}, +${s.last.newly} blocks`);
  check('gauge pinned at 1: first hit coverage ≈ v4 (~26%)', s.percent >= 24 && s.percent <= 28, s.percent + '%');
  const flash1 = await page.textContent('#rangeFlash');
  check('impact shows the achieved range 「範囲 100%」', flash1.trim() === '範囲 100%', flash1);
  const r11 = { newly: s.last.newly, point: s.last.point };
  await sleep(600);
  const px1 = await page.evaluate(() => __bf.pixelStats());
  check('on screen: black pixels appear on the letters, gold decreases', px1.black > px0.black + 1500 && px1.gold < px0.gold - 1500, `black ${px0.black}→${px1.black}, gold ${px0.gold}→${px1.gold}`);
  await page.waitForFunction(p => document.getElementById('covNum').textContent.replace(/\s/g, '') === p + '%', s.percent, { timeout: 60000, polling: 50 }).catch(() => {});
  const hudPct = await page.textContent('#covNum');
  check('HUD shows the coverage %', hudPct.replace(/\s/g, '') === s.percent + '%', hudPct);
  await shot('04_hit_blackened');
  const p1 = s.percent;

  log('gauge pinned at 0 on a fresh board, same centre point');
  await page.evaluate(() => __bf.retry()); await waitPhase('aim');
  await page.evaluate(() => __bf.setRotation(0, true));
  await page.evaluate(() => __bf.setGauge(0.5)); await sleep(200);
  v8.aimMid = await markerInfo();
  await page.screenshot({ path: path.join(OUT, '09a_gauge_mid.png') }); log('    [shot] 09a_gauge_mid.png');
  await page.screenshot({ path: path.join(OUT, '09a_gauge_mid_zoom.png'), clip: await page.evaluate(() => { const r = document.getElementById('gauge').getBoundingClientRect(); return { x: r.left - 8, y: r.top - 8, width: r.width + 16, height: r.height + 16 }; }) });
  await page.evaluate(() => __bf.setGauge(0));
  await page.evaluate(l => __bf.aimVoxel(l.cx, l.cy), Ls[1]);
  check('setGauge(0): readout 25%, marker at bottom', (await gaugeUI()).pct === '25%' && parseFloat((await gaugeUI()).top) === 100);
  await sleep(200);
  v8.aim0 = await markerInfo();
  await page.screenshot({ path: path.join(OUT, '09c_gauge_pinned0.png') }); log('    [shot] 09c_gauge_pinned0.png');
  await page.screenshot({ path: path.join(OUT, '09c_gauge_pinned0_zoom.png'), clip: await page.evaluate(() => { const r = document.getElementById('gauge').getBoundingClientRect(); return { x: r.left - 8, y: r.top - 8, width: r.width + 16, height: r.height + 16 }; }) });
  const s0 = await (async () => {
    const before = (await S()).thrown;
    await page.click('#throwBtn');
    await page.waitForFunction(() => window.__bf.state().flying, null, { timeout: 30000, polling: 20 });
    v8.fly0 = await markerInfo();
    await page.waitForFunction(n => window.__bf.state().thrown > n, before, { timeout: 120000, polling: 30 });
    await waitPhase(['aim', 'ending', 'result']);
    return S();
  })();
  const exp0 = await page.evaluate(p => ({ r275: __bf.countWithin(p, 2.75), r11: __bf.countWithin(p, 11) }), s0.last.point);
  check('gauge pinned at 0: centre hit paints radius 2.75', !s0.last.miss && s0.last.radius === 2.75 && s0.last.range === 25, `r=${s0.last.radius}`);
  check('gauge 0 hit painted exactly the blocks within r=2.75', s0.last.newly === exp0.r275 && exp0.r275 > 0, `painted ${s0.last.newly}, r=2.75 count ${exp0.r275}, r=11 count ${exp0.r11}`);
  check('gauge 0 paints clearly fewer blocks than gauge 1 (< 25%)', s0.last.newly * 4 < r11.newly, `${s0.last.newly} vs ${r11.newly} blocks; coverage ${s0.percent}% vs ${p1}%`);
  await sleep(200);
  const flash0 = await page.textContent('#rangeFlash');
  check('impact shows 「範囲 25%」', flash0.trim() === '範囲 25%', flash0);
  await sleep(500); await shot('04b_gauge0_small_splat');

  log('v8: gauge value encoded by size, not colour');
  {
    const { aim1: a1, aim0: a0, aimMid: am, fly1: f1, fly0: f0 } = v8;
    const f = x => `${x.w.toFixed(2)}×${x.h.toFixed(2)}px @cy ${x.cy.toFixed(3)} bg ${x.bg}${x.frozen ? ' (frozen)' : ''}`;
    log(`    marker g=1 aim ${f(a1)} | g=0.5 aim ${f(am)} | g=0 aim ${f(a0)} | g=1 flight ${f(f1)} | g=0 flight ${f(f0)} | track width ${a1.trackTopW}px`);
    check('v8 (a): marker at pinned 1 is ≥2× larger than at pinned 0 (bbox width and height), in aim and in frozen flight', a1.w >= 2 * a0.w && a1.h >= 2 * a0.h && f1.w >= 2 * f0.w && f1.h >= 2 * f0.h,
      `aim ${a1.w.toFixed(2)}/${a0.w.toFixed(2)} = ${(a1.w / a0.w).toFixed(2)}×, flight ${f1.w.toFixed(2)}/${f0.w.toFixed(2)} = ${(f1.w / f0.w).toFixed(2)}×`);
    check('v8 (a): marker diameter ∝ range (0.25 + 0.75g): ratio g1/g0 ≈ 4 and g0.5/g1 ≈ 0.625 (±5%), round disc', Math.abs(a1.w / a0.w / 4 - 1) < 0.05 && Math.abs(am.w / a1.w / 0.625 - 1) < 0.05 && [a1, a0, am].every(x => Math.abs(x.w - x.h) < 0.5),
      `ratios ${(a1.w / a0.w).toFixed(3)}, ${(am.w / a1.w).toFixed(3)}`);
    check('v8: marker CENTRE sits at (1−g) of the track (g=1 → 0, g=0.5 → 0.5, g=0 → 1, ±0.01), horizontally centred', Math.abs(a1.cy) < 0.01 && Math.abs(am.cy - 0.5) < 0.01 && Math.abs(a0.cy - 1) < 0.01 && [a1, a0, am].every(x => Math.abs(x.cx) < 0.5),
      [a1, am, a0].map(x => x.cy.toFixed(4)).join(' / '));
    check('v8: frozen state keeps the locked size (flight marker = aim marker at same pinned value)', Math.abs(f1.w - a1.w) < 0.5 && Math.abs(f0.w - a0.w) < 0.5 && f1.frozen && f0.frozen);
    check('v8 (b): marker colour independent of value: same background at g=0 and g=1 in aim, and same at g=0 and g=1 while frozen', a1.bg === a0.bg && a1.bg === am.bg && f1.bg === f0.bg && !a1.frozen && !a0.frozen,
      `aim ${a1.bg} / ${am.bg} / ${a0.bg}; frozen ${f1.bg} / ${f0.bg}`);
    check('v8 (b): track has no gradient: #gTrack background-image none, tapered shape filled with one flat colour, no gradient on any gauge element', a1.trackBgImage === 'none' && !a1.shapeHasGradRef && /^rgba?\(/.test(a1.shapeFill) && a1.grads.length === 0,
      `track bg-image ${a1.trackBgImage}, shape fill ${a1.shapeFill}, gradient elements [${a1.grads.join(',')}]`);
    check('v8: enlarged marker stays inside the gauge and clear of the MAX label (g=1) / MIN label (g=0)', a1.inside && a1.clearOfMax && a0.inside && a0.clearOfMin && f1.clearOfMax);
  }

  log('v6: gauge changed during flight must not change the splat (throw-time sampling)');
  for (const [gT, gI] of [[1, 0], [0, 1]]) {
    await page.evaluate(() => __bf.retry()); await waitPhase('aim');
    await page.evaluate(g => { __bf.setRotation(0, true); __bf.setGauge(g); }, gT);
    await page.evaluate(l => __bf.aimVoxel(l.cx, l.cy), Ls[1]);
    await page.click('#throwBtn');
    await page.waitForFunction(() => window.__bf.state().flying, null, { timeout: 30000, polling: 20 });
    await page.evaluate(g => __bf.setGauge(g), gI);   // 飛行中にゲージを反対の端へ
    await page.waitForFunction(() => window.__bf.state().thrown >= 1, null, { timeout: 120000, polling: 30 });
    const sx = await S(); const fl = (await page.textContent('#rangeFlash')).trim();
    const want = gT === 1 ? 11 : 2.75, wantPct = gT === 1 ? 100 : 25;
    check(`throw at g=${gT}, gauge set to ${gI} mid-flight → r=${want}, 「範囲 ${wantPct}%」`, !sx.last.miss && sx.last.radius === want && sx.last.gauge === gT && sx.last.impactGauge === gI && fl === '範囲 ' + wantPct + '%' && sx.lastThrowGauge === gT,
      `r=${sx.last.radius}, impact gauge ${sx.last.impactGauge}, +${sx.last.newly} blocks, flash ${fl}`);
  }
  await waitPhase('aim');   // v7：着弾後の間（flyback）はゲージが止まっているので、aim に戻ってから確認
  await page.evaluate(() => __bf.unpinGauge());
  const gUn = [await page.evaluate(() => __bf.getGauge())];
  await sleep(1500); gUn.push(await page.evaluate(() => __bf.getGauge()));
  check('unpinGauge(): gauge oscillates again', !(await S()).gaugePinned && gUn[0] !== gUn[1], gUn.map(v => v.toFixed(3)).join(' → '));

  log('natural playthrough: gauge unpinned, rotation running, real clicks on 投げる');
  await page.evaluate(() => __bf.retry()); await waitPhase('aim');
  await page.evaluate(() => { __bf.unpinGauge(); __bf.setRotation(null, false); });
  const wantSpeed = [0.55, 1.10, 2.20, 4.40, 8.80];   // v5: 0.55 × 2^n
  const wantGauge = [0, 1, 2, 3, 4].map(() => 2 * Math.PI / (2.8 / 3));   // v9：全球一定（v8 の3球目 = 周期 0.933 s）
  const gMults = [], stateSpeeds = [], measured = [], rot = [], gaugeAt = [], radii = [], pcts = [], radiusOk = [], throwRec = [], frz = [];
  // v7：投げた直後から毎フレーム（rAF）ゲージ値・位相・画面のマーカー位置/数値・frozen クラスを記録。次の aim を 4 フレーム見るか、ending/result を 2 フレーム見たら終了
  const sampleFreeze = () => page.evaluate(() => new Promise(res => {
    const out = []; let nAim = 0, nEnd = 0, t0 = (window.__bf.state()).thrown;
    (function f() { const st = __bf.state(), gEl = document.getElementById('gauge');
      out.push({ ph: st.phase, g: __bf.getGauge(), gp: st.gaugePhase, sim: st.simTime, thrown: st.thrown, w: document.getElementById('gMarker').style.width, top: document.getElementById('gMarker').style.top, pct: document.getElementById('gPct').textContent,
        cls: gEl.classList.contains('frozen'), lockTxt: getComputedStyle(document.getElementById('gLock')).visibility, frozenFlag: st.gaugeFrozen });
      if (st.thrown > t0 && st.phase === 'aim') nAim++;
      if (st.phase === 'ending' || st.phase === 'result') nEnd++;
      if (nAim >= 4 || nEnd >= 2 || out.length > 400) res(out); else requestAnimationFrame(f); })();
  }));
  for (let k = 0; k < 5; k++) {
    await waitPhase('aim');
    const st = await S();
    stateSpeeds.push(st.speed); gMults.push(st.gaugeMult);
    measured.push(await measureSpeed(0.2));
    const an = analyse(await sampleRotation(8));
    rot.push(an);
    log(`    ball ${k + 1}: state ${st.speed.toFixed(3)} rad/s | Δangle/ΔsimTime ${measured[k].toFixed(4)} | rendered+unwrapped ${an.omegaSim.toFixed(4)} rad/s over ${an.frames} frames (Δsim ${an.dSim.toFixed(3)} s, Δwall ${an.dWall.toFixed(2)} s, max step ${an.maxStep.toFixed(3)} rad, wall-clock ω ${an.omegaWall.toFixed(3)}) | gauge ω ${an.gaugeOmega.toFixed(3)} (period ${(2 * Math.PI / an.gaugeOmega).toFixed(3)} s)`);
    await page.evaluate(l => __bf.aimVoxel(l.cx, l.cy), Ls[[1, 0, 2, 1, 0][k]]);
    const nClick = await page.evaluate(() => window.__clickG.length);
    await page.click('#throwBtn');
    const smp = await sampleFreeze();
    await waitPhase(['aim', 'ending', 'result']);
    const r = await S();
    const flash = (await page.textContent('#rangeFlash')).trim();
    const ck = await page.evaluate(n => window.__clickG[n], nClick);   // getGauge() at the click that started this throw
    pcts.push(r.percent);
    const gT = ck.g, rT = 11 * (0.25 + 0.75 * gT), rImp = 11 * (0.25 + 0.75 * r.last.impactGauge);
    throwRec.push({ gT, gImpact: r.last.impactGauge, phaseAdv: r.gaugePhase - ck.phase, lockSame: r.lastThrowGauge === gT, miss: r.last.miss, r: r.last.radius, rImp });
    if (!r.last.miss) {
      radii.push(r.last.radius); gaugeAt.push(gT);
      radiusOk.push(ck.inAim && Math.abs(r.last.radius - rT) < 1e-9 && r.last.gauge === gT && r.last.radius >= 2.75 && r.last.radius <= 11 && flash === '範囲 ' + Math.round(100 * (0.25 + 0.75 * gT)) + '%');
    }
    log(`    throw ${k + 1}: ${r.last.miss ? 'miss' : `g_throw ${gT.toFixed(3)} (impact g ${r.last.impactGauge.toFixed(3)} would give r=${rImp.toFixed(3)}) → ${flash} → r=${r.last.radius.toFixed(3)} +${r.last.newly} blocks`} → ${r.percent}%`);
    {
      const fl = smp.filter(x => x.ph === 'flying'), fb = smp.filter(x => x.ph === 'flyback'), en = smp.filter(x => x.ph === 'ending'), aim = smp.filter(x => x.ph === 'aim' && x.thrown === k + 1);
      const frozenGp = fl.length ? fl[0].gp : NaN, om = 2 * Math.PI / (2.8 / 3);
      const rec = { k, gT, nFlight: fl.length, flightExact: fl.length >= 3 && fl.every(x => x.g === gT), flightPhaseSame: fl.every(x => x.gp === frozenGp),
        uiStatic: fl.length >= 3 && fl.every(x => x.top === fl[0].top && x.w === fl[0].w && x.pct === fl[0].pct) && fl[0].pct === Math.round(100 * (0.25 + 0.75 * gT)) + '%' && Math.abs(parseFloat(fl[0].top) - (1 - gT) * 100) < 0.01,   // CSS 文字列は丸められる
        cue: fl.length > 0 && fl.every(x => x.cls && x.lockTxt === 'visible' && x.frozenFlag),
        postImpactFrozen: fb.concat(en).every(x => x.g === gT && x.gp === frozenGp && x.cls), nAfter: fb.length + en.length,
        radiusLocked: r.last.miss || r.last.radius === 11 * (0.25 + 0.75 * gT) };
      if (k < 4) {
        rec.first = aim[0]; rec.moves = aim.length >= 2 && new Set(aim.map(x => x.g)).size >= 2 && new Set(aim.map(x => x.top)).size >= 2;
        rec.firstDp = aim[0] ? aim[0].gp - frozenGp : NaN;
        rec.resumeNear = !!aim[0] && rec.firstDp >= 0 && rec.firstDp <= om * 0.05 + 1e-9 && Math.abs(aim[0].g - gT) <= 0.5 * om * 0.05 + 1e-9;
        rec.dirKept = aim.length >= 2 && aim[1].gp > aim[0].gp && aim.every((x, i) => i === 0 || Math.abs((x.gp - aim[i - 1].gp) - om * (x.sim - aim[i - 1].sim)) < 1e-6);   // 位相は前進のみ＝向きはそのまま、速さは新しい球の ω
        rec.cueOff = aim.every(x => !x.cls && x.lockTxt === 'hidden');
      }
      frz.push(rec);
      log(`    v7 freeze ball ${k + 1}: ${fl.length} flight frames all g=${gT.toFixed(4)} (${rec.flightExact}), marker top ${fl[0] && parseFloat(fl[0].top).toFixed(2)}% / ${fl[0] && fl[0].pct} static=${rec.uiStatic}, ${rec.nAfter} post-impact frames frozen=${rec.postImpactFrozen}` +
        (k < 4 ? ` | resume: first aim g ${rec.first ? rec.first.g.toFixed(4) : '-'} (Δphase ${rec.firstDp.toFixed(3)} ≤ ${(om * 0.05).toFixed(3)}), aim samples ${aim.map(x => x.g.toFixed(3)).join(' → ')}` : ' | last ball: stays frozen into ending'));
    }
    if (k === 0) await shot('03b_natural_throw1');
    s = r;
  }
  check('game state speed per ball is exactly 0.55 / 1.10 / 2.20 / 4.40 / 8.80', stateSpeeds.length === 5 && stateSpeeds.every((v, i) => v === 0.55 * Math.pow(2, i)), stateSpeeds.join(', '));
  check('state speed ratios exactly 2', stateSpeeds.every((v, i) => i === 0 || v / stateSpeeds[i - 1] === 2));
  check('measured rotation balls 1–3 (rendered, unwrapped, per simTime) = 0.55 / 1.10 / 2.20 ±5%', rot.slice(0, 3).every((a, i) => a.ok && Math.abs(a.omegaSim / wantSpeed[i] - 1) < 0.05), rot.slice(0, 3).map(a => a.omegaSim.toFixed(3)).join(', '));
  check('measured rotation balls 4–5 (rendered, unwrapped, per simTime) = 4.40 / 8.80 ±5%', rot.slice(3).every((a, i) => a.ok && Math.abs(a.omegaSim / wantSpeed[i + 3] - 1) < 0.05), rot.slice(3).map(a => a.omegaSim.toFixed(3)).join(', ') + ` (max per-frame step ${Math.max(...rot.map(a => a.maxStep)).toFixed(3)} rad < π)`);
  check('Δangle/ΔsimTime from state agrees for all 5 balls (±2%)', measured.every((v, i) => Math.abs(v / wantSpeed[i] - 1) < 0.02), measured.map(v => v.toFixed(3)).join(', '));
  check('v9: measured gauge period ≈ 0.933 s (ω ≈ 6.732) on EVERY ball 1–5, ±5%, and state gaugeMult ×3 each ball', rot.length === 5 && rot.every((a, i) => Math.abs(a.gaugeOmega / wantGauge[i] - 1) < 0.05) && gMults.length === 5 && gMults.every(m => m === 3), rot.map(a => (2 * Math.PI / a.gaugeOmega).toFixed(3)).join(' / '));
  check('v6: every natural hit: radius = radiusFromGauge(getGauge() at the throw click), flash 「範囲 N%」 from g_throw', radiusOk.length > 0 && radiusOk.length === throwRec.filter(t => !t.miss).length && radiusOk.every(Boolean), radii.map((r, i) => `${r.toFixed(3)}@g${gaugeAt[i].toFixed(3)}`).join(', '));
  check('v6: locked gauge exposed by hooks (lastThrowGauge) equals getGauge() at the click, all 5 throws', throwRec.length === 5 && throwRec.every(t => t.lockSame));
  // v7（v6 の「飛行中もゲージが動き続ける」チェックを置き換え）
  check('v7 (a): during every flight getGauge() sampled ≥3 times, all exactly = throw-time locked value', frz.length === 5 && frz.every(f => f.flightExact && f.flightPhaseSame), frz.map(f => `${f.nFlight}×${f.gT.toFixed(4)}`).join(', '));
  check('v7 (b): on-screen marker position (centre), size (v8) and % readout static during every flight (= locked value)', frz.every(f => f.uiStatic));
  check('v7: gauge stays frozen after impact until the next aim (flyback), and into ending on ball 5', frz.every(f => f.postImpactFrozen && f.nAfter > 0), frz.map(f => f.nAfter).join(', ') + ' post-impact frames');
  check('v7 (c): after return to aim the gauge moves again (samples differ), balls 1–4', frz.slice(0, 4).every(f => f.moves));
  check('v7 (c): resumes from the frozen value — first aim sample within one frame of movement (Δphase ≤ ω·0.05)', frz.slice(0, 4).every(f => f.resumeNear), frz.slice(0, 4).map(f => `${f.gT.toFixed(3)}→${f.first.g.toFixed(3)} (Δφ ${f.firstDp.toFixed(3)})`).join(', '));
  check('v7: resumed phase only moves forward (direction kept) at the same constant gauge speed (v9)', frz.slice(0, 4).every(f => f.dirKept));
  check('v7 (d): painted radius = radiusFromGauge(locked throw value) on every natural hit', frz.every(f => f.radiusLocked));
  check('v7 cue: gold marker + 「決定」 shown while frozen, removed on resume', frz.every(f => f.cue) && frz.slice(0, 4).every(f => f.cueOff));
  const diffImp = throwRec.filter(t => !t.miss && Math.abs(t.rImp - t.r) > 1e-6).length;
  log(`    info: ${diffImp}/${throwRec.filter(t => !t.miss).length} natural hits had an impact-time gauge that would have given a different radius (impact g: ${throwRec.map(t => t.gImpact.toFixed(3)).join(', ')})`);
  check('coverage never decreases', pcts.every((p, i) => i === 0 || p >= pcts[i - 1]), pcts.join(' → '));
  check('after 5 balls: 0 left, ending', s.ballsLeft === 0 && (s.phase === 'ending' || s.phase === 'result'));
  check('6th throw impossible', (await page.evaluate(() => __bf.throwBall())) === false);
  await waitPhase('result');
  await sleep(700);
  const final = await S();
  const card = await page.textContent('#result .card');
  check('result card shows "N% OFF"', card.includes(final.percent + '%') && card.includes('OFF を勝ち取った'), card.replace(/\s+/g, ' ').slice(0, 80));
  check('result card has tier message + shopping line', /ほぼ真っ黒|大セール級|そこそこ|まだ金色/.test(card) && card.includes('オトクな買い物をしてね'));
  const cardFits = await page.evaluate(() => { const a = document.getElementById('app').getBoundingClientRect(), c = document.querySelector('#result .card').getBoundingClientRect(); return c.top >= a.top && c.bottom <= a.bottom && c.left >= a.left && c.right <= a.right; });
  check('result card fits inside the 9:16 frame', cardFits);
  check('gauge hidden on the result screen', !(await gaugeUI()).visible);
  await shot('05_result');

  log('retry');
  await page.click('#retryBtn');
  await waitPhase('aim');
  await sleep(500);
  s = await S();
  const pxR = await page.evaluate(() => __bf.pixelStats());
  await sleep(1500); const sR2 = await S();   // v9：リトライ後もゲージ周期は同じ（実測）
  const retryPeriod = sR2.phase === 'aim' && sR2.simTime > s.simTime ? 2 * Math.PI / ((sR2.gaugePhase - s.gaugePhase) / (sR2.simTime - s.simTime)) : NaN;
  check('retry resets: 5 balls, 0%, letters gold again, speed 0.55; gauge speed unchanged (constant ×3, measured period 0.933 s ±5%)', s.ballsLeft === 5 && s.percent === 0 && pxR.black < 200 && s.speed === 0.55 && s.gaugeMult === 3 && Math.abs(retryPeriod / (2.8 / 3) - 1) < 0.05, `black px ${pxR.black}, gauge period after retry ${retryPeriod.toFixed(3)} s`);
  const hudR = (await page.textContent('#covNum')).replace(/\s/g, '');
  check('retry resets the HUD coverage text to 0% (v4 left the previous % on screen)', hudR === '0%', hudR);

  // ---- trivial strategy（回転を止めて正面、狙いを固定）
  async function run5(points, label) {
    await page.evaluate(() => __bf.retry());
    await waitPhase('aim');
    await page.evaluate(() => { __bf.setRotation(0, true); __bf.setGauge(1); });   // v5：最大半径で比較（v4 と同条件）
    for (const p of points) {
      await waitPhase('aim');
      await page.evaluate(p => p.ndc ? __bf.aim(p.ndc[0], p.ndc[1]) : __bf.aimVoxel(p[0], p[1]), p);
      await throwAndLand(false);
    }
    await waitPhase('result');
    const st = await S();
    log(`    ${label}: ${st.percent}%  history ${st.history.map(h => h.miss ? 'miss' : '+' + h.newly).join(' ')}`);
    return st;
  }
  log('trivial strategy (rotation frozen front-on, gauge pinned at 1)');
  const C = Ls.map(l => [l.cx, l.cy]);
  const same = await run5([C[1], C[1], C[1], C[1], C[1]], 'same spot ×5');
  await sleep(500); await shot('06_result_same_spot');
  check('same spot ×5: balls 2–5 are wasted (overlap adds nothing)', same.history.slice(1).every(h => h.newly === 0));
  const spread = await run5([C[0], C[1], C[2], [C[0][0], (C[0][1] + C[1][1]) / 2], [C[1][0], (C[1][1] + C[2][1]) / 2]], 'spread over letters');
  await sleep(500); await shot('07_result_spread');
  check('spreading beats same-spot clearly (≥ 2×)', spread.percent >= same.percent * 2, `spread ${spread.percent}% vs same ${same.percent}%`);
  check('same-spot stays low (≤ 40%)', same.percent <= 40, same.percent + '%');
  check('same-spot ×5 with gauge 1 ≈ 26% (as v4)', same.percent >= 24 && same.percent <= 28, same.percent + '%');
  const miss = await run5(Array(5).fill({ ndc: [0.9, 0.7] }), 'all misses');
  check('all misses → 0% OFF result', miss.percent === 0 && miss.history.every(h => h.miss) && (await page.textContent('#rPct')).startsWith('0'));
  // 回転を止めず、真横（エッジオン）で当てた時はかすめで小さい
  await page.evaluate(() => __bf.retry()); await waitPhase('aim');
  await page.evaluate(() => { __bf.setRotation(Math.PI / 2 - 0.12, true); __bf.setGauge(1); });
  await page.evaluate(l => __bf.aimVoxel(l.cx, l.cy, 2), Ls[1]);
  const edge = await throwAndLand(false);
  log('    edge-on throw: ' + JSON.stringify(edge.last));
  check('edge-on throw (letters turned sideways) hits the letters', !edge.last.miss);
  check('edge-on hit (gauge 1) paints the full radius (r = 11, same as a centre hit)', edge.last.radius === 11, String(edge.last.radius));
  // 着弾点から半径 11 以内の表面ブロック数（新しいゲームで数える）＝実際に塗れた数 か。v1 の かすめ半径（~2.95）なら何ブロックだったかも比較用に出す
  const exp = await page.evaluate(p => ({ full: __bf.countWithin(p, 11), v1graze: __bf.countWithin(p, 2.954) }), edge.last.point);
  check('edge-on hit painted every surface block within r=11 of the impact', edge.last.newly === exp.full && exp.full > 0, `painted ${edge.last.newly}, full-radius count ${exp.full} (v1 graze r≈2.95 would have been ${exp.v1graze})`);
  check('edge-on hit paints far more than the v1 graze did (> 3× of 26 blocks)', edge.last.newly > 26 * 3, `${edge.last.newly} blocks`);
  await sleep(400); await shot('08_edge_on_full_splat');

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('no external requests', requests.length === 0, requests.slice(0, 3).join(' '));
  await browser.close();
  const failed = checks.filter(c => !c.ok).length;
  log(`\n${checks.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
