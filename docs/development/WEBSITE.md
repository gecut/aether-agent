# Static website

The public site is [gecut.github.io/aether-agent](https://gecut.github.io/aether-agent/). Its source is `website/index.html`: inline CSS and interaction JavaScript, with no framework or build step. The optional opening film and poster are pre-rendered files in `website/assets/`. The root `index.html` remains the Electron renderer entry point.

The page contains an Ava-led hero, keyboard-accessible workspace/team/graph screenshot previews, workflow, direct versioned platform downloads, expandable FAQ and meadow footer. Download links point to the verified v0.1.10 prerelease `build-39080580943`, with accurate architecture labels and Mac signing limitations. All branding, credits and links belong to Aether. The footer retains the originally requested meadow video, paper fade and frosted wordmark treatment, with an Aether wordmark and functional product, resource and contribution links. It contains no invented user counts, ratings or release claims.

Ava's inline SVG poses are sampled from the same vendored Bloub engine, custom body profile and expressions used by the desktop app. The upstream MIT notice is preserved in the HTML, and the footer links to third-party credits. The Ready, Thinking and All done buttons are an explicitly labeled mascot preview; they do not run agents. Cursor-following eyes use one coalesced animation frame per pointer update, and only while the demo is visible. Floating motion pauses off screen. Reduced motion disables gaze and animation, and pauses the meadow video. Hidden documents also pause the video; it loads and plays only when the footer enters view, with a still poster available beforehand. The static ready mascot, default workspace screenshot and navigation remain available without JavaScript. Interactive preview buttons are hidden in that case, and the opening film has a direct-link fallback.

`.github/workflows/pages.yml` uploads only `website/` and deploys through GitHub Pages using a deployment environment and scoped permissions. Changes under `website/` publish on pushes to `main`; manual dispatch is also available. No desktop application or private data is uploaded to Pages.

The site uses an external Google Font and CloudFront video/poster, plus the repository's published workspace screenshot. It needs network access for these resources. The page retains its paper palette regardless of system color scheme. The screenshot is lazy-loaded, has reserved dimensions, and does not block the Ava hero. Inter loads without blocking first paint, with system fonts when JavaScript is disabled. The favicon is an inline SVG of Ava.

Browser checks cover widths 320, 360, 390, 767, 768, 900, 1024 and 1440 pixels without horizontal overflow. Verification also covers all anchor targets, Ava pose selection, cursor-following eyes, reduced-motion reset, paused video, FAQ expansion, decoded media and loaded product imagery. Desktop, tablet and mobile screenshots are reviewed locally; test artifacts are not published.

## Optional Ava opening film

**Meet Ava in motion** opens a native dialog only after a user clicks. It plays a six-second silent H.264 film (1280×720, 24 fps, 130,734 bytes, faststart), with a PNG poster. It is not part of app startup and does not interrupt website navigation. The MP4 is not requested on initial page load. Native controls, a close button, Escape and backdrop dismissal are supported; closing pauses and resets playback and returns focus. Hidden documents pause playback. Playback errors offer the direct film link instead.

A Codex agent rendered this original motion film locally from Aether's actual vendored Bloub engine and body profile. The AI video service rejected its request before submitting a generation, so this is not output from an AI video model. Attribution appears in the generator, video metadata and site's existing third-party credits. The illustrated workspace inside the film is brand animation, not a real app screenshot; the product gallery contains actual screenshots.

To regenerate with Node.js 24+, the repository's development dependencies, Google Chrome and FFmpeg installed:

```sh
node scripts/ava-opening-video.mjs
```

The generator streams frames to FFmpeg and writes the film/poster to `website/assets/`; temporary verification frames stay in ignored `artifacts/`. Set `FFMPEG_PATH` if the encoder is outside PATH. Regeneration is optional and never runs during website deployment or application builds.

The revised page passed eight viewport widths, actual six-second playback, no eager MP4 request, modal focus/Escape/close/reset, gallery arrow/Home navigation, direct download/anchor checks, reduced motion and no-JavaScript fallbacks. Injected image/video failures verified visible recovery paths. The measured local Lighthouse result was 100 performance / 100 accessibility, with 1.1-second FCP, 1.4-second LCP and zero layout shift. External media and font delivery still depend on the network.
