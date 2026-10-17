# Ava companion

Ava is an in-app sidebar character, separate from ChatGPT Pets. Its mint five-lobed body, English captions and React renderer are Aether-specific. The framework-free Bloub animation core is pinned at `b4bb3c1b5f93c7b87a2e8d620f667c4093d97749` under MIT; see src/vendor/bloub and THIRD_PARTY_NOTICES.md. No Vue, export codecs or remote runtime assets are added.

State follows actual run status and lifecycle phase events, never untrusted provider prose. Planning thinks, work focuses, tests change shape, supervisor review looks attentive, approval shows a notification, blocked/errors look concerned, completion looks happy and cancellation rests. Approval captions distinguish a coding plan, pending changes and analysis continuation. The question pose represents approval rather than claiming the provider asked a natural-language question. The session action navigates only; existing approvals remain explicit.

A selected active/attention session has priority. Otherwise active background work in the selected project takes priority, then pending attention, then the selected terminal session. Old completed sessions do not cause an idle workspace to claim that a new task finished. No other project's content is shown.

Pause and minimize are local UI preferences stored with a versioned `aether.companion.v1` key; failure to save them does not affect runs. Reduced-motion changes freeze the settled pose, and hidden windows suspend the loop. A lazy avatar chunk is loaded only while expanded. The isolated memoized renderer samples at at most 24 fps, disposes animation callbacks/listeners and does not update the parent application per frame. Local pointer movement changes Ava's gaze while the app is open; it is not transmitted or recorded. All captions are readable without motion or color.

Verification: npm test (lifecycle, trust/priority rules and real engine geometry), npm run test:e2e (desktop regression) and npm run test:live-ui (actual app integration including pause, minimize persistence, reduced motion and a real approval transition).
