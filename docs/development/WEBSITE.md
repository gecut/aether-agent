# Static website

The public site is [gecut.github.io/aether-agent](https://gecut.github.io/aether-agent/). Its source is `website/index.html`: inline CSS, no framework, JavaScript or build step. The root `index.html` remains the Electron renderer entry point.

The page contains Aether overview, workspace, workflow, download and expandable FAQ sections. The footer intentionally preserves the user's literal Driftbar brand, title, links, statistics, media URLs, typography, unit system and responsive specifications. Those footer statistics and credits are supplied design copy, not claims about Aether. Footer `href="#"` links are retained exactly as requested; Aether navigation, repository and download links are functional.

`.github/workflows/pages.yml` uploads only `website/` and deploys through GitHub Pages using a protected deployment environment and scoped permissions. Changes under `website/` publish on pushes to `main`; manual dispatch is also available. No desktop application or private data is uploaded to Pages.

The site uses the specified external Google Font and CloudFront video/poster, plus the repository's published workspace screenshot. It needs network access for these resources. The page retains the requested light paper theme and video behavior regardless of system color scheme; reduced motion disables footer hover transitions as specified.

Browser verification covered widths 320, 360, 390, 767, 768, 900, 1024 and 1440 pixels without horizontal overflow. At 1440×900 the footer column positions were 600/840/1080 pixels and the wordmark was 390 pixels. The supplied video decoded successfully, the published screenshot loaded, navigation anchors and FAQ expansion worked, and reduced-motion hover transitions were disabled. Desktop, tablet and mobile screenshots were reviewed locally; private test artifacts are not published.

Local throttled Lighthouse scores were 78 performance and 95 accessibility. External font/media delivery accounts for most load cost; the literal footer's muted copyright fails contrast. Its specified colors, media and font links remain unchanged.
