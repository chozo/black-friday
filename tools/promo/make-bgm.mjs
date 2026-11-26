// 告知動画の BGM（tools/promo/bgm.wav）を書き出す。曲はゲーム本体の BGM と同じ（src/game.html の「BGM」節）。
// ゲームを Chrome で開き、__game.renderBgmPcm(秒, BPM) で OfflineAudioContext に合成した音を受け取って WAV にする。
// 動画では BPM を一定（BPM、ゲームの2〜3球目あたりの速さ）にし、ちょうど16小節（8小節ループ×2）で切って、record.mjs がくり返しつなぐ。
// 外部の音源は使っていない（著作権の心配なし）。使い方: node tools/promo/make-bgm.mjs（npm run promo の中で実行される）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const BPM = 164;
const BARS = 16;
const SEC = BARS * 4 * 60 / BPM;
const SR = 44100;

const browser = await chromium.launch({ channel: process.env.PROMO_CHROME_PATH ? undefined : 'chrome', executablePath: process.env.PROMO_CHROME_PATH });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(ROOT, 'dist/black-friday/index.html')).href);
  await page.waitForFunction(() => window.__game && window.__game.renderBgmPcm);
  const b64 = await page.evaluate(([s, b]) => window.__game.renderBgmPcm(s, b), [SEC, BPM]);
  const pcm = Buffer.from(b64, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(here, 'bgm.wav'), Buffer.concat([h, pcm]));
  console.log(`bgm.wav: ${SEC.toFixed(2)} 秒（BPM ${BPM}、${BARS} 小節）`);
} finally {
  await browser.close();
}
