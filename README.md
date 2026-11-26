# 黒に塗りつぶせ

ボールを投げて、金色に輝く「金曜日」の文字を黒く塗りつぶすブラックフライデーのミニゲーム。塗れた分だけ % OFF を勝ち取れる。

- **遊ぶ**: https://game.chozo.net/black-friday/
- **ソース**: https://github.com/chozo/black-friday
- 縦型（9:16）。スマホ・PCのブラウザで遊べる。1回は5球、30秒〜1分ほど。

## 遊び方

1. 画面をドラッグして照準を合わせる（PCは矢印キーでも動く）。
2. 右のゲージ（ぬり範囲）が大きいときに「投げる」（スペース／Enterでも投げられる）。投げた瞬間のゲージで塗れる広さが決まる。
3. 1球ごとに文字の回転が2倍に速くなる。5球投げ終わったら、黒く塗れた割合がそのまま「◯% OFF」になる。
4. 左下の音符ボタン（または M キー）でBGMのオン／オフ。

## 開発・公開

```sh
npm install            # three 0.187.0 / playwright-core / wrangler
npm run dev            # ビルドして http://localhost:5173/ で配信（同じWi-Fiのスマホは表示されるLANのIPで）
npm run build          # src/ から index.html（単一ファイル）と dist/black-friday/ を作る
npm test               # ロジックテスト（Node）
npm run test:screens   # 画面テスト（インストール済みChromeをヘッドレスで使う。20分以上かかる）
npm run ogp            # OGP画像 public/ogp.png を作り直す
npm run promo          # 告知動画（縦型 1080×1920・約30秒）を撮って ../video/ に書き出す
npm run deploy         # ビルドして Cloudflare Workers へ公開
```

- 公開先は Cloudflare Workers + Static Assets（Worker 名 `black-friday`、ルート `game.chozo.net/black-friday` と `game.chozo.net/black-friday/*`、workers.dev は使わない）。`dist/black-friday/` に `index.html`・`favicon.svg`・`ogp.png` が入る。
- `public/` の中身（`favicon.svg`・`ogp.png`）はビルドで `dist/black-friday/` 直下にコピーされる。favicon はさらに data URI として `index.html` にも埋め込む。
- ルートの `index.html` はビルドの生成物（Git には入れない）。

### 告知動画

- `npm run promo` で、ビルド → BGM の書き出し（`tools/promo/make-bgm.mjs`）→ 撮影と書き出し（`tools/promo/record.mjs`）を行う。台本は `tools/promo/scenario.mjs`、見た目は `tools/promo/promo.css`、タイトルの絵は `tools/promo/title.svg`。
- 出力は `../video/black-friday-promo.mp4`（1080×1920、30fps、約29.6秒、-14 LUFS）、表紙 `black-friday-promo-cover.jpg`、確認用の一覧 `black-friday-promo-sheet.jpg`。動画と `../video/work/` はリポジトリに入れない。
- `PROMO_EVERY=15 npm run promo` で15コマおきの一覧（`black-friday-promo-preview.jpg`、赤い領域はショート動画アプリの表示が重なる場所）だけを作って構成を確かめられる。`PROMO_ENCODE_ONLY=1 PROMO_SCENARIO=scenario.mjs node tools/promo/record.mjs` で撮り直さずに音だけ書き出し直せる。
- 実際のゲームを `window.__game`（`manual` / `step` / `state` / `touchDown`・`touchMove`・`touchUp` / `throwBall` / `drainEvents` / `audio.capture`・`drain`・`render` / `renderBgmPcm`）で1コマずつ進めて撮る。効果音は記録して OfflineAudioContext で鳴らし直す。BGM はゲームと同じ曲を BPM 164 一定で16小節書き出してくり返す（外部の音源なし）。BGM は効果音よりおよそ13dB小さい（`config.music.volume` 0.22）。
- 照準は文字の回転軸（横の真ん中）に合わせるので、回転が速くなっても当たる。称号が出る結果画面は映さず、終わる直前の塗り率を「◯% OFF ゲット！」として見せる。

## ライセンス

[MIT License](./LICENSE)（Copyright (c) 2026 chozo）です。改変・再配布・商用利用ができます。利用するときは、著作権表示とライセンス文を残してください。

3D描画に [Three.js](https://threejs.org/) r187（MIT License、Copyright © 2010-2026 three.js authors）を使い、ビルドで `index.html` に埋め込んでいます。文字は端末のシステムフォントから描いた形をブロックにしており、画像・BGM・効果音はすべてコードで描画・合成しています。ほかの外部素材やフォントは含んでいません。

「黒に塗りつぶせ」「chozo」の名前やロゴを、作者が関わっているように見える形で使わないでください。

---

（ここから下は開発の記録。v10 までの開発名は prototype v10 (plan B, 5 balls)、v1–v9 のタイトルは「金曜日、黒く塗れ」。）

## 引き継ぎメモ（2026-11-26、Mac miniのClaude Codeへ）

- **正本はここ**：Mac mini `~/lab/product/07_webgame/032_black_friday/app/`。ここが今後の開発の正本で、続きはMac miniのClaude Codeが担当する。開発元はMuse VM上のClaude Code（Museの指示・検証の下で制作）。ゲームカタログでは **No.032** になる予定。
- **現在の状態**：2026-11-26 にユーザーの指示で公開した（v10 ＋ BGM・favicon・OGP。GitHub `chozo/black-friday`、`https://game.chozo.net/black-friday/`）。スマホ実機での確認は 2026-11-26 に完了（ユーザー）。
- **ローカル環境（Mac mini、2026-11-26 用意）**：`npm install` で three 0.187.0 と playwright-core を `app/node_modules` に入れる（`../tools` は不要。あればフォールバックとして使う）。`npm run dev` でビルドしてから `http://localhost:5173/` で配信する（同じWi-Fiのスマホは表示されるLANのIPで開ける）。ほかに `npm run build` / `npm test`（ロジック）/ `npm run test:screens`（画面テスト。インストール済みChromeをヘッドレスで使う）。
- **BGM・favicon（2026-11-26 追加）**：ポップなBGMを Web Audio でその場で合成して鳴らす（外部の音源なし。`src/game.html` の「BGM」節、調整値は `BGM_BPM` / `BGM_BPM_STEP` / `BGM_VOL`）。曲は C→Am→F→G の8小節ループで、BPM 148 から1球ごとに +8（最大180）。スタートで鳴り始め、結果画面で止まり、もう一度で最初から。左下の音符ボタンか M キーでBGMだけオン／オフ（`localStorage` の `bf_bgm_off`）。タブが裏に回ると音を止める。BGM の音量は効果音よりおよそ 13〜15 dB 小さい（`__bf.renderBgm(秒)` で RMS を測れる）。favicon は `public/favicon.svg`（白いふち付きの黒い「金」、背景透過）で、ビルド時に data URI にして `index.html` に入れる（単一ファイルのまま）。テスト用に `__bf.bgm()` / `__bf.setBgmMuted(m)` / `__bf.renderBgm(sec, thrown)` を追加。
- **OGP画像（2026-11-26 追加）**：`public/ogp.png`（1200×630）。`npm run ogp`（`tools/ogp/make-ogp.mjs`）で、実際のゲームを `window.__bf` で角度・ゲージ固定のまま「金」と「日」の端に4球投げた場面（文字が読めるまま端だけ黒い。塗り率 約12%）を撮り、ポップな集中線・水玉・しぶき・値札と、タイトル・遊び方の一言・公開URLを重ねて作り直せる（しぶきの粒以外は毎回ほぼ同じ絵）。公開URLの slug は `black-friday`（2026-11-26 確定、`https://game.chozo.net/black-friday/`）。変える場合は `tools/ogp/make-ogp.mjs` の `SLUG` と `src/game.html` の `og:url` / `og:image` を直して `npm run ogp` → `npm run build`。公開時は `public/` の `favicon.svg` と `ogp.png` を `<slug>/` 直下に置く。
- **ビルド**：`node build.js` で `src/logic.js` + `src/game.html` から単一ファイル `index.html`（約2.2MB、three.jsインライン）を生成。ソースを直したら必ず再ビルドすること。
- **テスト**：`node --test tests/logic.test.js`（84件）、`node tests/screens.js`（Playwright、83件、ソフトウェアWebGLで約1fpsのため20分強かかる）。v10時点で両方全通過（検証ログは開発元に `tests/tmp/screens_v10_muse.log` 等。ここには含めていない）。
- **絶対に守る地雷**：JS文字列の中に `<a href=` を書かないこと。Museアプリのプレビューが真っ黒になる既知の問題で、build.jsが検出して失敗させる。
- **テスト用フック**：`window.__bf`（state/start/retry/aim/throwBall/setRotation/getGauge/setGauge/unpinGauge/locked/lastThrowGauge 等）。画面テストはこれを使う。
- **ユーザー決定済みのルール（勝手に変えない）**：文字は縦積み（金／曜／日）；回転は1球ごとに2倍（0.55→1.10→2.20→4.40→8.80 rad/s）；塗り範囲はゲージで決まり、判定は「投げる」ボタンを押した瞬間（v6〜）、投げた瞬間にゲージは凍結して着弾後しばらく止まったまま、次球の照準開始で凍結値から再開（v7〜）；ゲージ速度は全ボール固定で周期 約0.933秒＝旧3球目の速さ（v9〜）；ゲージの大小は色ではなく大きさで表現（帯は上太・下細のテーパー、マーカー直径は範囲割合に比例、最大26px⇔最小6.5px）（v8〜）；タイトルは「黒に塗りつぶせ」、BLACK FRIDAYは大きな金文字、遊び方は3ステップ図解（v10〜）。
- **実機確認**：2026-11-26 にユーザーがスマホ実機で確認済み（タッチ・フレームレート・BGMと効果音・5球目の速さを含む）。
- **記録**：Notion「ゲームアイデア」DBのレコード名は「金曜日、黒く塗れ」。仕様変更をしたらDB記録への反映もセット（ユーザーとの約束）。
- 旧バージョンのバックアップ（v1_backup〜v9_backup）は開発元VMにのみあり、ここには移していない。必要ならユーザー経由で Muse に頼むこと。

## 概要（英語の開発記録）

Built from `SPEC.md`. Open `index.html` directly: it's a single self-contained file, about 2.1 MB with three.js r187 inlined. It makes no external requests and loads no fonts.

## How to play
- Press **スタート**. The gold block letters 「金曜日」 (stacked vertically to suit the 9:16 screen) keep turning on a pedestal.
- **Drag** anywhere to move the reticle. Arrow keys also work on desktop. Press **投げる** (or Space) to throw a black paint ball.
- The ball flies from the bottom of the screen to the reticle, and the letters keep turning while it's in the air. When it hits, the blocks around the impact turn matte black, with a splash sound, flying droplets and a ripple of black blocks popping in.
  - Where the ball lands and how far the letters have turned still make no difference (since v2). **v5:** the splash size comes from the **ぬり範囲 gauge** on the right. A marker keeps sliding between MIN and MAX. **v6:** its value at the moment you **throw** (press 投げる / Space) locks in the splash radius (25–100%) for that ball; **v7:** the gauge also **stops at that value** the moment you throw, so you can see what you threw at. While it is frozen (flight, impact and the short pause after it) the marker and the % readout turn gold and 「決定」 appears under the %. When the next ball's aim starts, the gauge carries on from the same spot in the same direction (**v9:** always at the same constant speed; v7–v8 resumed at the new, faster ball's speed). (v6: the marker kept moving during the flight.) On impact you see the locked-in 「範囲 N%」 under the 「ベチャッ！ +N%」 toast, and the gauge marker flashes red.
  - Hitting blocks that are already black adds nothing (重ね塗り…ムダ). A miss wastes the ball (ハズレ).
- You get 5 balls in total. **v5:** the letters start at 0.55 rad/s and the spin **doubles** after each ball (0.55 → 1.10 → 2.20 → 4.40 → 8.80 rad/s), so the 5th ball is 16× the first. **v9:** the gauge runs at one **constant** speed for all 5 balls (period 2.8/3 ≈ 0.933 s, the old ball-3 speed); v5–v8 sped it up with every ball (×1 → ×5). After the 5th ball, the share of surface blocks you blackened becomes the discount: **「N% OFF を勝ち取った！ オトクな買い物をしてね」**, with a message for the score band (85+ / 60–84 / 40–59 / <40). **もう一度** starts a new game.

## v10 changes (title screen only; gameplay identical to v9)
- **New title 「黒に塗りつぶせ」.** The `<title>` tag and this heading changed too. v9 is backed up in `v9_backup/` (src, build.js, index.html, tests, README).
- **Headline layout:** two full-width lines at the top of the title screen.
  - Line 1: **BLACK FRIDAY** in gold gradient (`#bfBig`). Font size is 11.8% of the frame width, which is 46.0px on a 390px-wide frame.
  - Line 2: the main title **「黒に塗りつぶせ」** (`h1#tMain`) in white with a heavy black shadow. Font size is 12.8% of the frame width (49.9px at 390). 「黒」 alone is drawn black with a gold outline.
  - The main title is a little larger and sits in the white "headline" slot. BLACK FRIDAY reads as the gold event banner above it. The old small red BLACK FRIDAY kicker is gone. The faint 3D 「BLACK FRIDAY」 sign behind the letters is hidden on the title screen only so the words don't appear twice. It returns to its v9 opacity (0.28) the moment you press スタート.
- **Pictorial how-to** (`#howto`) replaces the small-print rules. It shows three cards in a row, each with a gold step number badge (1/2/3), ▶ arrows between the cards, an inline SVG picture 72px tall and a 14px bold two-line caption:
  1. **ドラッグでねらう / ボールは5個**: a gold 「金」, the game's reticle on it, a dashed drag arrow from a touch point, and a row of 5 ball dots.
  2. **ゲージが大きい / ときに投げる**: the tapered gauge (wide top, narrow bottom, same shape as the in-game gauge). It has a BIG gold marker at the top with burst lines and 「大」, and a faded small marker at the bottom with a faded 「小」.
  3. **塗れた分だけ / % OFF**: a block grid with about half the cells black (gold-outlined) and half gold, plus a big red price tag reading 「◯% OFF」.
- **Fitting the rotating letters (title only):** the stacked 3D 「金曜日」 is ~400px tall at the gameplay camera and would sit under the headings and the how-to. On the title screen only, `fitTitleCam()` zooms the camera out (zoom ≈ 0.74 at 390×693) and shifts the view so the letters sit in the gap between the headings and the how-to. In every other phase the camera is reset to zoom 1 with no view offset, which is the v9 camera. `start()` resets it before `newGame()`, so the reticle's starting position is computed exactly as in v9. The screen test checks zoom 1 and no offset after start.
- `src/logic.js` is untouched.

## Files
- `src/logic.js`: pure logic, testable in Node. It handles the voxels built from the letter bitmaps, surface detection, a voxel ray cast (DDA), the fixed splat radius, painting and coverage, ball count and game over, the doubling speed-up, the paint gauge (`GAUGE_BASE_PERIOD`, v9 `GAUGE_SPEED_MULT`/`GAUGE_PERIOD`, `gaugeSpeedMult`, `gaugeValue`, `radiusFromGauge`), and the score bands.
- `src/game.html`: the game screen (three.js, UI, WebAudio). The kanji are drawn with a system font on a canvas and sampled into a 26×26 grid per letter, 4 blocks deep.
- `build.js` → `index.html`: inlines three.js (from `../tools`, read-only) and logic.js. **The build fails** if `<a href=` appears anywhere, or if any external reference or `@font-face` is found.
- `tests/logic.test.js` (Node) and `tests/screens.js` (Playwright, from `../tools`). Screenshots go in `tests/screenshots/`.

## Rules as implemented (decisions not fixed by the spec)
- **Coverage** = blackened surface blocks ÷ all surface blocks. Surface blocks are those with at least one exposed face, counting the front, back and sides of the letters.
- **Discount % = coverage rounded down to a whole number** (199/200 → 99%). 100% only when every block is black.
- **Gauge speed (v9)**: the only v9 change, decided by the user after playing v8. The gauge no longer speeds up per ball. `GAUGE_SPEED_MULT = 3` and `GAUGE_PERIOD = GAUGE_BASE_PERIOD / GAUGE_SPEED_MULT = 2.8/3 ≈ 0.9333 s` are constants. `gaugeSpeedMult(thrown)` always returns 3, `gaugePeriod(thrown)` always returns `GAUGE_PERIOD`, and `gaugeOmega(thrown)` = 2π/0.9333 ≈ 6.732 rad/s. They still take `thrown` so callers and test hooks are unchanged, but ignore it. This is the same speed ball 3 had in v5–v8, and it applies from ball 1 through ball 5 and after a retry. The freeze/resume behaviour (v7) is unchanged: after each throw the gauge resumes from the frozen phase at that same constant speed. `state().gaugeMult` is now always 3. Rotation doubling (0.55 → 8.80), throw-time sampling, the size-based gauge UI (v8), radius 2.75–11 and scoring are unchanged. The title rules never described the gauge speed, so no UI text changed.
- **Gauge freeze (v7)**: the only v7 change, decided by the user. The gauge phase now advances **only in the `aim` phase**: `BFLogic.gaugeRuns(phase)` is `phase === 'aim'`, and `BFLogic.stepGauge(gPhase, phase, thrown, dt)` adds `gaugeOmega(thrown)·dt` only then. The game's tick calls `stepGauge` (unless a test has pinned the gauge). Pressing 投げる moves the game from aim to flying. The phase stops right there, so the displayed value is exactly the value `beginThrow` locked. It stays frozen through `flying`, `flyback` (the 0.45 s after impact or a miss) and `ending`. Back in `aim` the same phase keeps going (no jump, same direction because the phase only goes forward) at `gaugeOmega(thrown)` for the new ball (v9: the same constant speed every ball). On the 5th ball there is no next aim: the gauge stays frozen through `ending` and is hidden on the result screen. **Visual cue:** `#gauge.frozen` (set in `setPhase` for flying/flyback/ending) turns the marker and % gold and shows a small 「決定」 label. The red impact flash still overrides the marker colour for 0.6 s. `state()` adds `gaugeFrozen`. `setGauge`/`unpinGauge` are test-only and unchanged: a pinned value is shown as-is in every phase.
- **Splat radius (v6, throw-time sampling)**: the only v6 change, decided by the user. When a throw starts, the game calls `BFLogic.beginThrow(game, g_throw)` with the gauge value at that instant. It stores `game.locked = {gauge, radius: radiusFromGauge(g_throw), range}`. A throw is refused (returns `null`) if a ball is already in flight (lock present) or no balls are left. At impact, `resolveThrow` paints with the locked gauge and ignores whatever the gauge reads at that moment, then clears the lock. A miss also clears it. The 「範囲 N%」 flash and the splash effects use g_throw. Without a lock (logic-only calls), `resolveThrow` falls back to `hit.gauge` as in v5. The title rules now say 「広がる大きさは**投げた**瞬間の「ぬり範囲」ゲージで決まる（25〜100%）」 (v5 said 当たった瞬間).
- **Splat radius (v5, superseded by throw-time sampling in v6)**: the radius was set **at the moment of impact** from the gauge value g ∈ [0, 1] at that instant: `radiusFromGauge(g) = R_MAX × (0.25 + 0.75 g)`. That is linear, from **2.75** (25% of 11) at g = 0 to **11** at g = 1, with g = 0.5 → 6.875. A miss paints nothing, whatever the gauge shows.
  - Gauge motion (**speed-up superseded in v9** by the constant 0.933 s period, see above): `g(t) = 0.5 − 0.5 cos(phase)`. The phase advances at 2π / period, and the period at ball 1 is `GAUGE_BASE_PERIOD = 2.8 s`. The gauge speeds up **additively** by 100% of its initial speed per ball: `gaugeSpeedMult(thrown) = 1 + thrown`, giving ×1..×5 and periods **2.8 / 1.4 / 0.933 / 0.7 / 0.56 s** for balls 1–5. It only moved during play (aim, flight, and the short pause between balls; **v7: aim only**, see above) and restarts at MIN (g = 0, phase 0) in every new game. The readout shows `round(100 × (0.25 + 0.75 g))` %.
  - The title rules line 「文字に当たればどこでも同じ大きさで広がる」 was no longer true, so v5 replaced it with 「広がる大きさは当たった瞬間の「ぬり範囲」ゲージで決まる（25〜100%）」. Splash effects (droplet count, splash volume, camera shake) now scale with g.
- **Splat (v2–v4, superseded by the gauge in v5)**: every surface block within **r = 11** blocks (`R_MAX`) of the impact point turned black, on **every** hit. Where the ball lands (centre, edge, corner, side face) and the letters' angle (front-on or side-on) make no difference. The radius goes through the letter's thickness, so a splash wraps around to the back. A miss still paints nothing and uses up the ball. (v1 used `r = 2.5 + 8.5 × glance × (0.4 + 0.6 × centrality)`. That formula and the ど真ん中／ナイス／かすめた toasts are gone, and the title rules now say 「文字に当たればどこでも同じ大きさで広がる」.)
  - The game finds the hit with its own voxel ray cast against the rotation at that frame, then passes the hit to the logic.
- **Rotation speed (v5)**: starts at **0.55 rad/s** and **doubles** after each ball thrown (`SPEED_MULT = 2`): `rotationSpeed(thrown) = 0.55 × 2^thrown` → **0.55 → 1.10 → 2.20 → 4.40 → 8.80 rad/s** (ratios exactly 2; the values are bit-exact doubles). `SPEED_STEP` was removed. The title rules never described the speed rule, so that part is unchanged.
- **Rotation speed (v4, superseded)**: started at **0.55 rad/s** (`BFLogic.BASE_SPEED`, same as v1/v3) and after each ball thrown increases **additively** by 100% of the initial speed (`SPEED_STEP = 1.0`, i.e. +0.55 rad/s): `rotationSpeed(thrown) = 0.55 × (1 + 1.0 × thrown)` → 0.55 → 1.10 → 1.65 → 2.20 → 2.75 rad/s (100 / 200 / 300 / 400 / 500%). This is the only v4 change, made after the user's v3 playtest ("faster — +100% per ball"). v3 used `SPEED_STEP = 0.5` (0.55 → 0.825 → 1.10 → 1.375 → 1.65; 100–300%). The v2 rule (0.825 × 1.12ⁿ: 0.825 → 0.924 → 1.035 → 1.159 → 1.298) is gone; `SPEEDUP` no longer exists. The title rules text never described the speed rule, so it is unchanged.
- **Layout**: unchanged. The letters are still stacked vertically （金／曜／日）.
- Test hooks are on `window.__bf`: `state()`, `start()`/`retry()`, `aim(x,y)`, `aimVoxel(x,y,z)`, `throwBall()`, `setRotation(angle, paused)`, `letters()`, `pixelStats()`, `countWithin(p, r)`. **v5 adds** `getGauge()`, `setGauge(g)` (pins the value and pauses the oscillation), `unpinGauge()` (resumes from the pinned value), and `renderedAngle()` (the letters' Y rotation recovered from the rendered `wordGroup.matrixWorld`, wrapped to (−π, π]). `state()` reports `simTime` (in-game seconds), `gauge`, `gaugePhase`, `gaugePinned` and `gaugeMult`. `state().last` includes the impact `point`, `gauge` and `range` (%). **v6 adds** `__bf.locked()` (the in-flight lock, or null) and `__bf.lastThrowGauge` (g_throw of the most recent throw, reset on retry). `state()` also reports `locked` and `lastThrowGauge`, and `state().last` now has `gauge` = `throwGauge` (g_throw) plus `impactGauge` (what the gauge read at impact, kept for comparison only).
- v5 also fixes an older display bug: after retry, the HUD kept showing the previous game's coverage % until the next hit, because the animated counter reset to 0 without redrawing.
- v1 sources are kept in `v1_backup/`, v4 sources in `v4_backup/`, v5 sources in `v5_backup/`, v6 sources (plus the v6 README and tests) in `v6_backup/`, v7 in `v7_backup/` and v8 (sources, tests, README) in `v8_backup/` for comparison.

## Test results (2026-11-26, Mac mini, after BGM / favicon / OGP / promo hooks)
- Logic tests (Node): **84 passed, 0 failed**.
- Screen tests (`npm run test:screens`, installed Chrome headless with SwiftShader): **81 passed, 2 failed** (log: `tests/tmp/screens_2026-11-26.log`, not in Git).
  - `gauge pinned at 1: first hit coverage ≈ v4 (~26%)` → 23% here.
  - `same spot ×5: balls 2–5 are wasted` → history +813 +54 +0 +0 +0 (ball 2 still adds a few blocks).
  - **Cause: the system font, not a code change.** The letters are voxelised from the system font (`glyphBitmap`). This Mac uses Hiragino; the maker's Linux VM used a different CJK font, so the letter shapes differ slightly (e.g. the edge-on hit paints 441 blocks here vs 433 on the VM; the surface count is 3428 here). Both checks hard-code numbers measured on the VM. Running the same steps on the v10 build from before today's changes gives exactly the same numbers on this Mac (first hit 23%; same spot 25%, +813 +49 +0 +0 +0), so today's changes did not cause them. The thresholds were left as they are.
- Real device: the user checked the game on a phone on 2026-11-26 (touch, frame rate, BGM and sound effects, ball 5 speed).


Operator re-verification (Muse, 2026-11-26): logic **84 passed, 0 failed**; screen **83 passed, 0 failed** (`tests/tmp/screens_v10_muse.log`; the maker's run1 was cut off by a session timeout after all title checks had passed). Title: BLACK FRIDAY 46.0 px across the full 390 px width at the top, 「黒に塗りつぶせ」 49.9 px headline below it; how-to = 3 inline-SVG steps (72 px tall) with 14 px captions, 5 ball dots in step 1, everything fits the 9:16 frame with the letters between headings and how-to (zoom 0.740). Operator visually confirmed `tests/screenshots/01_title.png` and `01b_howto_crop.png`. Gameplay unchanged from v9; natural run 17 → 19 → 25 → 35 → 56%, 「56% OFF」.

## Test results (v9)
Run by Claude Code (maker) on 2026-11-26 against the rebuilt `index.html` (build passed, `<a href=` guard kept). There has been no operator re-run yet.
- Logic tests (Node): **84 passed, 0 failed** (`tests/tmp/logic_v9_run1.log`). Same count as v8. Three gauge assertions were rewritten: `gaugeSpeedMult` is 3,3,3,3,3 for thrown = 0..4; `gaugePeriod` is 2.8/3 = 0.9333 s for all five; `gaugeOmega` is 6.7320 rad/s for all five. The v7 resume test now expects the same constant ω. Everything else is unchanged.
- Screen tests (Playwright, headless Chromium, ~1 fps software WebGL): **72 passed, 0 failed** (`tests/tmp/screens_v9_run1.log`). Same count as v8, with the gauge-speed checks adapted in place:
  - Measured gauge period in natural play, from rendered frames against sim-time: **0.933 / 0.933 / 0.933 / 0.933 / 0.933 s** for balls 1–5 (ω 6.732 rad/s each). `state().gaugeMult` was 3 on every ball.
  - Retry: `gaugeMult` is 3 and the measured gauge period after retry is **0.933 s**. Balls, %, gold letters and speed 0.55 reset as before.
  - v7 freeze still holds on every ball: 8 flight frames exactly at the locked value, marker and % static, frozen after impact. Resume Δphase was 0.000 on balls 1–4 and the gauge then moved on at the same constant ω. Ball 5 stays frozen into the ending.
  - Unchanged and passing: rotation measured 0.550 / 1.100 / 2.200 / 4.400 / 8.800 rad/s, v8 marker-size checks, pinned extremes, same-spot 26%, spread 68%, all-miss 0%, edge-on 433 blocks at r = 11, no page errors, no external requests. Natural run: 17 → 19 → 25 → 35 → 56%, 「56% OFF」.
- Not verified: real-device touch feel, frame rate and sound. In particular, whether the constant 0.933 s gauge feels right on ball 1 (it used to be 2.8 s) is a playtest question.

Operator re-verification (Muse, 2026-11-26): logic **84 passed, 0 failed**; screen **72 passed, 0 failed** (`tests/tmp/screens_v9_muse.log`). Measured gauge ω = 6.732 rad/s (period 0.933 s) on every ball 1–5 and after retry; rotation still measured 0.550/1.100/2.200/4.400/8.800 rad/s; natural run 17 → 21 → 28 → 40 → 59%, 「59% OFF」.

## Test results (v8)
UI-only change (gauge value encoded by SIZE, not colour). The implementing Claude Code session was interrupted by a runtime restart after the code and build were written; the operator verified the diff in the sources and ran both suites independently (2026-11-26).
- Logic tests (Node): **84 passed, 0 failed** (unchanged from v7).
- Screen tests (Playwright, headless Chromium, ~1 fps software WebGL): **72 passed, 0 failed** (`tests/tmp/screens_v8_muse.log`). New v8 checks: marker diameter at pinned g=1 is 26.00 px vs 6.50 px at g=0 (exactly 4.00×, i.e. ∝ range fraction 0.25+0.75g; mid g=0.5 ratio 0.625 as designed), in aim and in frozen flight; marker centre sits at (1−g) of the track (0.0000/0.5000/1.0000); marker colour is identical at g=0 and g=1 in aim (rgb(244,244,244)) and while frozen (rgb(255,215,106) — the frozen cue encodes state, not value); the track has no gradient anywhere (flat fill rgba(255,255,255,0.16)) and is a tapered polygon (26 wide at top → 6.5 at bottom); the enlarged marker stays inside the gauge and clear of the MAX/MIN labels. All v7 checks still pass (freeze, throw-time sampling, rotation 0.55→8.80 measured, gauge periods, pinned extremes r=11/+850/26% and r=2.75/27 blocks, same-spot 26%, spread 68%, all-miss 0%, edge-on 433). Natural run: 24 → 25 → 26 → 32 → 54%, 「54% OFF」.
- Screenshots: `tests/screenshots/09a_gauge_mid.png`, `09b_gauge_pinned1.png`, `09c_gauge_pinned0.png` (+ `_zoom` variants). The operator visually confirmed: at g=1 a large disc sits in the wide top of the track beside a large MAX dot (readout 100%); at g=0 a tiny dot sits in the narrow bottom beside a small MIN dot (readout 25%).
- Not verified: real-device touch feel, frame rate and sound.

## Test results (v7)
Verified by Muse (operator re-runs) on 2026-11-25; the Claude Code session that implemented v7 hit its time limit during its own second screen run (its first run: 64 passed / 1 failed — the failure was a marker-position rounding false in the test itself, fixed in the test file before the operator's run).
- Logic tests (Node): **84 passed, 0 failed** (operator re-run).
- Screen tests (Playwright, headless Chromium, ~1 fps software WebGL): **65 passed, 0 failed** (operator re-run, `tests/tmp/screens_v7_muse.log`). Freeze checks per ball in natural play: during every flight, 8 sampled frames all show getGauge() exactly equal to the locked throw value, the on-screen marker position and % readout are static at that value, and post-impact frames stay frozen until the aim state resumes; resume starts exactly at the frozen value (Δphase 0.000 for balls 1–4) and then moves at the new ball's gauge speed; the 5th ball stays frozen into the ending. Painted radius = radiusFromGauge(locked value) on every hit. Natural run: coverage 24 → 25 → 26 → 34 → 56%, result 「56% OFF」.
- All v6 checks still pass: throw-time sampling incl. mid-flight setGauge swaps both directions, pinned extremes (g=1 → r=11/+850 blocks/26%; g=0 → r=2.75/27 blocks), rotation measured 0.55/1.10/2.20/4.40/8.80 rad/s, gauge periods 2.8/1.4/0.933/0.7/0.56 s, same-spot ×5 = 26%, spread = 68%, all-miss = 0%, edge-on at g=1 = 433 blocks, retry resets, gauge hidden on title/result, no page errors, no external requests.
- Not verified: real-device touch feel, frame rate and sound.

## Test results (v6)
Run by Claude Code (maker) on 2026-11-25 against the rebuilt `index.html` (the `<a href=` guard is kept; the build passed). There has been no operator re-run yet.
- Logic tests (Node): **77 passed, 0 failed**. That is the 67 v5 tests (one renamed: "resolveThrow without a lock uses hit.gauge") plus 10 new throw-time lock tests. They cover: `beginThrow` stores g_throw, radius and range; a second `beginThrow` while in flight is refused; impact with g_throw = 0.2 and impact gauge = 1 paints r = 4.4 (84 blocks, the same as `paint()` at that radius); throw g = 1 / impact g = 0 → r = 11, and throw g = 0 / impact g = 1 → r = 2.75; the lock is cleared after a hit or a miss; a miss with a lock paints nothing; the lock is refused after the last ball; clamping. Rotation, gauge and trivial-strategy tests are unchanged (same-spot 26%, spread 80%, all-miss 0%).
- Screen tests (Playwright, headless Chromium, ~1 fps software WebGL): **58 passed, 0 failed** (`tests/tmp/screens_v6_run1.log`). The final v5 suite had 54 checks (the operator run: 53 passed + 1 flaky failure). v6 adds 5 checks, removes 1 and rewords the natural-play radius check (the flaky "gauge values at impact vary" check is gone):
  - Pinned throw at g = 1: state lock `{gauge 1, radius 11, range 100}`, and a second throw during flight leaves the lock unchanged.
  - Deterministic discrimination: a throw at g = 1 with the gauge set to 0 mid-flight painted r = 11, +850 blocks, 「範囲 100%」. A throw at g = 0 with the gauge set to 1 mid-flight painted r = 2.75, +27 blocks, 「範囲 25%」.
  - Natural play (gauge unpinned, rotation running, real clicks): getGauge() was recorded by a capture-phase click listener at the moment of the 投げる click. Every hit's radius = radiusFromGauge(g_throw), and the flash showed the g_throw %. Pairs (g_throw → r): 0.950 → 10.591, 0.997 → 10.974, 0.234 → 4.680, 0.283 → 5.085, 0.972 → 10.769. The gauge read at impact was 0.444 / 0.077 / 0.500 / 0.891 / 0.950, so in 5/5 throws the impact-time value would have given a different radius. This is logged as information, not asserted, so a coincidence cannot fail the test. `lastThrowGauge` equalled the click-time gauge on all 5 throws. The gauge phase kept advancing during every flight (+3.93 / 6.17 / 9.09 / 11.67 / 6.17 rad from throw to the post-impact read).
  - Unchanged and passing: pinned g = 1 → r = 11, +850 blocks, 26%; pinned g = 0 → r = 2.75, exactly the 27 blocks within r = 2.75. Rotation, measured as rendered and unwrapped against sim-time, was exactly 0.550 / 1.100 / 2.200 / 4.400 / 8.800 rad/s (max per-frame step 0.44 rad). Gauge periods were 2.800 / 1.400 / 0.933 / 0.700 / 0.560 s. The natural run's coverage went 22 → 36 → 38 → 39 → 50%, ending on 「50% OFF を勝ち取った！」. Same-spot ×5 at g = 1 = 26%, spread = 68%, all-miss = 0%, edge-on at g = 1 = 433 blocks (r = 11). Retry resets. The gauge is hidden on the title and result screens. No page errors, no external requests.
- Not verified: real-device feel. In particular, whether locking the range at the throw reads clearly to players. At 0.56 s per gauge cycle on ball 5, the marker has moved on by impact; the flash shows the locked % but there is no separate on-gauge "locked" marker. That is a playtest question.

Operator re-verification (Muse, 2026-11-25): logic **77 passed, 0 failed**; screen **58 passed, 0 failed** (`tests/tmp/screens_v6_muse.log`). In the operator's natural-play run, all five throws had an impact-time gauge that would have given a different radius, and every painted radius matched the throw-time value (g_throw 0.972 → r=10.769; 1.000 → 11.000; 0.188 → 4.303; 0.335 → 5.513; 0.950 → 10.591), finishing at 51% OFF. The deterministic mid-flight swap checks also passed in both directions.

## Test results (v5)
Run by Claude Code (maker) and independently re-run by Muse (operator) on 2026-11-25.
- Logic tests (Node): **67 passed, 0 failed** (operator re-run) — rotation exactly 0.55/1.10/2.20/4.40/8.80 (ratios exactly 2); radiusFromGauge g=0 → 2.75, g=1 → 11, g=0.5 → 6.875, monotonic; gauge multiplier ×1–×5, periods 2.8/1.4/0.933/0.7/0.56 s; r=2.75 paints fewer blocks than r=11 at the same point.
- Screen tests (Playwright, headless Chromium, ~1 fps software WebGL): maker run **53 passed, 0 failed** (`tests/tmp/screens_v5_run1.log`); operator re-run **53 passed, 1 failed** (`tests/tmp/screens_v5_muse.log`). The single failure is the test-side check "gauge values at impact vary": in the operator's natural-play run the first two impacts landed on the same gauge value (0.556, 0.556, then 0.923, 0.003, 0.987) because headless frame cadence quantises sim-time — the gauge itself was verified oscillating and speeding up, and every hit's radius matched `11·(0.25+0.75·g)` exactly, so this is a flaky strictness check in the harness, not a game defect.
- Measured in natural play (maker run): rotation rendered+unwrapped per sim-time exactly 0.550/1.100/2.200/4.400/8.800 rad/s for balls 1–5 (the sim-time unwrapping method works even at 8.8 rad/s, so all five speeds are genuinely measured, not just state-checked); gauge ω measured 2.244/4.488/6.732/8.976/11.220 rad/s = periods 2.800/1.400/0.933/0.700/0.560 s as designed.
- Gauge extremes verified on screen: pinned g=1 → centre hit r=11, +850 blocks, 26% (same as v4); pinned g=0 → r=2.75, exactly the 27 blocks within r=2.75, coverage 0%. Impact flash shows 「範囲 N%」. Natural unpinned playthroughs reached 45% OFF (maker) and 49% OFF (operator). Same-spot ×5 at g=1 = 26%, spread = 68%, all-miss = 0%, edge-on hit at g=1 = 433 blocks at r=11, retry resets (speed 0.55, gauge ×1, gauge hidden on title/result), no page errors, no external requests.
- Not verified: real-device touch feel, frame rate and sound; how the 8.80 rad/s fifth ball and the 0.56 s gauge period feel at full frame rate is a playtest question.

## Test results (v4)
Verified by Muse (the operator) on 2026-11-24. The Claude Code session that applied the v4 change was interrupted by a runtime restart before it could report; its partial screen log (`tests/tmp/screens_v4.log`) already showed the full real-play run passing with the exact v4 speeds, and the operator then re-ran both suites independently against the shipped v4 `index.html`:
- Logic tests (Node): **50 passed, 0 failed** — SPEED_STEP = 1.0, sequence 0.55 / 1.10 / 1.65 / 2.20 / 2.75, constant +0.55 increments, 100/200/300/400/500%; uniform radius 11 and trivial strategies unchanged.
- Screen tests (Playwright, headless Chromium, ~1 fps software WebGL): **33 passed, 0 failed** — measured rotation per ball exactly 0.550 / 1.100 / 1.650 / 2.200 / 2.750 rad/s, increments +0.550 each; all 5 real-play hits r = 11; coverage 26 → 40 → 59 → 61 → 72% and result card 「72% OFF を勝ち取った！」; same-spot ×5 = 26%, spread = 68%, all-miss = 0% OFF; edge-on hit 433 blocks at r = 11; retry resets; no page errors, no external requests. Operator log: `tests/tmp/screens_v4_muse.log`.

## Test results (v3)
Run by the Claude Code build session on 2026-11-24 against the rebuilt v3 `index.html` (full run, both suites finished), and **independently re-run by Muse (the operator) the same day with identical results: logic 50/50, screen 33/33, measured speeds exactly 0.550 / 0.825 / 1.100 / 1.375 / 1.650 rad/s with +0.275 increments (operator log: `tests/tmp/screens_v3_muse.log`)**:
- Logic tests (Node): **50 passed, 0 failed**. New v3 assertions: BASE_SPEED = 0.55, SPEED_STEP = 0.5 (additive; `SPEEDUP` removed), `rotationSpeed(n)` = 0.5500, 0.8250, 1.1000, 1.3750, 1.6500 (exact to 1e-12), constant +0.2750 increments, 100/150/200/250/300% of the initial speed. Unchanged: every hit paints R_MAX = 11; trivial strategies (idle = 0%, same-spot ×5 = 26%, spread = 80%, all-miss = 0%).
- Screen tests (Playwright, headless Chromium, software WebGL): **33 passed, 0 failed**. Measured rotation per ball was **0.550 / 0.825 / 1.100 / 1.375 / 1.650 rad/s** (the tolerance allowed ±2%; the error was under 0.001), and increments were +0.275 each. All 5 real-play hits painted r = 11. Coverage went 26 → 48 → 68 → 72 → 73%, and the result card said 「73% OFF を勝ち取った！」. The edge-on hit painted the full radius (433 blocks). Same-spot ×5 = 26%, spread = 68%, all-miss = 0% OFF. Retry resets. No page errors and no external requests. Log: `tests/tmp/screens_v3.log`.

## Test results (v2)
Verified by Muse (the operator) on 2026-11-24, re-running both suites independently against the shipped v2 `index.html`:
- Logic tests (Node): **48 passed, 0 failed** — includes the new v2 assertions: base speed is 0.825 rad/s (v1 0.55 × 1.5), SPEEDUP unchanged at 1.12, speed sequence 0.825 → 0.924 → 1.035 → 1.159 → 1.298; every hit paints radius R_MAX = 11 regardless of position/angle; trivial strategies (idle = 0%, same-spot ×5 = 26%, spread = 80%, all-miss = 0%).
- Screen tests (Playwright, headless Chromium, ~1 fps software WebGL): **33 passed, 0 failed** — measured rotation per ball exactly 0.825 / 0.924 / 1.035 / 1.159 / 1.298 rad/s (±1%), base = 1.500× v1; all 5 real-play hits painted r = 11; coverage 26 → 40 → 60 → 62 → 73% and result card 「73% OFF を勝ち取った！」; edge-on (sideways) hit now paints the full radius — 433 blocks vs the v1 graze's 26 blocks at r ≈ 2.95; same-spot ×5 = 26%, spread = 68%, all-miss = 0% OFF; retry resets; no page errors, no external requests.
- Note: the Claude Code session's own screen run again hit its time budget at throw 5 (its partial log showed r = 11 on throws 1–4 and 0.825 rad/s measured); the full pass above is the operator's re-run.

## Test results (v1)
Verified by Muse (the operator) on 2026-11-24, re-running both suites independently of the build session:
- Logic tests (Node): **35 passed, 0 failed** — painting/coverage (0% → hit → increases → overlap adds nothing → full paint = 100%), misses, 5-ball game-over, +12% speed per ball, score tiers, trivial strategies (idle = 0%, same-spot ×5 = 25%, spread = 76%).
- Screen tests (Playwright, headless Chromium, ~1 fps software WebGL): **27 passed, 0 failed** — title → start → drag aim → throw → ball in flight (input locked) → hit visibly blackens the letters on screen (black pixels 0 → 9,365, coverage HUD 26%) → 5 throws with rotation running (26 → 39 → 42 → 42 → 42%, never decreases) → result card 「42% OFF を勝ち取った！」 with tier message and shopping line → retry resets to gold/0%/5 balls. Trivial strategies on screen: same spot ×5 = 26% (balls 2–5 wasted), spread = 68%, all misses = 0% OFF. No page errors, no external requests. Screenshots in `tests/screenshots/` (01 title, 02 aim, 03 flying, 04 blackened, 05 result, 06 same-spot, 07 spread, 08 edge-on graze).
- Note: the build session's own final screen run was cut short when its time budget ended (browser closed at throw 5); the full pass above is the operator's re-run of the same `tests/screens.js` against the shipped `index.html` (built 07:19, unchanged since).

## Unverified

> **2026-11-26 更新**：スマホ実機での確認はユーザーが完了した（タッチの感触・フレームレート・音・5球目の速さを含む）。下の項目はヘッドレスの試験の限界を記録として残している。

- Real-device (iPhone) touch feel, frame rate, and sound. Headless rendering here is software WebGL at ~1 fps, so performance on a real GPU is expected to be much better but is not measured.
- Layout: the letters stay stacked vertically （金／曜／日）. The user confirmed this in the v2 playtest feedback.
- Whether the v5 rotation feels right on a real phone at full frame rate. At 8.80 rad/s the 5th ball sees a full turn every ~0.71 s, and the letters turn ~6.6 rad (≈ 1 turn) during the 0.75 s flight. Whether the gauge is readable and fair at its constant 0.933 s per cycle (v9) is also unchecked. Headless tests check the numbers, not the feel.
- **Real-time (wall-clock) speeds are not measurable headlessly.** Headless Chromium renders at ~0.9 fps and the game caps each frame's dt at 0.05 s, so the game runs in ~20× slow motion. Every rotation and gauge speed above is measured against in-game time (`simTime`). Against wall-clock time (`performance.now`) the same samples give only 0.027 / 0.054 / 0.112 / 0.214 / 0.440 rad/s. At ≥ 20 fps (a real device) dt is not capped and in-game time equals wall time, but that was not measured here.
- The 「範囲 N%」 impact flash was verified through its DOM text (「範囲 100%」 / 「範囲 25%」) right after impact. No screenshot happens to capture it, because the test's screenshots are taken after the flash has faded.
