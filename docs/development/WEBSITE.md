# Static website

The public site is [gecut.github.io/aether-agent](https://gecut.github.io/aether-agent/). Its source is `website/index.html`: inline CSS and a small inline interaction script, with no framework or build step. The root `index.html` remains the Electron renderer entry point.

The page contains an Ava-led Aether hero, workspace overview, workflow, downloads, expandable FAQ and meadow footer. All branding, credits and links belong to Aether. The footer retains the originally requested meadow video, paper fade and frosted wordmark treatment, with an Aether wordmark and functional product, resource and contribution links. It contains no invented user counts, ratings or release claims.

Ava's inline SVG poses are sampled from the same vendored Bloub engine, custom body profile and expressions used by the desktop app. The upstream MIT notice is preserved in the HTML, and the footer links to third-party credits. The Ready, Thinking and All done buttons are an explicitly labeled mascot preview; they do not run agents. Cursor-following eyes use one coalesced animation frame per pointer update, and only while the demo is visible. Floating motion pauses off screen. Reduced motion disables gaze and animation, and pauses the meadow video. Hidden documents also pause the video; it loads and plays only when the footer enters view, with a still poster available beforehand. The static ready mascot and all navigation remain available without JavaScript; preview buttons are hidden in that case.

`.github/workflows/pages.yml` uploads only `website/` and deploys through GitHub Pages using a deployment environment and scoped permissions. Changes under `website/` publish on pushes to `main`; manual dispatch is also available. No desktop application or private data is uploaded to Pages.

The site uses an external Google Font and CloudFront video/poster, plus the repository's published workspace screenshot. It needs network access for these resources. The page retains its paper palette regardless of system color scheme. The screenshot is lazy-loaded, has reserved dimensions, and does not block the Ava hero. Inter loads without blocking first paint, with a normal stylesheet fallback when JavaScript is disabled. The favicon is an inline SVG of Ava.

Browser checks cover widths 320, 360, 390, 767, 768, 900, 1024 and 1440 pixels without horizontal overflow. Verification also covers all anchor targets, Ava pose selection, cursor-following eyes, reduced-motion reset, paused video, FAQ expansion, decoded media and loaded product imagery. Desktop, tablet and mobile screenshots are reviewed locally; test artifacts are not published.

The final local throttled Lighthouse run scored 100 performance and 100 accessibility, with 0.9-second first/largest contentful paint and zero cumulative layout shift. These are local measurements; external media and font delivery still depend on the network.
