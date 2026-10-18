# GitHub and Telegram

## GitHub

In Settings, **Connect GitHub** reuses a verified GitHub CLI session or opens the official `gh auth login --hostname github.com --git-protocol https --web` flow in a native terminal. Complete its browser steps, then click **Verify GitHub**. If the CLI is missing, use the official setup guide and install Git as well. Aether does not silently install tools or copy an OAuth token.

**Browse repositories** requests the first 50 repositories visible to your account through `gh repo list`; search filters that list. **Clone repository** opens Aether's existing import dialog with its URL filled in. Choose a parent folder, clone, optionally review project skills, and continue. You may also paste any other supported HTTPS repository URL directly. GitHub permissions govern private access. Connecting/browsing does not commit, push or publish.

## Telegram setup

1. Create a bot with Telegram's official **@BotFather**. Use a bot dedicated to this Aether installation; another poller or webhook will conflict. Aether will not delete another app's webhook.
2. Enter the bot token in **Settings → Telegram activity & decisions**. Accept the displayed sharing scope, then click **Connect bot & create pairing code**. The token is encrypted using OS credential storage and never returned in snapshots, stored in SQLite or written to logs. A secure keyring is required on Linux.
3. Open the displayed bot in Telegram and send the exact `/start CODE` command in your private DM. The code expires after ten minutes. A message in a group does not pair it.
4. Confirm the recipient name and numeric user ID in Aether. This enables activity notifications and read-only status commands. Send a test notification to check delivery.
5. Optionally enable **Allow this paired Telegram user…** for remote decisions. This is off by default. It grants that user control over the same execution/apply gates available on your computer; do not pair someone else.

The app must remain running, awake and connected to the internet. The normal main-window close can leave Aether running for its widget; Quit stops the integration. There is no cloud relay, webhook listener or background daemon. Unchanged polling errors do not trigger repeated database exports. Activity is coalesced over one second, with bounded pending work and retries after outages or rate limits. Delivery may be delayed or duplicated after an ambiguous network failure; it is not an exactly-once messaging service.

## DM controls

- `/status`: current active/waiting/failed sessions, up to eight per request.
- `/pending`: sessions waiting for plan approval or change review.
- `/help`: supported commands. Arbitrary text does not start agent work.
- **Review plan**: complete tasks, objectives, scopes, acceptance, dependencies, models, verification commands and execution limits; **Approve & run** then uses Aether's existing executor. Repository tests run on the host under the same reviewed approval described in SECURITY.md.
- **Review changes**: supervisor review, verification evidence and full patch; **Apply to original project** uses the existing apply checks. Neither approval nor application commits or pushes.
- **Reject plan / Reject changes**: existing rejection path, retaining isolated worktrees.
- **Stop session**: existing cancellation path; running tools may take time to exit.

Review text is plain text with recognized credentials redacted. Reviews exceeding 24,000 UTF-16 code units after redaction require the desktop app and receive no remote approval buttons. Complete delivery precedes decision-button creation. Buttons expire after 24 hours and stop working after relevant session data changes. They are bound to one user, chat, message, action and fingerprint. A token is durably consumed before dispatch; failed/interrupted actions are not silently retried. Refresh status and review again when needed. Desktop changes, approval gates and original-project conflict checks still take precedence. Desktop and Telegram decisions share a per-session guard, preventing overlapping approval/application/rejection and task-model changes during a decision.

## Pause and removal

Disable activity notifications to stop both notifications and incoming commands. Re-enable them to resume polling and current status delivery. Disable remote decisions separately to retain notifications/read-only commands. Disconnect removes the local encrypted token, recipient, update offset and action tokens; it does not delete the bot or revoke its token at Telegram. Revoke the token through BotFather if needed. Aether never reads old DM text into a model.

## Verification boundary

Regression tests use a controlled Telegram API transport and disposable data to exercise pairing, unauthorized/stale/replayed buttons, complete/oversized/failed review delivery, real host-action routing contracts, encryption boundaries, outage recovery, notification coalescing and flood control. These checks do not establish live bot access. Desktop acceptance uses a fixture recipient without a token and a controlled native GitHub CLI fixture for verification, repository browsing and clone-dialog continuation. A separate existing-account check returned signed-out and was not treated as connected. No real Telegram bot credentials are present in the test harness.

Official references: [Telegram Bot API](https://core.telegram.org/bots/api), [BotFather](https://core.telegram.org/bots/features#botfather), [GitHub CLI login](https://cli.github.com/manual/gh_auth_login), [GitHub repository listing](https://cli.github.com/manual/gh_repo_list).
