# README artwork and screenshots

These assets are intentionally published documentation media. They contain no user sessions, account credentials, or private project source.

| File              | Origin                                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `banner.png`      | AI-assisted marketing artwork generated with the built-in image generation tool, using `workspace.png` as its product reference. Decorative framing and typography are artwork; the unmodified screenshot below is the interface reference. |
| `workspace.png`   | Actual Electron UI displaying an unexecuted Orbit sample plan, seeded in a fresh temporary profile.                                                                                                                                         |
| `graphify.png`    | Actual Electron UI showing a filtered, zoomed view of real source symbols extracted from the disposable Orbit project.                                                                                                                      |
| `widget.png`      | Actual native activity widget for that same unexecuted sample plan.                                                                                                                                                                         |
| `coding-team.png` | Actual Electron UI displaying persisted helper results from a successful disposable Codex plan/code/test/review/apply smoke run.                                                                                                            |

The Orbit screenshots illustrate the interface with demo data; they do not claim an AI implemented that project. The coding-team screenshot comes from the real provider acceptance fixture. Screenshot text is English. Animation poses and timestamps can differ between captures.

## Reproduce screenshots

Build the app first, then run:

```sh
npm run build
node scripts/readme-assets.mjs
```

The script creates a fresh temporary project and userData, never opens the user's saved sessions, and never makes a model request. An installed Graphify CLI is needed for the graph view.

To regenerate the coding-team view, run `npm run test:provider` (this uses account usage), then point `AETHER_TEAM_DATA` at the disposable fixture's printed data directory and run `node scripts/team-ui.mjs`. Copy the resulting `artifacts/coding-team.png` here after reviewing it. Do not publish raw fixture databases or provider histories.

## Banner prompt

Tool: built-in `image_gen`, reference input: `workspace.png`, opaque background. The selected output was copied into `docs/assets/banner.png`.

```text
Use case: ads-marketing. Asset type: wide GitHub README hero banner, approximately 2400 by 1200, for Aether Code desktop application.
Input image 1 is the REAL application screenshot and must be used as the product insert, preserving its UI, lettering, colors and relative layout exactly; do not invent extra features.
Create a refined, beautifully art-directed dark developer-tool product banner. Huge clean typography in the upper-left, exact title "AETHER CODE", below it exact copy "Your code. Your agents. Your call." and tiny precise label "LOCAL-FIRST CODING WORKSPACE". Asterisk-like small original Aether mark beside the title. Place the real screenshot as a single large, straight, crisp desktop app window occupying the lower-right two thirds, at most a subtle perspective, with its contents recognizable. Keep enough breathing room around the headline and screenshot. Use charcoal-black matte background, quiet pale blue highlights from the app, and a restrained mint light arc behind the screen suggesting a network of agents. Premium editorial composition, sparse micro-grid details, delicate border, beautifully balanced spacing. No generic robot, no stock laptop, no extraneous badges, no invented charts, no fake interface. The provided real screenshot is the focal product evidence. Do not add any text beyond the exact three requested text lines.
```

Aether's interface, Ava, and typeface retain their existing project/component attributions in [third-party notices](../../THIRD_PARTY_NOTICES.md).
