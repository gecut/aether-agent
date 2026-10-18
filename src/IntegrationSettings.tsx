import { useEffect, useState } from "react";
import { GithubLogo } from "@phosphor-icons/react/dist/csr/GithubLogo";
import { TelegramLogo } from "@phosphor-icons/react/dist/csr/TelegramLogo";
import type {
  GitHubConnection,
  GitHubRepository,
  TelegramConnection,
} from "../shared/integrations";
type Status = { github: GitHubConnection; telegram: TelegramConnection };
type Call = <T = unknown>(
  command: string,
  payload?: unknown,
) => Promise<T | undefined>;
export function IntegrationSettings({
  call,
  onClone,
}: {
  call: Call;
  onClone: (url: string) => void;
}) {
  const [status, setStatus] = useState<Status>();
  const [token, setToken] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [repos, setRepos] = useState<GitHubRepository[]>([]);
  const [query, setQuery] = useState("");
  async function refresh() {
    const value = await call<Status>("integration.status");
    if (value) setStatus(value);
  }
  useEffect(() => {
    let live = true;
    const poll = async () => {
      const value = await call<Status>("integration.status");
      if (live && value) setStatus(value);
    };
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  async function action(name: string, payload?: unknown) {
    setBusy(name);
    try {
      const result = await call(name, payload);
      await refresh();
      return result;
    } finally {
      setBusy(undefined);
    }
  }
  const validToken = /^\d{5,20}:[A-Za-z0-9_-]{30,100}$/.test(token.trim());
  const telegram = status?.telegram,
    github = status?.github;
  return (
    <>
      <section
        className="settings-section integrations-section"
        aria-labelledby="github-integration-heading"
      >
        <div className="settings-section-title">
          <h2 id="github-integration-heading">
            <GithubLogo /> GitHub connection
          </h2>
          <span className="integration-state">
            {github?.state ?? "Loading…"}
          </span>
        </div>
        <p>
          Use your GitHub account to find and clone repositories. Sign-in opens
          the official GitHub CLI flow; Aether never reads or copies your access
          token.
        </p>
        <p role="status">{github?.message ?? "Loading GitHub connection…"}</p>
        <div className="integration-actions">
          <button
            className="button"
            disabled={!!busy}
            onClick={() => void action("integration.github.connect")}
          >
            Connect GitHub
          </button>
          <button
            className="button"
            disabled={!!busy}
            onClick={() => void action("integration.github.verify")}
          >
            {busy === "integration.github.verify"
              ? "Checking…"
              : "Verify GitHub"}
          </button>
          <button
            className="button"
            disabled={!!busy || github?.state !== "connected"}
            onClick={async () => {
              const value = await action("integration.github.repositories");
              if (value) setRepos(value as GitHubRepository[]);
            }}
          >
            Browse repositories
          </button>
          <button
            className="button"
            onClick={() => void call("integration.open.docs", "github")}
          >
            GitHub CLI setup guide
          </button>
        </div>
        <small>
          Requires GitHub CLI (cli.github.com) and Git on this computer. Private
          repository access follows your GitHub account permissions. Connecting
          does not publish or push code.
        </small>
        {!!repos.length && (
          <div className="integration-repositories">
            <label>
              Find a repository
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your first 50 repositories…"
              />
            </label>
            <ul>
              {repos
                .filter((repo) =>
                  repo.nameWithOwner
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((repo) => (
                  <li key={repo.url}>
                    <span>
                      <strong>{repo.nameWithOwner}</strong>
                      <small>{repo.isPrivate ? "Private" : "Public"}</small>
                    </span>
                    <button
                      className="button"
                      onClick={() => onClone(repo.url)}
                    >
                      Clone repository
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>
      <section
        className="settings-section integrations-section"
        aria-labelledby="telegram-integration-heading"
      >
        <div className="settings-section-title">
          <h2 id="telegram-integration-heading">
            <TelegramLogo /> Telegram activity & decisions
          </h2>
          <span className="integration-state">
            {telegram?.recipient
              ? telegram.enabled
                ? "Connected"
                : "Paused"
              : telegram?.configured
                ? "Pairing"
                : "Not connected"}
          </span>
        </div>
        <p>
          Follow project activity in your private DM. Review plans and changes,
          approve or reject decisions, and stop running work from Telegram while
          Aether is open on your computer.
        </p>
        <button
          className="button"
          onClick={() => void call("integration.open.docs", "telegram")}
        >
          How to create a Telegram bot
        </button>
        <ol className="integration-steps">
          <li>
            Create a dedicated bot with Telegram’s @BotFather and paste its bot
            token below.
          </li>
          <li>Send the pairing command to that bot in your own private DM.</li>
          <li>
            Confirm the recipient here, then choose whether to allow remote
            decisions.
          </li>
        </ol>
        {!telegram?.recipient && (
          <>
            <label>
              Telegram bot token
              <input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Enter a dedicated bot’s token"
                spellCheck={false}
              />
            </label>
            <label className="integration-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              I want Aether to send project names, task activity, and requested
              plan/change reviews (including file paths, diffs and verification
              results) to my paired Telegram DM.
            </label>
            <button
              className="button"
              disabled={!!busy || !validToken || !consent}
              onClick={async () => {
                const value = token.trim();
                setToken("");
                await action("integration.telegram.configure", value);
              }}
            >
              {busy === "integration.telegram.configure"
                ? "Connecting…"
                : "Connect bot & create pairing code"}
            </button>
          </>
        )}
        {telegram?.pairingCode && (
          <div className="integration-pairing">
            <strong>Send this to @{telegram.bot}</strong>
            <code>/start {telegram.pairingCode}</code>
            <small>
              Expires in 10 minutes. Keep this code private; confirm only your
              own Telegram user below.
            </small>
          </div>
        )}
        {telegram?.pendingRecipient && (
          <div className="integration-pairing">
            <strong>Confirm recipient: {telegram.pendingRecipient.name}</strong>
            <span>User ID: {telegram.pendingRecipient.userId}</span>
            <button
              className="button primary"
              disabled={!!busy}
              onClick={() => void action("integration.telegram.confirm")}
            >
              Confirm this private DM
            </button>
          </div>
        )}
        {telegram?.recipient && (
          <>
            <div className="integration-pairing">
              <strong>
                @{telegram.bot} → {telegram.recipient.name}
              </strong>
              <small>Private user ID: {telegram.recipient.userId}</small>
            </div>
            <label className="integration-check">
              <input
                type="checkbox"
                checked={telegram.enabled}
                disabled={!!busy}
                onChange={(event) =>
                  void action("integration.telegram.preferences", {
                    enabled: event.target.checked,
                    remoteDecisions: telegram.remoteDecisions,
                  })
                }
              />
              Send activity notifications and accept /status and /pending
              commands
            </label>
            <label className="integration-check">
              <input
                type="checkbox"
                checked={telegram.remoteDecisions}
                disabled={!!busy || !telegram.enabled}
                onChange={(event) =>
                  void action("integration.telegram.preferences", {
                    enabled: true,
                    remoteDecisions: event.target.checked,
                  })
                }
              />
              Allow this paired Telegram user to approve plans, apply reviewed
              patches, reject decisions and stop sessions on this computer
            </label>
            <small>
              Decision buttons are tied to the exact reviewed version and expire
              after 24 hours. Large reviews require the desktop app. Approval
              runs project code; Apply changes writes to the original project.
              Neither action commits or pushes.
            </small>
            <div className="integration-actions">
              <button
                className="button"
                disabled={!!busy || !telegram.enabled}
                onClick={() => void action("integration.telegram.test")}
              >
                Send test notification
              </button>
            </div>
          </>
        )}
        <p role="status">
          {telegram?.message ?? "Loading Telegram connection…"}
        </p>
        {telegram?.error && (
          <p className="integration-error" role="alert">
            {telegram.error}
          </p>
        )}
        {telegram?.lastDeliveryAt && (
          <small>
            Last delivered:{" "}
            {new Date(telegram.lastDeliveryAt).toLocaleString("en-US")}
          </small>
        )}
        {telegram?.configured && (
          <button
            className="button"
            disabled={!!busy}
            onClick={() => void action("integration.telegram.disconnect")}
          >
            Disconnect Telegram
          </button>
        )}
        <small>
          The bot token is encrypted with your OS credential store. Use a bot
          exclusively for this Aether installation; other pollers or webhooks
          will conflict. Aether must stay running and online to receive buttons
          or deliver notifications.
        </small>
      </section>
    </>
  );
}
