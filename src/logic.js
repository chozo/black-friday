// 金曜日、黒く塗れ — 純ロジック（ブラウザでは window.BFLogic、Node では module.exports）
// ボクセル座標の集合に対する純関数だけを置く。three.js / DOM には依存しない。
// 座標系：ボクセル (x,y,z) は [x,x+1]×[y,y+1]×[z,z+1] を占める。y が上、z が手前（文字の正面 = +z）。
var BFLogic = (function () {
  'use strict';

  var BALLS = 5;
  var BASE_SPEED = 0.55;  // 1球目の回転速度 rad/s（v3：v1 と同じ 0.55 に戻す）
  var SPEED_MULT = 2;     // v5：1球投げるごとに回転速度が 2 倍（掛け算）。0.55 → 1.10 → 2.20 → 4.40 → 8.80
  var R_MAX = 11;         // 最大塗り半径（ボクセル単位）。位置・角度による差は無し（v2 から）
  var R_MIN_FRAC = 0.25;  // v5：ゲージ最小（g=0）での半径 = R_MAX の 25% = 2.75
  var GAUGE_BASE_PERIOD = 2.8; // v5：ぬり範囲ゲージの基準周期（秒、v5–v8 の1球目）
  var GAUGE_SPEED_MULT = 3;    // v9：ゲージ速度は全球で一定（v8 の3球目と同じ ×3）。1球ごとの加速は廃止
  var GAUGE_PERIOD = GAUGE_BASE_PERIOD / GAUGE_SPEED_MULT; // v9：1往復 ≈ 0.933 s（1〜5球目・リトライ後も同じ）

  function key(x, y, z) { return x + ',' + y + ',' + z; }

  // ---- ビットマップ（文字ごと）→ ボクセル集合。最初の文字が一番上（縦書き）。
  // bitmaps: [{w, h, data: 0/1 配列（行優先、row 0 が上）}]
  function voxelsFromBitmaps(bitmaps, depth, gap) {
    var voxels = [], letters = [];
    var n = bitmaps.length, yTop = 0;
    for (var i = 0; i < n; i++) yTop += bitmaps[i].h + (i ? gap : 0);
    var y0 = yTop;
    for (var c = 0; c < n; c++) {
      var b = bitmaps[c];
      var top = y0;                // このセルの上端（y 座標）
      for (var r = 0; r < b.h; r++) for (var col = 0; col < b.w; col++) {
        if (!b.data[r * b.w + col]) continue;
        var y = top - 1 - r;
        for (var z = 0; z < depth; z++) voxels.push([col, y, z]);
      }
      letters.push({ x0: 0, x1: b.w, y0: top - b.h, y1: top, cx: b.w / 2, cy: top - b.h / 2, hw: b.w / 2, hh: b.h / 2 });
      y0 = top - b.h - gap;
    }
    return { voxels: voxels, letters: letters, depth: depth };
  }

  // ---- モデル：占有集合・境界・表面ボクセル
  function buildModel(voxels) {
    var occ = Object.create(null);
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < voxels.length; i++) {
      var v = voxels[i];
      occ[key(v[0], v[1], v[2])] = true;
      for (var a = 0; a < 3; a++) { if (v[a] < min[a]) min[a] = v[a]; if (v[a] > max[a]) max[a] = v[a]; }
    }
    var surface = [], uniq = Object.create(null);
    for (var j = 0; j < voxels.length; j++) {
      var p = voxels[j], k = key(p[0], p[1], p[2]);
      if (uniq[k]) continue; uniq[k] = true;
      if (isSurface(occ, p[0], p[1], p[2])) surface.push(p);
    }
    return { occ: occ, min: min, max: max, surface: surface, count: Object.keys(uniq).length };
  }

  var N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  // 6近傍のどれかが空なら表面
  function isSurface(occ, x, y, z) {
    for (var i = 0; i < 6; i++) if (!occ[key(x + N6[i][0], y + N6[i][1], z + N6[i][2])]) return true;
    return false;
  }

  // ---- レイキャスト（Amanatides–Woo のボクセル DDA）。o, d はボクセル座標系。
  // 戻り値 {voxel:[x,y,z], t, point:[x,y,z], normal:[nx,ny,nz]} または null
  function raycast(model, o, d, tMax) {
    if (tMax === undefined) tMax = Infinity;
    var lo = model.min, hi = [model.max[0] + 1, model.max[1] + 1, model.max[2] + 1];
    var tEnter = -Infinity, tExit = Infinity, enterAxis = -1;
    for (var a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-12) { if (o[a] < lo[a] || o[a] > hi[a]) return null; continue; }
      var t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
      if (t1 > t2) { var tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tEnter) { tEnter = t1; enterAxis = a; }
      if (t2 < tExit) tExit = t2;
    }
    if (tEnter > tExit || tExit < 0 || tEnter > tMax) return null;
    var t = Math.max(tEnter, 0);
    var normal = [0, 0, 0];
    if (tEnter >= 0 && enterAxis >= 0) normal[enterAxis] = d[enterAxis] > 0 ? -1 : 1;
    var p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    var idx = [0, 0, 0], step = [0, 0, 0], tNext = [0, 0, 0], tDelta = [0, 0, 0];
    for (var b = 0; b < 3; b++) {
      idx[b] = Math.floor(p[b]);
      if (b === enterAxis && tEnter >= 0) idx[b] = d[b] > 0 ? lo[b] : hi[b] - 1; // 境界面上の丸め誤差対策
      if (idx[b] < lo[b]) idx[b] = lo[b];
      if (idx[b] > hi[b] - 1) idx[b] = hi[b] - 1;
      if (d[b] > 0) { step[b] = 1; tNext[b] = (idx[b] + 1 - o[b]) / d[b]; tDelta[b] = 1 / d[b]; }
      else if (d[b] < 0) { step[b] = -1; tNext[b] = (idx[b] - o[b]) / d[b]; tDelta[b] = -1 / d[b]; }
      else { step[b] = 0; tNext[b] = Infinity; tDelta[b] = Infinity; }
    }
    var limit = Math.min(tExit, tMax);
    for (var guard = 0; guard < 10000; guard++) {
      if (model.occ[key(idx[0], idx[1], idx[2])]) {
        return { voxel: idx.slice(), t: t, point: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], normal: normal };
      }
      var ax = tNext[0] < tNext[1] ? (tNext[0] < tNext[2] ? 0 : 2) : (tNext[1] < tNext[2] ? 1 : 2);
      t = tNext[ax];
      if (t > limit) return null;
      idx[ax] += step[ax]; tNext[ax] += tDelta[ax];
      normal = [0, 0, 0]; normal[ax] = -step[ax];
      if (idx[ax] < lo[ax] || idx[ax] > hi[ax] - 1) return null;
    }
    return null;
  }

  // ---- ぬり範囲ゲージ（v5）
  // g(phase) = 0.5 - 0.5·cos(phase)：0（MIN）〜1（MAX）を正弦的に往復。phase は角速度 2π/周期 で進む。
  // v9：速さは投げた球数に依らず一定（thrown は互換のため受け取るだけ）。×3、周期 2.8/3 ≈ 0.933 s、ω ≈ 6.732 rad/s
  function gaugeSpeedMult(thrown) { return GAUGE_SPEED_MULT; }
  function gaugePeriod(thrown) { return GAUGE_PERIOD; }
  function gaugeOmega(thrown) { return 2 * Math.PI / GAUGE_PERIOD; }        // rad/s（phase の進み）
  function gaugeValue(phase) { return 0.5 - 0.5 * Math.cos(phase); }
  // v7：ゲージが進むのは aim（狙い中）だけ。投げた瞬間から flying／flyback（着弾後の間）／ending は止まったまま（投げた値を見せる）。
  // 次の球の aim に戻ると、止まった位相（＝値と向き）から、同じ一定の速さ（v9）で再開する（ジャンプ無し）。
  function gaugeRuns(phase) { return phase === 'aim'; }
  function stepGauge(gPhase, uiPhase, thrown, dt) { return gaugeRuns(uiPhase) ? gPhase + gaugeOmega(thrown) * dt : gPhase; }
  // ゲージ値 → 塗り半径（v6：投げた瞬間の値を使う）。g=0 → 2.75（25%）、g=1 → 11（100%）、線形
  function radiusFromGauge(g) {
    g = Math.max(0, Math.min(1, +g || 0));
    return R_MAX * (R_MIN_FRAC + (1 - R_MIN_FRAC) * g);
  }
  function rangePercent(g) { return Math.round(radiusFromGauge(g) / R_MAX * 100); } // 表示用 25〜100

  // ---- 着弾 → 塗り半径
  // 当たった位置・文字の角度による差は無し（v2 から）。v5：半径はゲージ値 gauge で決まる（v6：投げた瞬間の値。beginThrow 参照）
  // （gauge 省略時は R_MAX = ゲージ満タン扱い）。外れは resolveThrow で別扱い（何も塗らない）。
  // letter は演出用に「どの文字に当たったか」だけ返す。
  function hitQuality(point, dir, letters, gauge) {
    var best = null, bd = Infinity;
    for (var i = 0; i < letters.length; i++) {
      var L = letters[i];
      var dx = (point[0] - L.cx) / L.hw, dy = (point[1] - L.cy) / L.hh;
      var dd = Math.hypot(dx, dy);
      if (dd < bd) { bd = dd; best = i; }
    }
    return { radius: gauge === undefined || gauge === null ? R_MAX : radiusFromGauge(gauge), letter: best };
  }

  // ---- ゲーム状態
  function createGame(model, letters, opts) {
    opts = opts || {};
    return {
      model: model, letters: letters || [],
      painted: Object.create(null), paintedCount: 0,
      total: model.surface.length,
      balls: opts.balls || BALLS, ballsLeft: opts.balls || BALLS, thrown: 0,
      locked: null, // v6：投げた瞬間に確定したゲージ値と半径 {gauge, radius, range}（飛行中だけ非 null）
      history: []
    };
  }

  // 表面ボクセルのうち、中心が着弾点から radius 以内のものを塗る。新しく塗れた数とそのリストを返す（重ね当ては増えない）
  function paint(game, center, radius) {
    var s = game.model.surface, r2 = radius * radius, added = [];
    for (var i = 0; i < s.length; i++) {
      var v = s[i];
      var dx = v[0] + 0.5 - center[0], dy = v[1] + 0.5 - center[1], dz = v[2] + 0.5 - center[2];
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      var k = key(v[0], v[1], v[2]);
      if (game.painted[k]) continue;
      game.painted[k] = true; game.paintedCount++; added.push(v);
    }
    return added;
  }

  function coverage(game) { return game.total ? game.paintedCount / game.total : 0; }
  // 割引率 = 被覆率の整数％（切り捨て）。全部塗れたときだけ 100。
  function percent(game) { return game.total ? Math.floor(game.paintedCount * 100 / game.total) : 0; }

  // v6：投げた瞬間にゲージ値を確定する。半径 = radiusFromGauge(gauge) を game.locked に保存し、着弾時の resolveThrow で使う。
  // ゲーム終了後、または既に飛行中（locked が残っている）なら投げられない → null。
  function beginThrow(game, gauge) {
    if (game.ballsLeft <= 0 || game.locked) return null;
    var g = Math.max(0, Math.min(1, +gauge || 0));
    game.locked = { gauge: g, radius: radiusFromGauge(g), range: rangePercent(g) };
    return game.locked;
  }

  // 1球を消費して結果を確定する。hit = {point, dir, gauge?}（ボクセル座標系）または null（外れ）。
  // v6：beginThrow で確定した game.locked があれば、その（投げた瞬間の）ゲージ値で塗る。hit.gauge は無視。
  // locked が無いとき（ロジック単体の呼び出し）は従来どおり hit.gauge、省略時は R_MAX。
  function resolveThrow(game, hit) {
    if (game.ballsLeft <= 0) return null;
    game.ballsLeft--; game.thrown++;
    var lock = game.locked; game.locked = null;
    if (hit && lock) hit = { point: hit.point, dir: hit.dir, gauge: lock.gauge };
    var res;
    if (!hit) {
      res = { miss: true, added: [], newly: 0, wasted: true, radius: 0, quality: null };
    } else {
      var qual = hitQuality(hit.point, hit.dir, game.letters, hit.gauge);
      var added = paint(game, hit.point, qual.radius);
      res = { miss: false, added: added, newly: added.length, wasted: added.length === 0, radius: qual.radius, quality: qual };
    }
    res.lockedGauge = lock ? lock.gauge : null;
    res.coverage = coverage(game); res.percent = percent(game);
    res.ballsLeft = game.ballsLeft; res.done = game.ballsLeft === 0;
    game.history.push({ miss: res.miss, newly: res.newly, percent: res.percent });
    return res;
  }

  function isOver(game) { return game.ballsLeft <= 0; }
  function rotationSpeed(thrown) { return BASE_SPEED * Math.pow(SPEED_MULT, thrown); } // v5: 0.55, 1.10, 2.20, 4.40, 8.80

  // 結果カードの段階メッセージ
  function tier(p) {
    if (p >= 85) return { id: 'black', title: 'ほぼ真っ黒！', msg: '完璧なブラックフライデー。財布のひもを締めて挑め！' };
    if (p >= 60) return { id: 'sale', title: '大セール級！', msg: 'かなり黒い。これは本気の値下げだ。' };
    if (p >= 40) return { id: 'ok', title: 'そこそこ黒い', msg: 'まずまずのセール。もう少し金色を潰せたかも。' };
    return { id: 'gold', title: 'まだ金色が残念…', msg: '金曜日が輝いたまま。狙いとタイミングを見直そう。' };
  }

  return {
    BALLS: BALLS, SPEED_MULT: SPEED_MULT, BASE_SPEED: BASE_SPEED, R_MAX: R_MAX, R_MIN_FRAC: R_MIN_FRAC,
    GAUGE_BASE_PERIOD: GAUGE_BASE_PERIOD, GAUGE_SPEED_MULT: GAUGE_SPEED_MULT, GAUGE_PERIOD: GAUGE_PERIOD, gaugeSpeedMult: gaugeSpeedMult, gaugePeriod: gaugePeriod, gaugeOmega: gaugeOmega,
    gaugeValue: gaugeValue, gaugeRuns: gaugeRuns, stepGauge: stepGauge, radiusFromGauge: radiusFromGauge, rangePercent: rangePercent,
    key: key, voxelsFromBitmaps: voxelsFromBitmaps, buildModel: buildModel, isSurface: isSurface,
    raycast: raycast, hitQuality: hitQuality, createGame: createGame, paint: paint,
    coverage: coverage, percent: percent, beginThrow: beginThrow, resolveThrow: resolveThrow, isOver: isOver,
    rotationSpeed: rotationSpeed, tier: tier
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = BFLogic;
