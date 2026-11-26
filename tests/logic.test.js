// Node ロジックテスト： node tests/logic.test.js
const L = require('../src/logic.js');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? '  ' + detail : ''}`); };

// 板：w×h×d の直方体
function slab(w, h, d) { const v = []; for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) v.push([x, y, z]); return v; }

console.log('surface');
{
  const m = L.buildModel(slab(3, 3, 3));
  check('3x3x3: 26 surface, centre interior', m.surface.length === 26 && !m.surface.some(v => v[0] === 1 && v[1] === 1 && v[2] === 1));
  const m2 = L.buildModel(slab(5, 4, 1));
  check('1-thick slab: all voxels are surface', m2.surface.length === 20);
  const m3 = L.buildModel([[0, 0, 0], [0, 0, 0], [1, 0, 0]]);
  check('duplicates counted once', m3.count === 2 && m3.surface.length === 2);
}

console.log('raycast');
{
  const m = L.buildModel(slab(10, 10, 4));
  const h = L.raycast(m, [5.5, 5.5, 20], [0, 0, -1]);
  check('front hit lands on z=3 face, normal +z', h && h.voxel[2] === 3 && h.normal[2] === 1 && Math.abs(h.point[2] - 4) < 1e-9, JSON.stringify(h && h.voxel));
  const hb = L.raycast(m, [5.5, 5.5, -20], [0, 0, 1]);
  check('back hit lands on z=0, normal -z', hb && hb.voxel[2] === 0 && hb.normal[2] === -1);
  check('ray beside the slab misses', L.raycast(m, [12, 5, 20], [0, 0, -1]) === null);
  check('ray pointing away misses', L.raycast(m, [5, 5, 20], [0, 0, 1]) === null);
  check('tMax shorter than distance misses', L.raycast(m, [5.5, 5.5, 20], [0, 0, -1], 10) === null);
  const hs = L.raycast(m, [-5, 2.5, 1.5], [1, 0, 0]);
  check('side hit normal -x', hs && hs.voxel[0] === 0 && hs.normal[0] === -1);
  // 穴あき：中央に穴、斜めでも穴を抜けて奥に当たる
  const holed = slab(10, 10, 1).filter(v => !(v[0] === 5 && v[1] === 5)).concat(slab(10, 10, 1).map(v => [v[0], v[1], -5]));
  const mh = L.buildModel(holed);
  const hh = L.raycast(mh, [5.5, 5.5, 10], [0, 0, -1]);
  check('ray passes through hole to back layer', hh && hh.voxel[2] === -5);
  // ランダムレイ vs ブルートフォース（レイ上を細かくサンプリング）
  let agree = 0, N = 300, seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const blob = slab(12, 12, 4).filter(() => rnd() < 0.5); const mb = L.buildModel(blob);
  for (let i = 0; i < N; i++) {
    const o = [rnd() * 30 - 9, rnd() * 30 - 9, 15 + rnd() * 5];
    const tgt = [rnd() * 12, rnd() * 12, rnd() * 4];
    let d = [tgt[0] - o[0], tgt[1] - o[1], tgt[2] - o[2]]; const len = Math.hypot(...d); d = d.map(x => x / len);
    const r = L.raycast(mb, o, d);
    let bf = null;
    for (let t = 0; t < 60; t += 0.002) { const p = o.map((x, a) => x + d[a] * t); const k = L.key(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])); if (mb.occ[k]) { bf = Math.floor(p[0]) + ',' + Math.floor(p[1]) + ',' + Math.floor(p[2]); break; } }
    if ((r ? r.voxel.join(',') : null) === bf) agree++;
  }
  check('DDA agrees with brute-force sampling', agree >= N - 2, `${agree}/${N}`);
}

console.log('paint / coverage');
{
  const m = L.buildModel(slab(30, 30, 2));
  const g = L.createGame(m, [{ cx: 15, cy: 15, hw: 15, hh: 15 }]);
  check('starts at 0%', L.percent(g) === 0 && L.coverage(g) === 0);
  const a = L.paint(g, [15, 15, 2], 5);
  const p1 = L.percent(g);
  check('hit paints and coverage increases', a.length > 0 && p1 > 0, `${a.length} voxels, ${p1}%`);
  const b = L.paint(g, [15, 15, 2], 5);
  check('same spot again adds nothing (overlap)', b.length === 0 && L.percent(g) === p1);
  const c = L.paint(g, [15, 15, 2], 3);
  check('smaller splat inside painted area adds nothing', c.length === 0);
  const d = L.paint(g, [16, 15, 2], 5);
  check('partial overlap adds only the new part', d.length > 0 && d.length < a.length, `${d.length} < ${a.length}`);
  L.paint(g, [15, 15, 1], 100);
  check('painting everything = 100%', L.percent(g) === 100 && L.coverage(g) === 1);
  // 切り捨て：199/200 は 99%
  const g2 = L.createGame({ surface: Array.from({ length: 200 }, (_, i) => [i, 0, 0]) }, []);
  L.paint(g2, [99.5, 0.5, 0.5], 99.1);
  check('percent is floored (199/200 → 99)', g2.paintedCount === 199 && L.percent(g2) === 99, `${g2.paintedCount} → ${L.percent(g2)}`);
}

console.log('splat radius (position/angle never matter; without a gauge value = R_MAX)');
{
  const letters = [{ cx: 13, cy: 13, hw: 13, hh: 13 }];
  check('R_MAX is 11', L.R_MAX === 11);
  check('no position-based R_MIN constant exported (v5 uses R_MIN_FRAC of the gauge)', L.R_MIN === undefined && L.R_MIN_FRAC === 0.25);
  const cases = {
    'front centre': [[13, 13, 4], [0, 0, -1]],
    'letter edge (front-on)': [[1, 13, 4], [0, 0, -1]],
    'letter corner': [[0.5, 25.5, 4], [0, 0, -1]],
    'side-on graze (letters ~76° turned)': [[13, 13, 4], [0.97, 0, -0.24]],
    'almost edge-on (dir.z = 0.01)': [[13, 13, 4], [1, 0, -0.01]],
    'pure side face hit (dir.z = 0)': [[0, 13, 2], [1, 0, 0]],
    'back side': [[13, 13, 0], [0, 0, 1]],
    'edge + side-on combined': [[25, 2, 3], [-0.9, 0.3, 0.2]],
  };
  for (const [name, [pt, dir]] of Object.entries(cases)) {
    const r = L.hitQuality(pt, dir, letters).radius;
    check(`${name} → radius = R_MAX`, r === L.R_MAX, String(r));
  }
  // 乱数で 500 通りの着弾点・角度を試しても常に R_MAX
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let allMax = true;
  for (let i = 0; i < 500; i++) {
    const r = L.hitQuality([rnd() * 26, rnd() * 26, rnd() * 4], [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1], letters).radius;
    if (r !== L.R_MAX) allMax = false;
  }
  check('500 random hit points/angles → always R_MAX', allMax);
  // resolveThrow 経由：端・横向きの当たりも中心当たりと同じ数だけ塗る（周りに十分な面がある板で比較）
  const m = L.buildModel(slab(60, 60, 4));
  const lt = [{ cx: 30, cy: 30, hw: 30, hh: 30 }];
  const g1 = L.createGame(m, lt), g2 = L.createGame(m, lt);
  const rc = L.resolveThrow(g1, { point: [30, 30, 4], dir: [0, 0, -1] });
  const rs = L.resolveThrow(g2, { point: [30, 30, 4], dir: [0.98, 0, -0.2] });
  check('resolveThrow: side-on hit radius = centre hit radius = R_MAX', rc.radius === L.R_MAX && rs.radius === L.R_MAX);
  check('resolveThrow: side-on hit paints the same block count as a centre hit', rs.newly === rc.newly && rc.newly > 0, `${rs.newly} vs ${rc.newly}`);
  const g3 = L.createGame(m, lt);
  const rm = L.resolveThrow(g3, null);
  check('a miss is still a miss (radius 0, nothing painted, ball used)', rm.miss && rm.radius === 0 && rm.newly === 0 && g3.ballsLeft === 4);
}

console.log('balls / game over');
{
  const m = L.buildModel(slab(26, 26, 4));
  const g = L.createGame(m, [{ cx: 13, cy: 13, hw: 13, hh: 13 }]);
  check('5 balls at start', g.ballsLeft === 5 && !L.isOver(g));
  const r1 = L.resolveThrow(g, null);
  check('miss consumes a ball, paints nothing', r1.miss && r1.newly === 0 && r1.wasted && g.ballsLeft === 4 && r1.percent === 0);
  const r2 = L.resolveThrow(g, { point: [13, 13, 4], dir: [0, 0, -1] });
  check('hit paints', !r2.miss && r2.newly > 0 && r2.percent > 0, r2.percent + '%');
  const r3 = L.resolveThrow(g, { point: [13, 13, 4], dir: [0, 0, -1] });
  check('re-hit is wasted', r3.wasted && r3.percent === r2.percent);
  L.resolveThrow(g, null);
  check('not over after 4', !L.isOver(g) && g.ballsLeft === 1);
  const r5 = L.resolveThrow(g, null);
  check('over after 5th', r5.done && L.isOver(g) && g.ballsLeft === 0);
  check('6th throw rejected', L.resolveThrow(g, null) === null && g.thrown === 5);
}

console.log('speed (v5: doubles per ball) / tiers');
{
  check('base speed is 0.55 rad/s (unchanged)', L.BASE_SPEED === 0.55);
  check('SPEED_MULT is 2 (multiplicative); SPEED_STEP / SPEEDUP gone', L.SPEED_MULT === 2 && L.SPEED_STEP === undefined && L.SPEEDUP === undefined);
  const seq = [0, 1, 2, 3, 4].map(n => L.rotationSpeed(n));
  const want = [0.55, 1.10, 2.20, 4.40, 8.80];
  check('speed sequence 0.55 → 1.10 → 2.20 → 4.40 → 8.80', seq.every((v, i) => Math.abs(v - want[i]) < 1e-12), seq.map(v => v.toFixed(4)).join(', '));
  check('speed sequence bit-exact (0.55·2^n)', seq.every((v, i) => v === 0.55 * Math.pow(2, i)) && seq[1] === 1.1 && seq[2] === 2.2 && seq[3] === 4.4 && seq[4] === 8.8);
  check('ratios between consecutive balls are exactly 2', seq.every((v, i) => i === 0 || v / seq[i - 1] === 2), seq.slice(1).map((v, i) => (v / seq[i]).toFixed(4)).join(', '));
  check('speed as % of initial: 100/200/400/800/1600', seq.map(v => Math.round(v / seq[0] * 100)).join('/') === '100/200/400/800/1600');
  check('not additive any more (v4 would give 1.65 for ball 3)', Math.abs(seq[2] - 1.65) > 0.5);
  check('tiers', L.tier(85).id === 'black' && L.tier(84).id === 'sale' && L.tier(60).id === 'sale' && L.tier(59).id === 'ok' && L.tier(40).id === 'ok' && L.tier(39).id === 'gold');
}

console.log('paint gauge (v5)');
{
  check('GAUGE_BASE_PERIOD is 2.8 s', L.GAUGE_BASE_PERIOD === 2.8);
  const mult = [0, 1, 2, 3, 4].map(n => L.gaugeSpeedMult(n));
  check('v9: gauge speed multiplier constant ×3 for thrown = 0..4 (no per-ball speed-up)', mult.join(',') === '3,3,3,3,3' && L.GAUGE_SPEED_MULT === 3, mult.join(','));
  const per = [0, 1, 2, 3, 4].map(n => L.gaugePeriod(n));
  check('v9: gauge period constant 2.8/3 ≈ 0.9333 s for thrown = 0..4', per.every(v => Math.abs(v - 2.8 / 3) < 1e-12) && Math.abs(L.GAUGE_PERIOD - 2.8 / 3) < 1e-12, per.map(v => v.toFixed(4)).join(' / '));
  check('v9: gauge angular speed = 2π / period ≈ 6.732 rad/s on every ball', [0, 1, 2, 3, 4].every(n => Math.abs(L.gaugeOmega(n) - 2 * Math.PI / per[n]) < 1e-12 && Math.abs(L.gaugeOmega(n) - 6.732) < 5e-4), L.gaugeOmega(0).toFixed(4) + ' rad/s');
  check('gauge value: g(0)=0, g(π)=1, g(π/2)=0.5, g(2π)=0', Math.abs(L.gaugeValue(0)) < 1e-12 && Math.abs(L.gaugeValue(Math.PI) - 1) < 1e-12 && Math.abs(L.gaugeValue(Math.PI / 2) - 0.5) < 1e-12 && Math.abs(L.gaugeValue(2 * Math.PI)) < 1e-12);
  let inRange = true; for (let ph = 0; ph < 20; ph += 0.01) { const g = L.gaugeValue(ph); if (g < 0 || g > 1) inRange = false; }
  check('gauge value stays within [0, 1]', inRange);
  check('radiusFromGauge(0) = 2.75 (25% of 11)', L.radiusFromGauge(0) === 2.75, String(L.radiusFromGauge(0)));
  check('radiusFromGauge(1) = 11', L.radiusFromGauge(1) === 11, String(L.radiusFromGauge(1)));
  check('radiusFromGauge(0.5) = 6.875', Math.abs(L.radiusFromGauge(0.5) - 6.875) < 1e-12, String(L.radiusFromGauge(0.5)));
  let mono = true, lin = true; for (let i = 1; i <= 100; i++) { const a = L.radiusFromGauge((i - 1) / 100), b = L.radiusFromGauge(i / 100); if (!(b > a)) mono = false; if (Math.abs(b - a - 0.0825) > 1e-9) lin = false; }
  check('radiusFromGauge strictly increasing and linear (+0.0825 per 0.01)', mono && lin);
  check('radiusFromGauge clamps out-of-range input', L.radiusFromGauge(-1) === 2.75 && L.radiusFromGauge(2) === 11);
  check('range % readout: 25 at g=0, 100 at g=1, 63 at g=0.5', L.rangePercent(0) === 25 && L.rangePercent(1) === 100 && L.rangePercent(0.5) === 63);
  const m = L.buildModel(slab(60, 60, 4)), lt = [{ cx: 30, cy: 30, hw: 30, hh: 30 }];
  const gMin = L.createGame(m, lt), gMax = L.createGame(m, lt), gMid = L.createGame(m, lt);
  const rMin = L.resolveThrow(gMin, { point: [30, 30, 4], dir: [0, 0, -1], gauge: 0 });
  const rMid = L.resolveThrow(gMid, { point: [30, 30, 4], dir: [0, 0, -1], gauge: 0.5 });
  const rMax = L.resolveThrow(gMax, { point: [30, 30, 4], dir: [0, 0, -1], gauge: 1 });
  check('resolveThrow without a lock uses hit.gauge: radius 2.75 / 6.875 / 11', rMin.radius === 2.75 && rMid.radius === 6.875 && rMax.radius === 11);
  check('radius 2.75 paints fewer blocks than radius 11 on the same point', rMin.newly > 0 && rMin.newly < rMid.newly && rMid.newly < rMax.newly && rMin.newly * 4 < rMax.newly, `${rMin.newly} < ${rMid.newly} < ${rMax.newly}`);
  const pa = L.paint(L.createGame(m, lt), [30, 30, 4], 2.75).length, pb = L.paint(L.createGame(m, lt), [30, 30, 4], 11).length;
  check('paint(): r=2.75 < r=11 at the same point', pa < pb && pa === rMin.newly && pb === rMax.newly, `${pa} vs ${pb}`);
  const gm = L.createGame(m, lt);
  const rmiss = L.resolveThrow(gm, null);
  check('a miss paints nothing regardless of gauge', rmiss.miss && rmiss.newly === 0 && rmiss.radius === 0 && gm.paintedCount === 0);
}

console.log('throw-time gauge lock (v6)');
{
  const m = L.buildModel(slab(60, 60, 4)), lt = [{ cx: 30, cy: 30, hw: 30, hh: 30 }];
  const hit = (gImpact) => ({ point: [30, 30, 4], dir: [0, 0, -1], gauge: gImpact });
  const g0 = L.createGame(m, lt);
  check('new game has no locked throw', g0.locked === null);
  const lk = L.beginThrow(g0, 0.2);
  check('beginThrow stores gauge, radius = radiusFromGauge(g_throw), range %', lk && g0.locked === lk && lk.gauge === 0.2 && lk.radius === L.radiusFromGauge(0.2) && lk.range === L.rangePercent(0.2), JSON.stringify(lk));
  check('second beginThrow while in flight is refused (lock unchanged)', L.beginThrow(g0, 0.9) === null && g0.locked.gauge === 0.2);
  const r0 = L.resolveThrow(g0, hit(1)); // 着弾時のゲージは 1 でも、投げた時の 0.2 で塗る
  check('impact paints with the throw-time radius, not the impact gauge', r0.radius === L.radiusFromGauge(0.2) && r0.lockedGauge === 0.2 && r0.radius !== 11, `r=${r0.radius}`);
  check('locked-radius paint count = paint() at radiusFromGauge(0.2)', r0.newly === L.paint(L.createGame(m, lt), [30, 30, 4], L.radiusFromGauge(0.2)).length, String(r0.newly));
  check('lock is cleared after impact', g0.locked === null);
  const gA = L.createGame(m, lt), gB = L.createGame(m, lt);
  L.beginThrow(gA, 1); const rA = L.resolveThrow(gA, hit(0));
  L.beginThrow(gB, 0); const rB = L.resolveThrow(gB, hit(1));
  check('throw at g=1 / impact at g=0 → r=11; throw at g=0 / impact at g=1 → r=2.75', rA.radius === 11 && rB.radius === 2.75);
  const gM = L.createGame(m, lt); L.beginThrow(gM, 1); const rM = L.resolveThrow(gM, null);
  check('miss with a locked gauge still paints nothing and clears the lock', rM.miss && rM.newly === 0 && rM.radius === 0 && gM.locked === null);
  const gE = L.createGame(m, lt, { balls: 1 }); L.beginThrow(gE, 0.5); L.resolveThrow(gE, hit(0.5));
  check('beginThrow refused after the last ball', L.beginThrow(gE, 0.5) === null && gE.locked === null);
  const gC = L.createGame(m, lt); L.beginThrow(gC, -3); const lc = gC.locked;
  check('beginThrow clamps gauge to [0,1]', lc.gauge === 0 && lc.radius === 2.75);
}

console.log('gauge freeze at the throw (v7)');
{
  check('gauge runs only in aim', L.gaugeRuns('aim') && !L.gaugeRuns('flying') && !L.gaugeRuns('flyback') && !L.gaugeRuns('ending') && !L.gaugeRuns('result') && !L.gaugeRuns('title'));
  check('stepGauge in aim advances phase by gaugeOmega(thrown)·dt', [0, 1, 2, 3, 4].every(n => Math.abs(L.stepGauge(1.0, 'aim', n, 0.05) - (1.0 + L.gaugeOmega(n) * 0.05)) < 1e-12));
  // 自然な流れ：aim で進む → 投げる（その値でロック）→ flying / flyback では位相不変 → 次の aim で同じ位相から新しい速さで再開
  const m = L.buildModel(slab(60, 60, 4));
  const g = L.createGame(m, [{ cx: 30, cy: 30, hw: 30, hh: 30 }]);
  let ph = 0;
  for (let i = 0; i < 17; i++) ph = L.stepGauge(ph, 'aim', g.thrown, 0.05);
  const gThrow = L.gaugeValue(ph), lk = L.beginThrow(g, gThrow), phThrow = ph;
  const vals = [];
  for (let i = 0; i < 15; i++) { ph = L.stepGauge(ph, 'flying', g.thrown, 0.05); vals.push(L.gaugeValue(ph)); }
  check('during flight: phase does not advance and every value equals the locked value', ph === phThrow && vals.every(v => v === lk.gauge), `g_throw ${gThrow.toFixed(4)}`);
  const r = L.resolveThrow(g, { point: [30, 30, 4], dir: [0, 0, -1] });
  for (let i = 0; i < 9; i++) ph = L.stepGauge(ph, 'flyback', g.thrown, 0.05);
  check('after impact (flyback) the gauge is still frozen; radius = radiusFromGauge(locked)', ph === phThrow && r.radius === L.radiusFromGauge(gThrow));
  const ph1 = L.stepGauge(ph, 'aim', g.thrown, 0.05);
  check('back in aim: resumes from the frozen phase at the same constant speed (v9), no jump', Math.abs(ph1 - phThrow - L.gaugeOmega(0) * 0.05) < 1e-12 && Math.abs(L.gaugeValue(ph1) - gThrow) < 0.2);
  // 向き：止まった位相が上昇中（sin>0）なら再開後も上昇、下降中なら下降
  const dirOk = [0.7, 2.2, 3.6, 5.5].every(p0 => { const p1 = L.stepGauge(p0, 'aim', 1, 0.01); return Math.sign(L.gaugeValue(p1) - L.gaugeValue(p0)) === Math.sign(Math.sin(p0)); });
  check('resume keeps the direction of travel (rising stays rising, falling stays falling)', dirOk);
  check('ending (last ball) keeps the gauge frozen', L.stepGauge(2.5, 'ending', 5, 0.05) === 2.5);
}

console.log('trivial strategy (synthetic 3-letter column, rotation frozen front-on)');
{
  // 3 個の 26×26 セルを縦に並べた「太い字」の代用品（各セルの中央 60% 程度が埋まる十字＋枠）
  const bm = () => { const w = 26, h = 26, d = []; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const frame = (r >= 3 && r <= 6 || r >= 19 && r <= 22) && c >= 3 && c <= 22 || (c >= 3 && c <= 6 || c >= 19 && c <= 22) && r >= 3 && r <= 22; const cross = (r >= 11 && r <= 14 && c >= 3 && c <= 22) || (c >= 11 && c <= 14 && r >= 3 && r <= 22); d.push(frame || cross ? 1 : 0); } return { w, h, data: d }; };
  const built = L.voxelsFromBitmaps([bm(), bm(), bm()], 4, 2);
  const m = L.buildModel(built.voxels);
  const shoot = (pts) => { const g = L.createGame(m, built.letters); for (const [x, y] of pts) { const h = L.raycast(m, [x, y, 50], [0, 0, -1]); L.resolveThrow(g, h ? { point: h.point, dir: [0, 0, -1] } : null); } return L.percent(g); };
  const C = built.letters.map(l => [l.cx + 0.5, l.cy + 0.5]);
  const same = shoot([C[1], C[1], C[1], C[1], C[1]]);
  const spread = shoot([C[0], C[1], C[2], [C[0][0], (C[0][1] + C[1][1]) / 2], [C[1][0], (C[1][1] + C[2][1]) / 2]]);
  const none = (() => { const g = L.createGame(m, built.letters); return { p: L.percent(g), over: L.isOver(g) }; })();
  check('doing nothing: 0% and not over', none.p === 0 && !none.over);
  check('5 balls on the same spot stays low (≤ 40%)', same <= 40, same + '%');
  check('5 balls spread over the letters is much higher (≥ 2× same-spot)', spread >= same * 2, `spread ${spread}% vs same ${same}%`);
  check('all misses = 0%', shoot([[100, 100], [100, 100], [100, 100], [100, 100], [100, 100]]) === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
