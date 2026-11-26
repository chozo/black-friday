// 告知動画の台本（黒に塗りつぶせ）。npm run promo で撮影 → ../video/black-friday-promo.mp4
// 照準は文字の回転軸（横の真ん中 x = G/2）に合わせるので、回転が速くなっても当たる。ゲージは state().gauge を見て投げる。
// 使える操作はスキル promo-video の references/scenario-api.md。

export const config = {
  slug: 'black-friday',
  url: 'https://game.chozo.net/black-friday/',
  orientation: 'portrait',
  game: { width: 390, height: 693 },
  serveDir: 'dist',
  gamePath: '/black-friday/',
  // BGM はゲームと同じ曲（make-bgm.mjs が書き出す）。効果音より 12〜15 dB 小さく
  music: { file: 'tools/promo/bgm.wav', volume: 0.22 },
};

const G = 26;
// 文字ごとの中心の高さ（ボクセル座標。上から 金・曜・日）
const Y = { kin: 69, you: 41, nichi: 13 };

/** 照準を (x, y) のボクセルへ、本物と同じドラッグで動かす（照準は指の 1.1 倍動くので、指はその分だけ短く動かす） */
async function dragAim(p, x, y, sec = 0.5) {
  const from = await p.call('reticlePx');
  const to = await p.call('screenOf', x, y);
  const k = 1 / 1.1;
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const u = i / 6, e = u * u * (3 - 2 * u);
    pts.push([from.x + (to.x - from.x) * k * e, from.y + (to.y - from.y) * k * e]);
  }
  await p.drag(pts, sec);
  await p.call('aimVoxel', x, y); // 回転で少しずれた分を合わせる
}

/** ゲージが条件を満たすまで撮りながら待って投げる */
async function throwWhen(p, cond, max = 3) {
  await p.until((s) => s && s.phase === 'aim' && cond(s.gauge), { max });
  await p.call('throwBall');
}
/** 投げた球が落ち着く（次の aim か ending）まで撮る */
const settle = (p, max = 4) => p.until((s) => s && s.phase !== 'flying' && s.phase !== 'flyback', { max });

// 字幕は文字の台座あたり（ゲームの上端の「のこり」「黒塗り」を隠さない。下 20% のアプリの表示も避ける）
const CAP = { y: 0.645, dur: 1.8 };
const cap = (p, text, o = {}) => p.caption(text, { ...CAP, ...o });

export default async function scenario(p) {
  await p.seed(32);
  await p.call('setBgmMuted', false);
  let fxOn = true;
  p.on('hit', (e) => {
    if (!fxOn) return;
    if (e.gauge > 0.85) { p.fx('ドバッ！', { y: 0.55, size: 96 }); p.flash({ strength: 0.55, dur: 0.2 }); p.shake(14, 0.35); }
    else if (e.gauge < 0.3) p.fx('ちょびっと…', { y: 0.55, size: 66, color: '#fff' });
  });

  // ---- 0〜2.5秒 つかみ：特大のしぶきが「金」に当たる瞬間をスローで ----
  await p.call('start');
  await p.skip(0.3);
  await p.call('aimVoxel', G / 2, Y.kin);
  for (let i = 0; i < 120; i++) { const st = await p.state(); if (st.gauge > 0.97) break; await p.skip(1 / 60); }
  p.zoom(1.35, 0.01, { x: 0.5, y: 0.3 });
  await p.call('throwBall');
  p.speed(0.4, { badge: false });
  await p.until((st) => st.phase === 'flyback', { max: 3 });
  await p.wait(0.9);
  p.speed(1);
  p.zoom(1, 0.4);

  // ---- 2.5〜6秒 タイトルと一言 ----
  p.title({ logo: 'title.svg', sub: '金色の「金曜日」を\n黒く塗れ！', dur: 3.4 });
  await p.wait(3.6);

  // ---- 6〜25秒 実際のプレイ ----
  await p.call('start');
  await p.wait(0.8);
  cap(p, 'ドラッグでねらって');
  await dragAim(p, G / 2, Y.kin + 4, 0.9);
  await p.wait(0.6);
  cap(p, 'ゲージが大きい時に\n投げる！', { dur: 2.2 });
  await p.until((st) => st.gauge < 0.2, { max: 2 }); // ゲージが下がって上がるのを1回見せる
  await throwWhen(p, (g) => g > 0.94);
  await settle(p);
  await p.wait(0.8);

  cap(p, '1球ごとに\n回転が2倍！', { dur: 2.2 });
  await dragAim(p, G / 2, Y.you, 0.8);
  await p.until((st) => st.gauge < 0.2, { max: 2 });
  await throwWhen(p, (g) => g > 0.9);
  await settle(p);
  await p.wait(0.7);

  // 惜しい失敗：ゲージが小さいときに投げると、ちょっとしか塗れない
  cap(p, 'ゲージが小さいと…', { dur: 1.6 });
  await dragAim(p, G / 2, Y.nichi + 3, 0.5);
  await throwWhen(p, (g) => g < 0.1);
  await settle(p);
  await p.wait(0.9);

  cap(p, '「日」も黒く！', { dur: 1.8 });
  await dragAim(p, G / 2, Y.nichi - 2, 0.6);
  await p.until((st) => st.gauge < 0.2, { max: 2 });
  await throwWhen(p, (g) => g > 0.9);
  await settle(p);
  await p.wait(0.8);

  cap(p, '最後は超高速！', { color: '#ffd93b', dur: 2 });
  await dragAim(p, G / 2, Y.you + 6, 0.6);
  await p.wait(0.9);
  await throwWhen(p, (g) => g > 0.92);
  p.speed(0.5, { badge: false });
  await p.until((st) => st.phase === 'ending', { max: 3 });
  await p.wait(0.6);

  // ---- 25〜27秒 クライマックス：塗れた分だけ % OFF（称号の出る結果画面は映さない。ending の間だけゆっくり見せる） ----
  fxOn = false;
  const st = await p.state();
  p.speed(0.17, { badge: false });
  p.flash({ strength: 0.5 });
  p.caption(`${st.percent}% OFF\nゲット！`, { y: 0.4, size: 84, color: '#ffd93b', dur: 2.7 });
  p.zoom(1.1, 0.8, { x: 0.5, y: 0.45 });
  await p.wait(2.6);
  p.speed(1);
  p.zoom(1, 0.01);

  // ---- 27〜30秒 エンドカード ----
  p.endCard({ logo: 'title.svg', sub: 'スマホ・PCで遊べる', cta: '今すぐ遊べる！' });
  await p.wait(3.8);
}
