// OGP画像（public/ogp.png、1200×630）を作る。 npm run ogp
// 1) 実際のゲーム（index.html）を playwright-core＋インストール済みChromeで開き、確認用の入口 window.__bf で
//    角度とゲージを固定して数球投げ、文字が一部黒く塗れた場面を撮る。
// 2) その画面を背景（ぼかし）と右のスマホ枠に使い、タイトル・遊び方の一言・公開URLを重ねて書き出す。
// 投げる位置・角度・ゲージは固定なので、塗られ方は毎回ほぼ同じになる（しぶきの粒だけ乱数）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SLUG = process.env.SLUG || 'black-friday';           // 公開URLの slug（2026-11-26 確定）
const URL_TEXT = `game.chozo.net/${SLUG}/`;
const OUT = path.join(ROOT, 'public/ogp.png');

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  // ---- 1) ゲーム画面を撮る ----
  const page = await browser.newPage({ viewport: { width: 390, height: 693 }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
  await page.waitForFunction(() => window.__bf && window.__bf.state());
  await page.evaluate(() => { __bf.setBgmMuted(true); __bf.start(); });
  await page.waitForFunction(() => __bf.state().phase === 'aim');
  // 「金」と「日」の端だけを小さめのしぶきで塗る（文字が読めるまま、塗られているのが分かる絵にする）。「曜」は塗らない
  // [x, y（ボクセル座標。x: 0〜G、y: 0〜H、上が大きい）, ゲージ]。金は y 56〜82、日は y 0〜26
  const shots = [[5, 58, 0.3], [21, 58, 0.3], [21, 18, 0.45], [4, 2, 0.45]];
  for (const [x, y, g] of shots) {
    const before = (await page.evaluate(() => __bf.state())).thrown;
    await page.evaluate(([xx, yy, gg]) => { __bf.setRotation(0.28, true); __bf.setGauge(gg); __bf.aimVoxel(xx, yy); __bf.throwBall(); }, [x, y, g]);
    await page.waitForFunction(n => __bf.state().thrown > n && __bf.state().phase === 'aim', before, { timeout: 180000, polling: 50 });
  }
  const hist = await page.evaluate(() => __bf.state().history.map(h => h.miss ? 'miss' : h.newly));
  console.log('painted per throw:', hist.join(', '));
  await page.evaluate(() => { __bf.setRotation(0.28, true); __bf.setGauge(0.9); __bf.aimVoxel(__bf.dims.G * 0.5, __bf.dims.H * 0.5); });
  await page.waitForTimeout(1500); // 塗れたブロックのポン演出と％表示が落ち着くまで
  await page.addStyleTag({ content: '#hint,#bgmBtn{opacity:0!important}' });
  await page.waitForTimeout(300);
  const shot = await page.locator('#app').screenshot();
  const pct = (await page.evaluate(() => __bf.state())).percent;
  await page.close();
  const img = 'data:image/png;base64,' + shot.toString('base64');

  // ---- 2) OGP を組む ----
  const splat = (x, y, s, r, op = 1) => `<svg class="splat" style="left:${x}px;top:${y}px;width:${s}px;height:${s}px;transform:rotate(${r}deg);opacity:${op}" viewBox="0 0 100 100"><path d="M50 12c8 0 9 14 16 15s14-9 19-3-6 13-2 20 15 6 13 14-14 4-17 11 6 16-1 19-11-9-18-8-10 15-18 13-3-15-9-19-17 3-18-5 11-10 9-17-13-11-8-17 15 2 19-4S42 12 50 12z" fill="#0b0b0b"/><circle cx="88" cy="22" r="5" fill="#0b0b0b"/><circle cx="14" cy="82" r="4" fill="#0b0b0b"/><circle cx="92" cy="74" r="3" fill="#0b0b0b"/></svg>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif; font-weight: 900; }
  .bg { position: absolute; inset: -40px; background: url(${img}) center 35% / cover; filter: blur(14px) saturate(1.4) brightness(.75); }
  .rays { position: absolute; left: 330px; top: 300px; width: 2400px; height: 2400px; margin: -1200px 0 0 -1200px;
    background: repeating-conic-gradient(rgba(255,214,70,.42) 0 7deg, rgba(255,214,70,0) 7deg 15deg); }
  .dots { position: absolute; inset: 0; background: radial-gradient(rgba(255,64,110,.55) 2.2px, transparent 2.8px) 0 0 / 16px 16px;
    -webkit-mask: linear-gradient(115deg, transparent 50%, #000 85%); }
  .vig { position: absolute; inset: 0; background: radial-gradient(70% 90% at 30% 50%, rgba(0,0,0,0) 30%, rgba(0,0,0,.45) 100%); }
  .splat { position: absolute; }
  .phone { position: absolute; left: 812px; top: 34px; width: 318px; height: 565px; border-radius: 34px; border: 7px solid #111;
    box-shadow: 0 0 0 5px #ffd93b, 14px 18px 0 5px #ff3d6e, 0 26px 50px rgba(0,0,0,.55); transform: rotate(5deg); overflow: hidden;
    background: url(${img}) center / cover; }
  .ribbon { position: absolute; left: 58px; top: 44px; padding: 8px 22px 9px; background: #ff2d55; color: #fff; font-size: 30px; letter-spacing: .14em;
    border: 4px solid #111; border-radius: 10px; transform: rotate(-4deg); box-shadow: 6px 6px 0 #111; }
  .title { position: absolute; left: 50px; top: 118px; font-size: 124px; line-height: 1.04; letter-spacing: -.02em; color: #fff;
    -webkit-text-stroke: 15px #111; paint-order: stroke fill; filter: drop-shadow(8px 9px 0 #ff3d6e); }
  .title .kuro { color: #0b0b0b; -webkit-text-stroke: 15px #ffd93b; }
  .title .l2 { display: block; margin-left: 34px; }
  .how { position: absolute; left: 58px; top: 446px; padding: 12px 26px 14px; background: #ffd93b; color: #111; font-size: 34px;
    border: 4px solid #111; border-radius: 999px; box-shadow: 6px 6px 0 #111; transform: rotate(-1.5deg); }
  .how b { color: #e8273f; }
  .tag { position: absolute; left: 545px; top: 128px; width: 196px; height: 150px; transform: rotate(-12deg); filter: drop-shadow(6px 7px 0 #111); }
  .url { position: absolute; left: 60px; top: 548px; padding: 8px 20px 10px; background: #111; color: #fff; font-size: 27px; letter-spacing: .03em; border-radius: 12px; }
  .url span { color: #ffd93b; }
  </style></head><body>
  <div class="bg"></div><div class="rays"></div><div class="dots"></div><div class="vig"></div>
  ${splat(470, 18, 80, 20)}${splat(700, 300, 90, -15)}${splat(1100, 520, 120, -30)}${splat(-30, 560, 120, 60, .9)}${splat(735, 520, 70, 10)}
  <div class="phone"></div>
  <div class="ribbon">BLACK FRIDAY</div>
  <div class="title"><span class="kuro">黒</span>に<span class="l2">塗りつぶせ</span></div>
  <div class="how">ボールを投げて<b>「金曜日」</b>を黒く塗れ！</div>
  <svg class="tag" viewBox="0 0 196 150"><path d="M38 8H188V142H38L6 75Z" fill="#e8273f" stroke="#111" stroke-width="6" stroke-linejoin="round"/>
    <circle cx="36" cy="75" r="9" fill="#111"/><text x="113" y="78" font-size="62" fill="#fff" text-anchor="middle" font-family="Hiragino Sans" font-weight="900">${pct}%</text>
    <text x="113" y="124" font-size="38" fill="#ffd93b" text-anchor="middle" font-family="Hiragino Sans" font-weight="900">OFF</text></svg>
  <div class="url">▶ <span>${URL_TEXT}</span></div>
  </body></html>`;
  const op = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await op.setContent(html);
  await op.evaluate(() => document.fonts.ready);
  await op.screenshot({ path: OUT });
  console.log(`wrote ${path.relative(ROOT, OUT)} (1200×630, ${pct}% painted, url ${URL_TEXT})`);
} finally {
  await browser.close();
}
