/**
 * Original Aether motion film. Run: node scripts/ava-opening-video.mjs
 * Development-only export; the static website has no build step.
 * Ava uses the unmodified vendored Bloub engine and Aether Avatar.tsx profile.
 * Bloub: Copyright (c) 2026 Jérémy Perret, MIT License.
 * Full license: src/vendor/bloub/LICENSE (also THIRD_PARTY_NOTICES.md).
 * This is a locally rendered animation, not AI video-model output.
 */
import { build } from "esbuild";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "website/assets");
const fixtures = path.join(root, "artifacts/ava-opening-video");
await mkdir(output, { recursive: true });
await mkdir(fixtures, { recursive: true });
const license = await readFile(
  path.join(root, "src/vendor/bloub/LICENSE"),
  "utf8",
);
const bundled = await build({
  stdin: {
    resolveDir: root,
    contents: `
      import { BotEngine } from './src/vendor/bloub/engine';
      import { EXPRESSION_BY_ID } from './src/vendor/bloub/expressions';
      import { PROFILE_SAMPLES } from './src/vendor/bloub/profiles';
      const body = Array.from({length: PROFILE_SAMPLES}, (_, i) => {
        const angle = i / PROFILE_SAMPLES * Math.PI * 2;
        return .94 + .075 * Math.cos(5 * angle - Math.PI / 2) + .035 * Math.sin(3 * angle);
      });
      const engine = new BotEngine(100, 'idle', body, EXPRESSION_BY_ID.get('somnolent'));
      let awake = false, wink = false, resting = false;
      const ease = (v) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
      window.renderFrame = (t) => {
        if (t >= .55 && !awake) {
          awake = true;
          engine.setExpression(EXPRESSION_BY_ID.get('curieux'), .55);
          engine.setLook({yaw: 15, pitch: 9, mix:1, spin:0, wander:0}, .55);
        }
        if (t >= 3.2 && !wink) { wink = true; engine.setState('wink', 3.2); }
        if (t >= 4.05 && !resting) {
          resting = true; engine.setState('idle', 4.05);
          engine.setExpression(EXPRESSION_BY_ID.get('heureux'), 4.05);
          engine.setLook({yaw: 0, pitch: 12, mix:1, spin:0, wander:0}, 4.05);
        }
        const f = engine.sample(t);
        const reveal = ease((t - 1.1) / 1.45);
        const x = 640 - 335 * reveal;
        const y = 320 + 6 * Math.sin(t * 1.5);
        const mask = '<path d="' + f.bodyPath + '" fill="white"/>' + f.eyes.map(e => '<path d="' + e.d + '" transform="' + e.matrix + '" fill="black" opacity="' + e.alpha + '"/>').join('');
        document.querySelector('#ava').innerHTML = '<defs><mask id="face">' + mask + '</mask></defs><g opacity="' + f.bodyAlpha + '"><path d="' + f.bodyPath + '" fill="#1d4543"/><rect x="-165" y="-165" width="330" height="330" fill="#a8dfcf" mask="url(#face)"/></g>';
        document.querySelector('#ava').setAttribute('transform', 'translate(' + x + ' ' + y + ') scale(1.3)');
        document.querySelector('#workspace').setAttribute('opacity', reveal);
        document.querySelector('#workspace').setAttribute('transform', 'translate(' + (24 * (1-reveal)) + ' 0)');
        document.querySelector('#caption').setAttribute('opacity', 1 - ease((t-.85)/.45));
        document.querySelector('#title').setAttribute('opacity', ease((t-2.4)/1));
        document.querySelector('#done').setAttribute('opacity', ease((t-3.5)/.5));
        document.querySelector('#cursor').setAttribute('transform', 'translate(' + (30 * (1-ease((t-2.4)/.9))) + ' ' + (18 * (1-ease((t-2.4)/.9))) + ')');
      };
    `,
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  legalComments: "inline",
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
const encoder = spawn(
  process.env.FFMPEG_PATH ?? "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "image2pipe",
    "-vcodec",
    "png",
    "-framerate",
    "24",
    "-i",
    "pipe:0",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "19",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-map_metadata",
    "-1",
    "-metadata",
    "title=Aether Code — Meet Ava",
    "-metadata",
    `comment=Original local animation. Bloub: ${license}`,
    path.join(output, "ava-opening.mp4"),
  ],
  { stdio: ["pipe", "ignore", "inherit"] },
);
const finished = once(encoder, "exit");
try {
  await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Ava opening film</title><style>*{box-sizing:border-box}html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#f1f1ee}svg{display:block}text{font-family:Arial,Helvetica,sans-serif}</style>
  <svg viewBox="0 0 1280 720" width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
    <rect width="1280" height="720" fill="#f1f1ee"/>
    <text x="72" y="69" fill="#57706a" font-size="12" letter-spacing="3">AETHER CODE</text>
    <text x="1208" y="69" text-anchor="end" fill="#777b74" font-size="12">A quieter way to build.</text>
    <g id="workspace" opacity="0">
      <rect x="535" y="167" width="610" height="328" rx="16" fill="#fcfcf9" stroke="#d8dcd4"/>
      <path d="M535 213H1145M693 213V495" fill="none" stroke="#e4e7df"/>
      <circle cx="558" cy="190" r="4" fill="#c1cac1"/><circle cx="574" cy="190" r="4" fill="#c1cac1"/><circle cx="590" cy="190" r="4" fill="#c1cac1"/>
      <text x="627" y="194" fill="#798379" font-size="11">YOUR WORKSPACE</text>
      <rect x="552" y="238" width="120" height="27" rx="5" fill="#e8eee6"/>
      <text x="565" y="255" fill="#425e50" font-size="11">A new idea</text>
      <path d="M565 287h75M565 311h88M565 335h66" stroke="#cbd4c9" stroke-width="5" stroke-linecap="round"/>
      <text x="725" y="253" fill="#647860" font-size="11" letter-spacing="1.2">MAKE ROOM FOR POSSIBILITY</text>
      <path d="M726 287h245M726 312h177M726 337h219" stroke="#d7ded3" stroke-width="9" stroke-linecap="round"/>
      <path d="M726 375h119" stroke="#c0dacc" stroke-width="9" stroke-linecap="round"/>
      <g id="done" opacity="0"><rect x="724" y="414" width="185" height="37" rx="18.5" fill="#e3f1e8"/><path d="m739 433 5 5 10-12" fill="none" stroke="#4f7b60" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><text x="765" y="437" fill="#41674f" font-size="12">One idea. Taking shape.</text></g>
      <g id="cursor"><path d="m1018 360 4 23 6-7 9-1Z" fill="#3f6456" stroke="#fcfcf9" stroke-width="2"/></g>
    </g>
    <g id="ava"></g>
    <text id="caption" x="640" y="506" text-anchor="middle" fill="#23372f" font-size="25">Meet Ava.</text>
    <g id="title" opacity="0"><text x="640" y="592" text-anchor="middle" fill="#17241e" font-size="51" letter-spacing="-2">Aether Code</text><text x="640" y="632" text-anchor="middle" fill="#6f776d" font-size="18">Your ideas, in good company.</text></g>
    <path d="M72 671H1208" stroke="#dde1d8"/>
  </svg><script>${bundled.outputFiles[0].text}</script>`);
  for (let i = 0; i < 144; i++) {
    await page.evaluate((t) => window.renderFrame(t), i / 24);
    const png = await page.screenshot({ type: "png" });
    if (i === 90)
      await page.screenshot({
        path: path.join(output, "ava-opening-poster.png"),
      });
    if (i === 48 || i === 143)
      await page.screenshot({ path: path.join(fixtures, `frame-${i}.png`) });
    if (!encoder.stdin.write(png)) await once(encoder.stdin, "drain");
  }
  encoder.stdin.end();
  const [code] = await finished;
  if (code !== 0) throw new Error(`Video encoder exited with ${code}`);
  console.log("Exported six-second Ava film and poster to website/assets.");
} finally {
  await browser.close();
  if (encoder.exitCode === null) encoder.kill("SIGTERM");
}
