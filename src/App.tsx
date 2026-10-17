import { CodingTeamActivity } from "./CodingTeamActivity";
import { Companion } from "./companion/Companion";
import { companionPose } from "./companion/state";
import { SkillDiscovery } from "./SkillDiscovery";
import { CodeGraph } from "./CodeGraph";
import { IDE } from "./IDE";
import { TaskGraph } from "./TaskGraph";
import { playNotificationTone } from "./notifications";
import { SplashScreen } from "./SplashScreen";
import { BootScreen } from "./BootScreen";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import {
  AsteriskSimple,
  SquaresFour,
  ChatCircleDots,
  TreeStructure,
  UsersThree,
  Flask,
  Books,
  Brain,
  GitBranch,
  ClockCounterClockwise,
  GearSix,
  Plus,
  CaretDown,
  CaretRight,
  FolderOpen,
  ArrowUp,
  ArrowRight,
  ArrowUpRight,
  SidebarSimple,
  TerminalWindow,
  ShieldCheck,
  Check,
  X,
  Circle,
  ArrowsClockwise,
  FileCode,
  MagnifyingGlass,
  DownloadSimple,
  UploadSimple,
  Cpu,
  WarningCircle,
  Play,
  Trash,
  Eye,
  Sun,
  Moon,
  Stop,
  CircleNotch,
  Paperclip,
  PushPin,
} from "@phosphor-icons/react";
import type {
  Snapshot,
  Run,
  Project,
  Settings,
  RunEvent,
  Task,
  GitInfo,
  CompiledPrompt,
  PromptCoreInfo,
  Skill,
  ProviderId,
  PromptVersion,
  ConnectionStatus,
  PromptAttachment,
  ReleaseInfo,
  Chat,
} from "../shared/types";
import { defaults } from "../shared/types";
type Page =
  | "Graphify"
  | "Workspace"
  | "IDE"
  | "Agents & teams"
  | "Prompt laboratory"
  | "Skills library"
  | "Project memory"
  | "Git changes"
  | "Run history"
  | "Settings";
type Tab = "Session" | "Plan" | "Graphify" | "Changes" | "Trace";
const empty: Snapshot = {
  projects: [],
  runs: [],
  chats: [],
  settings: defaults,
  providers: [],
  prompts: [],
  skills: [],
  memories: [],
};
const bridge = window.aether;
const AvaMascot = lazy(() =>
  import("./companion/Avatar").then((module) => ({ default: module.Avatar })),
);
const formatStatus = (status: string) => status.replaceAll("_", " ");
const relativeTime = (at: string) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const shortPath = (value: string) => value.replace(/^\/Users\/[^/]+/, "~");
function Button({
  children,
  onClick,
  variant = "",
  disabled = false,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      className={"button " + variant}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}
function StatusDot({ status }: { status: string }) {
  return <span className={"status-dot " + status} />;
}
function AvaChatAvatar() {
  return (
    <span className="ava-chat-avatar" aria-label="Ava">
      <Suspense fallback={<span className="ava-chat-fallback" />}>
        <AvaMascot state={companionPose("idle")} paused />
      </Suspense>
    </span>
  );
}
function Tag({ children, kind = "" }: { children: ReactNode; kind?: string }) {
  return <span className={"tag " + kind}>{children}</span>;
}
function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h2 dir="auto">{title}</h2>
      <p dir="auto">{children}</p>
    </div>
  );
}
export function App() {
  const [data, setData] = useState<Snapshot>(empty),
    [page, setPage] = useState<Page>("Workspace"),
    [projectId, setProjectId] = useState(""),
    [runId, setRunId] = useState(""),
    [chatId, setChatId] = useState(""),
    [tab, setTab] = useState<Tab>("Session"),
    [inspector, setInspector] = useState(true),
    [objective, setObjective] = useState(""),
    [planning, setPlanning] = useState(false),
    [events, setEvents] = useState<RunEvent[]>([]),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [selectedTask, setSelectedTask] = useState(""),
    [gitInfo, setGitInfo] = useState<GitInfo>(),
    [filePreview, setFilePreview] = useState<{
      name: string;
      content: string;
    }>(),
    [projectMenu, setProjectMenu] = useState(false),
    [modelMenu, setModelMenu] = useState<"planner" | "coder" | null>(null),
    [search, setSearch] = useState(""),
    [attachments, setAttachments] = useState<PromptAttachment[]>([]),
    [showSplash, setShowSplash] = useState(
      () => localStorage.getItem("aether.welcome.v2") !== "seen",
    ),
    [commitMessage, setCommitMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [release, setRelease] = useState<ReleaseInfo>(),
    [checkingUpdate, setCheckingUpdate] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const bootStartedAt = useRef(performance.now());
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6500);
  }, []);
  const call = useCallback(
    async <T,>(command: string, payload?: unknown): Promise<T | undefined> => {
      if (!bridge) {
        notify(
          "Launch the desktop app with npm run dev to access local projects and runtimes.",
        );
        return;
      }
      try {
        return await bridge.invoke<T>(command, payload);
      } catch (error) {
        notify(
          String(error).replace(
            /^Error: Error invoking remote method '[^']+': Error: /,
            "",
          ),
        );
        return;
      }
    },
    [notify],
  );
  const refresh = useCallback(async () => {
    if (!bridge) {
      window.setTimeout(
        () => setLoading(false),
        Math.max(0, 450 - (performance.now() - bootStartedAt.current)),
      );
      return;
    }
    const result = await call<Snapshot>("snapshot");
    if (result) setData(result);
    window.setTimeout(
      () => setLoading(false),
      Math.max(0, 450 - (performance.now() - bootStartedAt.current)),
    );
  }, [call]);
  useEffect(() => {
    void refresh();
    return () => {
      clearTimeout(toastTimer.current);
      clearTimeout(refreshTimer.current);
    };
  }, [refresh]);
  useEffect(() => {
    if (!projectId && data.projects.length) setProjectId(data.projects[0].id);
  }, [data.projects, projectId]);
  useEffect(() => {
    if (projectId) void call("project.prepare", projectId).then(refresh);
  }, [projectId, call, refresh]);
  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme;
    const root = document.documentElement.style;
    const allowed = new Set([
      "--bg",
      "--sidebar",
      "--surface",
      "--raised",
      "--hover",
      "--border",
      "--text",
      "--muted",
      "--dim",
      "--accent",
      "--accent-bg",
    ]);
    for (const key of allowed) root.removeProperty(key);
    try {
      const values = JSON.parse(data.settings.themeJson || "{}") as Record<
        string,
        unknown
      >;
      for (const [key, value] of Object.entries(values))
        if (
          allowed.has(key) &&
          typeof value === "string" &&
          /^#[0-9a-f]{3,8}$/i.test(value)
        )
          root.setProperty(key, value);
    } catch {
      /* Invalid optional theme JSON is retained for correction without breaking the UI. */
    }
  }, [data.settings.theme, data.settings.themeJson]);
  useEffect(() => {
    if (!bridge) return;
    let pending: RunEvent[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = bridge.onEvent((event) => {
      if (event.runId === runId) {
        pending.push(event);
        if (!timer)
          timer = setTimeout(() => {
            const batch = pending;
            pending = [];
            timer = undefined;
            setEvents((previous) =>
              [
                ...new Map(
                  [...previous, ...batch].map((item) => [item.seq, item]),
                ).values(),
              ]
                .sort((a, b) => a.seq - b.seq)
                .slice(-2000),
            );
          }, 50);
      }
      if (event.type !== "agent.output" && !refreshTimer.current)
        refreshTimer.current = setTimeout(() => {
          refreshTimer.current = undefined;
          void refresh();
        }, 300);
      if (
        [
          "plan.created",
          "review.completed",
          "run.failed",
          "run.completed",
          "run.blocked",
        ].includes(event.type)
      )
        playNotificationTone();
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [runId, refresh]);
  useEffect(() => {
    setEvents([]);
    if (!runId) return;
    let stopped = false;
    void (async () => {
      let after = 0;
      const history: RunEvent[] = [];
      while (true) {
        const rows = await call<RunEvent[]>("events", { runId, after });
        if (!rows?.length || stopped) break;
        history.push(...rows);
        after = rows.at(-1)!.seq;
        if (rows.length < 2000) break;
      }
      if (!stopped)
        setEvents((previous) =>
          [
            ...new Map(
              [...history, ...previous].map((e) => [e.seq, e]),
            ).values(),
          ]
            .sort((a, b) => a.seq - b.seq)
            .slice(-2000),
        );
    })();
    return () => {
      stopped = true;
    };
  }, [runId, call]);
  const project = data.projects.find((p) => p.id === projectId),
    run = data.runs.find((r) => r.id === runId),
    chat = data.chats.find((candidate) => candidate.id === chatId),
    task =
      run?.tasks.find((t) => t.id === selectedTask) ??
      run?.tasks.find((t) => t.status === "running") ??
      run?.tasks[0];
  const projectRuns = data.runs
      .filter((r) => r.projectId === projectId)
      .sort(
        (a, b) =>
          Number(!!b.pinned) - Number(!!a.pinned) ||
          b.updatedAt.localeCompare(a.updatedAt),
      ),
    activeRuns = projectRuns.filter((r) =>
      ["running", "initializing"].includes(r.status),
    ),
    approvalCount = projectRuns.filter((r) =>
      ["awaiting_approval", "awaiting_review"].includes(r.status),
    ).length;
  const openProject = async () => {
    const p = await call<Project>("project.choose");
    if (p) {
      await refresh();
      setProjectId(p.id);
      setRunId("");
      setPage("Workspace");
    }
    setProjectMenu(false);
  };
  const openRun = (r: Run) => {
    setProjectId(r.projectId);
    setRunId(r.id);
    setPage("Workspace");
    setTab("Session");
    setSelectedTask("");
    setObjective("");
    setChatId("");
  };
  const openChat = (target: Chat) => {
    setChatId(target.id);
    setRunId("");
    setPage("Workspace");
    setObjective("");
  };
  useEffect(
    () =>
      bridge?.onNavigate(async (target) => {
        const latest = await call<Snapshot>("snapshot");
        if (!latest) return;
        setData(latest);
        const targetRun = latest.runs.find(
          (candidate) => candidate.id === target.runId,
        );
        if (targetRun) {
          openRun(targetRun);
          if (target.taskId) {
            setSelectedTask(target.taskId);
            setInspector(true);
          }
        }
      }),
    [call],
  );
  const saveSettings = async (settings: Settings) => {
    const result = await call<Settings>("settings.save", settings);
    if (result) setData((d) => ({ ...d, settings: result }));
  };
  const updateModel = async (role: "planner" | "coder", patch: unknown) => {
    const settings = await call<Settings>("settings.model", { role, patch });
    if (settings) setData((d) => ({ ...d, settings }));
  };
  const checkForUpdate = async () => {
    setCheckingUpdate(true);
    const latest = await call<ReleaseInfo>("update.check");
    if (latest) setRelease(latest);
    setCheckingUpdate(false);
  };
  const submit = async () => {
    if (!planning) {
      if (objective.trim().length < 1) return;
      setBusy(true);
      const conversation = await call<Chat>("chat.send", {
        content: objective.trim(),
        ...(chatId ? { chatId } : {}),
      });
      if (conversation) {
        await refresh();
        setChatId(conversation.id);
        setObjective("");
        setAttachments([]);
      }
      setBusy(false);
      return;
    }
    if (!project) {
      notify("Choose a local project before creating a plan.");
      return;
    }
    if (objective.trim().length < 3) return;
    setBusy(true);
    const result = await call<Run>("run.create", {
      projectId,
      objective: objective.trim(),
      attachments,
    });
    if (result) {
      await refresh();
      setRunId(result.id);
      setChatId("");
      setPlanning(false);
      setObjective("");
      setAttachments([]);
      setTab("Session");
    }
    setBusy(false);
  };
  const attachReference = async () => {
    if (attachments.length >= 8)
      return notify("You can attach up to eight reference files.");
    const attachment = await call<PromptAttachment | null>(
      "prompt.attachment.choose",
    );
    if (attachment) setAttachments((current) => [...current, attachment]);
  };
  const setPinned = async (target: Run) => {
    await call("run.pin", { id: target.id, pinned: !target.pinned });
    await refresh();
  };
  const deleteSession = async (target: Run) => {
    if (
      !window.confirm(
        `Delete the saved session “${target.title}”? Its local chat and history will be removed.`,
      )
    )
      return;
    const deleted = await call<boolean>("run.delete", target.id);
    if (deleted) {
      if (runId === target.id) setRunId("");
      await refresh();
      notify("Session deleted.");
    }
  };
  const runAction = async (action: string) => {
    if (!run) return;
    setBusy(true);
    const result = await call<Run>(action, run.id);
    await refresh();
    setBusy(false);
    if (result && action === "run.apply")
      notify(
        "Changes applied to your working tree. Review and commit when ready.",
      );
  };
  const loadGit = useCallback(async () => {
    if (projectId) {
      const result = await call<GitInfo>("git", projectId);
      if (result) setGitInfo(result);
    }
  }, [call, projectId]);
  useEffect(() => {
    if (page === "Git changes" || tab === "Changes") void loadGit();
  }, [page, tab, loadGit]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "n") {
        event.preventDefault();
        setRunId("");
        setPage("Workspace");
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "o") {
        event.preventDefault();
        void openProject();
      }
      if (event.key === "Escape") {
        setModelMenu(null);
        setProjectMenu(false);
        setFilePreview(undefined);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });
  const navigation: [Page, ReactNode][] = [
    ["Workspace", <SquaresFour />],
    ["IDE", <FileCode />],
    ["Graphify", <TreeStructure />],
    ["Agents & teams", <UsersThree />],
    ["Prompt laboratory", <Flask />],
    ["Skills library", <Books />],
    ["Project memory", <Brain />],
    ["Git changes", <GitBranch />],
    ["Run history", <ClockCounterClockwise />],
  ];
  if (loading) return <BootScreen />;
  return (
    <div className={"app " + (!inspector ? "inspector-hidden" : "")}>
      <div className="titlebar">
        <div className="window-space" />
        <div className="titlebar-center">
          <AsteriskSimple weight="bold" size={14} /> Aether Code <span>/</span>
          <bdi>{project?.name ?? "Local workspace"}</bdi>
        </div>
        <span className="local-label">
          <ShieldCheck size={13} /> Local-first
        </span>
      </div>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-symbol">
            <AsteriskSimple size={24} weight="bold" />
          </span>
          <span>
            AETHER<span className="brand-code">CODE</span>
          </span>
          <span className="version">0.1</span>
        </div>
        <div className="project-control">
          <button
            className="project-switch"
            onClick={() => setProjectMenu((v) => !v)}
          >
            <span className="project-avatar">
              {project?.name.slice(0, 1).toUpperCase() ?? <FolderOpen />}
            </span>
            <span>
              <strong dir="auto">{project?.name ?? "Open a project"}</strong>
              <small>
                {project ? "Local repository" : "Choose a workspace"}
              </small>
            </span>
            <CaretDown size={13} />
          </button>
          {projectMenu && (
            <div className="popover project-popover">
              {data.projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setProjectId(p.id);
                    setRunId("");
                    setProjectMenu(false);
                  }}
                >
                  <FolderOpen />
                  {p.name}
                  {p.id === projectId && <Check />}
                </button>
              ))}
              <button onClick={openProject}>
                <Plus />
                Open local folder <kbd>⌘ O</kbd>
              </button>
            </div>
          )}
        </div>
        <button
          className="new-session"
          onClick={() => {
            setPage("Workspace");
            setRunId("");
            setObjective("");
          }}
        >
          <Plus size={16} /> New session <kbd>⌘ N</kbd>
        </button>
        <nav>
          {navigation.map(([label, icon]) => (
            <button
              key={label}
              className={page === label ? "active" : ""}
              onClick={() => {
                setPage(label);
                setSearch("");
              }}
            >
              {icon}
              <span>{label}</span>
              {label === "Workspace" && approvalCount > 0 && (
                <span className="nav-count">{approvalCount}</span>
              )}
              {label === "Skills library" && data.skills.length > 0 && (
                <span className="nav-number">
                  {data.skills.filter((s) => s.enabled).length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-section">
          <div className="section-label">
            LATEST ACTIVITY{" "}
            <span>{projectRuns.length + data.chats.length}</span>
            <button
              aria-label="New chat"
              title="New chat"
              onClick={() => {
                setRunId("");
                setChatId("");
                setObjective("");
                setPage("Workspace");
              }}
            >
              <Plus size={13} />
            </button>
          </div>
          <div className="session-list">
            {data.chats.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className={
                  "session-row " + (item.id === chatId ? "selected" : "")
                }
              >
                <button className="session-open" onClick={() => openChat(item)}>
                  <AvaChatAvatar />
                  <bdi>{item.title}</bdi>
                  <StatusDot status="completed" />
                </button>
              </div>
            ))}
            {projectRuns.slice(0, 7).map((r) => (
              <div
                key={r.id}
                className={"session-row " + (r.id === runId ? "selected" : "")}
              >
                <button className="session-open" onClick={() => openRun(r)}>
                  <ChatCircleDots size={15} />
                  <bdi>{r.title}</bdi>
                  <StatusDot status={r.status} />
                </button>
                <button
                  className="session-pin"
                  aria-label={r.pinned ? "Unpin session" : "Pin session"}
                  title={r.pinned ? "Unpin session" : "Pin session"}
                  onClick={() => void setPinned(r)}
                >
                  <PushPin weight={r.pinned ? "fill" : "regular"} />
                </button>
              </div>
            ))}
            {!projectRuns.length && !data.chats.length && (
              <p dir="auto" className="sidebar-hint">
                Your sessions will live here.
              </p>
            )}
          </div>
        </div>
        <div className="sidebar-bottom">
          <Companion
            runs={projectRuns}
            selectedId={runId}
            events={events}
            onOpen={openRun}
          />
          <div className="runtime-status">
            <span
              className={
                "connection-dot " +
                (data.providers.some((p) => p.id === "codex" && p.authenticated)
                  ? "online"
                  : "")
              }
            />
            <span>
              {data.providers.some((p) => p.id === "codex" && p.authenticated)
                ? "Codex connected"
                : "Connect a runtime"}
              <small>
                {activeRuns.length
                  ? `${activeRuns.length} active session${activeRuns.length > 1 ? "s" : ""}`
                  : "Ready when you are"}
              </small>
            </span>
            <button
              aria-label="Refresh providers"
              onClick={async () => {
                await call("diagnostics");
                await refresh();
              }}
            >
              <ArrowsClockwise size={14} />
            </button>
          </div>
          <button
            className={"settings-nav " + (page === "Settings" ? "active" : "")}
            onClick={() => setPage("Settings")}
          >
            <GearSix size={17} /> Settings{" "}
            <span className="keyboard-hint">⌘ ,</span>
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="workspace-header">
          <div className="breadcrumbs">
            <span>{page === "Workspace" ? "Workspace" : page}</span>
            {page === "Workspace" && (
              <>
                <CaretRight size={12} />
                <strong dir="auto">
                  {run?.title ?? chat?.title ?? "New chat"}
                </strong>
              </>
            )}
          </div>
          <div className="header-actions">
            {release ? (
              <button
                className="update-available"
                title={`Open ${release.name}`}
                onClick={() => void call("update.open")}
              >
                <DownloadSimple /> Update Aether
              </button>
            ) : (
              <button
                className="update-check"
                aria-label="Check for updates"
                title="Check GitHub releases for a newer Aether build"
                onClick={() => void checkForUpdate()}
                disabled={checkingUpdate}
              >
                {checkingUpdate ? (
                  <CircleNotch className="spin" />
                ) : (
                  <DownloadSimple size={15} />
                )}
                Check updates
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Show desktop widget"
              title="Show desktop widget"
              onClick={() => void call("widget.show", projectId || undefined)}
            >
              <SquaresFour size={19} />
            </button>
            {run && (
              <Tag kind={run.status}>
                <StatusDot status={run.status} />
                {formatStatus(run.status)}
              </Tag>
            )}
            <button
              className="icon-button"
              aria-label="Toggle inspector"
              onClick={() => setInspector((v) => !v)}
            >
              <SidebarSimple size={19} />
            </button>
          </div>
        </header>
        {page === "Workspace" ? (
          <>
            <div className="model-bar">
              {(["planner", "coder"] as const).map((role) => (
                <div className="model-control" key={role}>
                  <span className="model-role">
                    {role === "planner" ? (
                      <TreeStructure size={14} />
                    ) : (
                      <CodeIcon />
                    )}
                    {role === "planner" ? "PLANNER" : "CODING MODEL"}
                  </span>
                  <button
                    className="model-trigger"
                    onClick={() =>
                      setModelMenu(modelMenu === role ? null : role)
                    }
                  >
                    <span
                      className={
                        "provider-glyph " + data.settings[role].provider
                      }
                    >
                      {data.settings[role].provider === "codex" ? (
                        <AsteriskSimple weight="bold" />
                      ) : (
                        <Cpu />
                      )}
                    </span>
                    {data.providers.find(
                      (p) => p.id === data.settings[role].provider,
                    )?.name ?? "OpenAI Codex"}
                    <span className="model-name">
                      {data.settings[role].model || "Runtime default"}
                    </span>
                    <CaretDown size={12} />
                  </button>
                  {modelMenu === role && (
                    <div className="popover model-popover">
                      <span className="section-label">
                        {role === "planner"
                          ? "PLANNING & SUPERVISION"
                          : "IMPLEMENTATION RUNTIME"}
                      </span>
                      <label>
                        Provider
                        <select
                          value={data.settings[role].provider}
                          onChange={(e) =>
                            void updateModel(role, { provider: e.target.value })
                          }
                        >
                          {data.providers.length ? (
                            data.providers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                                {!p.installed ? " · unavailable" : ""}
                              </option>
                            ))
                          ) : (
                            <option value="codex">OpenAI Codex</option>
                          )}
                        </select>
                      </label>
                      <label>
                        Model ID
                        <input
                          dir="auto"
                          key={role + data.settings[role].provider}
                          defaultValue={data.settings[role].model}
                          placeholder="Empty = authenticated runtime default"
                          onBlur={(e) =>
                            void updateModel(role, { model: e.target.value })
                          }
                        />
                      </label>
                      <p dir="auto">
                        Independent {role === "planner" ? "planner" : "coding"}{" "}
                        settings. Model access is verified when the provider
                        runs.
                      </p>
                      <Button
                        onClick={() => {
                          setPage("Settings");
                          setModelMenu(null);
                        }}
                      >
                        Provider settings <ArrowUpRight />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <span className="model-bar-end">
                <span className="connection-dot" />
                {data.settings.concurrency} parallel task leads
              </span>
            </div>
            {run ? (
              <>
                <div className="session-heading">
                  <div>
                    <span className="eyebrow">
                      SESSION / {run.id.slice(0, 8)}
                    </span>
                    <h1 dir="auto">{run.title}</h1>
                    <p dir="auto">{run.plan?.summary ?? run.objective}</p>
                  </div>
                  {["running", "initializing"].includes(run.status) && (
                    <Button
                      variant="danger-quiet"
                      onClick={() => void runAction("run.cancel")}
                      disabled={busy}
                    >
                      <Stop size={14} />
                      Stop run
                    </Button>
                  )}
                </div>
                <div className="tabs">
                  {(
                    ["Session", "Plan", "Graphify", "Changes", "Trace"] as const
                  ).map((t) => (
                    <button
                      className={tab === t ? "active" : ""}
                      onClick={() => setTab(t)}
                      key={t}
                    >
                      {t === "Session" ? (
                        <ChatCircleDots />
                      ) : t === "Plan" ? (
                        <TreeStructure />
                      ) : t === "Changes" ? (
                        <GitBranch />
                      ) : (
                        <TerminalWindow />
                      )}
                      {t}
                      {t === "Plan" && run.tasks.length > 0 && (
                        <span>{run.tasks.length}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="session-scroll">
                  {tab === "Session" && (
                    <>
                      <div className="user-message">
                        <div className="message-avatar">Y</div>
                        <div>
                          <div className="message-meta">
                            You <time>{relativeTime(run.createdAt)}</time>
                          </div>
                          <p dir="auto">{run.objective}</p>
                        </div>
                      </div>
                      <div className="assistant-message">
                        <div className="message-avatar aether-avatar">
                          <AsteriskSimple weight="bold" />
                        </div>
                        <div className="message-content">
                          <div className="message-meta">
                            Aether <Tag>Supervisor</Tag>
                          </div>
                          {run.status === "initializing" ? (
                            <div className="thinking">
                              <CircleNotch className="spin" />
                              Inspecting your repository and preparing a plan…
                            </div>
                          ) : (
                            <>
                              <p dir="auto">
                                {run.reason ??
                                  "Your agents are working in isolated worktrees. Follow their progress below."}
                              </p>
                              {run.tasks.length > 0 && (
                                <TaskList
                                  tasks={run.tasks}
                                  selected={task?.id}
                                  onSelect={(id) => {
                                    setSelectedTask(id);
                                    setInspector(true);
                                  }}
                                />
                              )}
                              {run.review && (
                                <div className="review-note">
                                  <div className="section-label">
                                    <ShieldCheck /> SUPERVISOR REVIEW
                                  </div>
                                  <pre className="prose-output" dir="auto">
                                    {run.review}
                                  </pre>
                                </div>
                              )}
                            </>
                          )}
                          {run.status === "failed" && (
                            <div className="notice error">
                              <WarningCircle />
                              {run.reason}
                            </div>
                          )}
                        </div>
                      </div>
                      {events.length > 0 && (
                        <Activity events={events.slice(-8)} compact />
                      )}
                    </>
                  )}
                  {tab === "Graphify" && (
                    <CodeGraph projectId={run.projectId} run={run} />
                  )}
                  {tab === "Plan" && (
                    <>
                      {run.plan ? (
                        <>
                          <div className="section-intro">
                            <h2 dir="auto">Implementation plan</h2>
                            <p dir="auto">
                              Dependencies govern execution. Overlapping file
                              scopes run sequentially.
                            </p>
                          </div>
                          <div className="notice">
                            <UsersThree />
                            <p>
                              {run.config.codingTeam?.enabled
                                ? `Codex coding teams: each writing task lead uses up to ${run.config.codingTeam.maxHelpers} read-only review helpers on its selected coding model, then integrates their findings. Up to ${run.config.concurrency * run.config.codingTeam.maxHelpers} agents per run. Extra helpers consume model usage. Planning, analysis, and final review stay single-agent.`
                                : "Single-agent coding. Coding-team settings apply to newly created plans."}
                            </p>
                          </div>
                          <TaskGraph
                            tasks={run.tasks}
                            onSelect={setSelectedTask}
                          />
                          <TaskList
                            tasks={run.tasks}
                            selected={task?.id}
                            onSelect={setSelectedTask}
                            expanded
                          />
                          {run.plannerSnapshot && (
                            <details className="prompt-snapshot">
                              <summary>
                                <Eye /> Inspect planner instructions{" "}
                                <span>
                                  {run.plannerSnapshot.estimatedTokens.toLocaleString()}{" "}
                                  estimated tokens
                                </span>
                              </summary>
                              <pre>{run.plannerSnapshot.text}</pre>
                            </details>
                          )}
                        </>
                      ) : (
                        <Empty
                          icon={<TreeStructure />}
                          title="The plan comes first"
                        >
                          Your planner is gathering evidence from the
                          repository.
                        </Empty>
                      )}
                    </>
                  )}
                  {tab === "Changes" && (
                    <>
                      <div className="section-intro">
                        <h2 dir="auto">Review changes</h2>
                        <p dir="auto">
                          {run.patch
                            ? "Combined changes from isolated worker worktrees."
                            : "The diff will appear after workers finish."}
                        </p>
                      </div>
                      <Diff text={run.patch ?? ""} />
                      {run.tasks.some((t) => t.tests?.length) && (
                        <div className="test-evidence">
                          <h3 dir="auto">Verification evidence</h3>
                          {[
                            ...run.tasks.flatMap((t) =>
                              (t.tests ?? []).map((test, i) => ({
                                ...test,
                                evidenceId: t.id + i,
                              })),
                            ),
                            ...(run.verification ?? []).map((test, i) => ({
                              ...test,
                              command: "Integration: " + test.command,
                              evidenceId: "integration" + i,
                            })),
                          ].map((test) => (
                            <details key={test.evidenceId}>
                              <summary>
                                <StatusDot
                                  status={
                                    test.exitCode === 0 ? "completed" : "failed"
                                  }
                                />
                                <code>{test.command}</code>
                                <Tag
                                  kind={
                                    test.exitCode === 0 ? "completed" : "failed"
                                  }
                                >
                                  Exit {test.exitCode}
                                </Tag>
                                <span>
                                  {(test.durationMs / 1000).toFixed(1)}s
                                </span>
                              </summary>
                              <pre>{test.output}</pre>
                            </details>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {tab === "Trace" && (
                    <>
                      <div className="section-intro">
                        <h2 dir="auto">Execution trace</h2>
                        <p dir="auto">
                          Ordered, persisted runtime events. Secrets are
                          redacted before storage.
                        </p>
                      </div>
                      <Activity events={events} />
                    </>
                  )}
                  {(run.status === "completed" ||
                    (run.status === "awaiting_review" && !run.patch)) && (
                    <label className="continuation-input">
                      Implementation instructions (optional)
                      <textarea
                        dir="auto"
                        aria-label="Implementation follow-up"
                        value={objective}
                        onChange={(event) => setObjective(event.target.value)}
                        placeholder="Add details for the next coding phase, then continue to implementation…"
                      />
                    </label>
                  )}
                </div>
                {[
                  "awaiting_approval",
                  "awaiting_review",
                  "blocked",
                  "failed",
                  "cancelled",
                  "completed",
                ].includes(run.status) && (
                  <div className="approval-bar">
                    <div>
                      <ShieldCheck size={18} />
                      <span>
                        {run.status === "awaiting_approval"
                          ? "Your plan is ready for review"
                          : run.status === "awaiting_review"
                            ? "Review before applying changes"
                            : formatStatus(run.status)}
                        <small>
                          {run.status === "awaiting_approval"
                            ? "Approval authorizes provider execution and listed test commands in isolated worktrees."
                            : run.status === "awaiting_review"
                              ? "Apply writes the reviewed diff to your original working tree."
                              : "Your session and execution evidence are saved locally."}
                        </small>
                      </span>
                    </div>
                    <div className="approval-actions">
                      {["awaiting_approval", "awaiting_review"].includes(
                        run.status,
                      ) && (
                        <Button
                          onClick={() => void runAction("run.reject")}
                          disabled={busy}
                        >
                          Reject
                        </Button>
                      )}
                      {run.status === "awaiting_approval" && (
                        <Button
                          variant="primary"
                          onClick={() => void runAction("run.approve")}
                          disabled={busy}
                        >
                          <Play weight="fill" />
                          Approve & run
                        </Button>
                      )}
                      {run.status === "awaiting_review" && (
                        <Button
                          variant="primary"
                          onClick={() => void runAction("run.apply")}
                          disabled={busy}
                        >
                          <Check />
                          Apply changes
                        </Button>
                      )}
                      {["failed", "blocked"].includes(run.status) &&
                        run.plan && (
                          <Button
                            onClick={() => void runAction("run.approve")}
                            disabled={busy}
                          >
                            <ArrowsClockwise />
                            Retry remaining tasks
                          </Button>
                        )}
                      {(run.status === "completed" ||
                        (run.status === "awaiting_review" && !run.patch)) && (
                        <Button
                          variant="primary"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            const next = await call<Run>("run.continue", {
                              runId: run.id,
                              objective:
                                objective.trim() ||
                                "Continue to implementation. Build the project described in the previous session using its design and deliverables. Create concrete source files and appropriate verification.",
                            });
                            if (next) {
                              await refresh();
                              setRunId(next.id);
                              setObjective("");
                              setTab("Plan");
                            }
                            setBusy(false);
                          }}
                        >
                          Continue to implementation <ArrowRight />
                        </Button>
                      )}
                      {["failed", "cancelled", "completed"].includes(
                        run.status,
                      ) && (
                        <Button
                          onClick={() => {
                            setObjective(run.objective);
                            setRunId("");
                          }}
                        >
                          New plan <ArrowRight />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : chat ? (
              <div className="session-scroll chat-scroll">
                <div className="session-heading">
                  <div>
                    <span className="eyebrow">AVA / LOCAL CONVERSATION</span>
                    <h1 dir="auto">{chat.title}</h1>
                    <p>
                      Ask anything. Ava will flag requests that need a project
                      plan.
                    </p>
                  </div>
                </div>
                <div className="chat-messages">
                  {chat.messages.map((message) => (
                    <div
                      className={
                        message.role === "user"
                          ? "user-message"
                          : "assistant-message"
                      }
                      key={message.id}
                    >
                      {message.role === "user" ? (
                        <div className="message-avatar">Y</div>
                      ) : (
                        <AvaChatAvatar />
                      )}
                      <div className="message-content">
                        <div className="message-meta">
                          {message.role === "user" ? "You" : "Ava"}{" "}
                          <time>{relativeTime(message.at)}</time>
                        </div>
                        <p dir="auto">
                          {message.content.replace(/^PROJECT_WORK:\s*/i, "")}
                        </p>
                        {message.role === "assistant" &&
                          /^PROJECT_WORK:/i.test(message.content) && (
                            <Button
                              onClick={() => {
                                setObjective(
                                  [...chat.messages]
                                    .reverse()
                                    .find((item) => item.role === "user")
                                    ?.content ?? "",
                                );
                                setChatId("");
                                setPlanning(true);
                                notify(
                                  project
                                    ? "Project request ready to plan."
                                    : "Choose a project, then send this request to create a plan.",
                                );
                              }}
                            >
                              {project
                                ? "Create project plan"
                                : "Choose a project"}{" "}
                              <ArrowRight />
                            </Button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="welcome-scroll">
                <div className="welcome">
                  <div className="welcome-kicker">
                    <span className="tiny-logo">
                      <AsteriskSimple weight="bold" />
                    </span>{" "}
                    YOUR LOCAL COMMAND CENTER
                  </div>
                  <div className="welcome-question">
                    <span className="welcome-ava" aria-label="Ava is ready">
                      <AsteriskSimple weight="bold" />
                    </span>
                    <h1>What are we building today?</h1>
                  </div>
                  <p dir="auto">
                    Start a conversation with your local coding team. Aether
                    plans first, then asks before any code is executed.
                  </p>
                  <div className="workspace-context">
                    <FolderOpen size={16} />
                    {project ? (
                      <>
                        <strong dir="auto">{project.name}</strong>
                        <span>{shortPath(project.path)}</span>
                        <Tag>Local repository</Tag>
                      </>
                    ) : (
                      <>
                        <span>Start by opening a local repository</span>
                        <button onClick={openProject}>
                          Open project <ArrowUpRight />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="starter-title">
                    What are we building today?
                    <span>Start with an objective</span>
                  </div>
                  <div className="suggestions">
                    {[
                      {
                        icon: <CodeIcon />,
                        title: "Build a feature",
                        text: "Turn an idea into a reviewed implementation.",
                        prompt:
                          "Inspect this repository and plan a small, useful feature that fits its architecture. Explain the proposed behavior and tests.",
                      },
                      {
                        icon: <MagnifyingGlass />,
                        title: "Understand a codebase",
                        text: "Map the architecture and find your way in.",
                        prompt:
                          "Analyze this codebase. Document its architecture, key entry points, and the path a request follows through the system.",
                      },
                      {
                        icon: <ShieldCheck />,
                        title: "Find & fix an issue",
                        text: "Trace the cause. Verify the repair.",
                        prompt:
                          "Review this repository for one reproducible defect. Write a regression test and propose a focused fix.",
                      },
                      {
                        icon: <TreeStructure />,
                        title: "Refactor with a plan",
                        text: "Improve the structure, preserve the behavior.",
                        prompt:
                          "Identify a focused refactor with a clear benefit. Plan the smallest change and verification needed to preserve behavior.",
                      },
                    ].map((s) => (
                      <button
                        key={s.title}
                        onClick={() => {
                          setObjective(s.prompt);
                          setPlanning(true);
                          document.getElementById("objective")?.focus();
                        }}
                      >
                        <span className="suggestion-icon">{s.icon}</span>
                        <span>
                          <strong dir="auto">{s.title}</strong>
                          <small>{s.text}</small>
                        </span>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  </div>
                  <div className="workflow-line">
                    <span>
                      <TreeStructure />
                      Plan with evidence
                    </span>
                    <CaretRight />
                    <span>
                      <UsersThree />
                      Delegate with purpose
                    </span>
                    <CaretRight />
                    <span>
                      <GitBranch />
                      Review every change
                    </span>
                  </div>
                </div>
              </div>
            )}
            {!run && (
              <div className="composer-wrap">
                <div className="composer">
                  <textarea
                    dir="auto"
                    id="objective"
                    aria-label="Coding objective"
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    placeholder={
                      planning
                        ? "Describe the project work you want planned…"
                        : "Message Ava…"
                    }
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        void submit();
                      }
                    }}
                  />
                  <div className="composer-bottom">
                    <div>
                      <button onClick={openProject}>
                        <FolderOpen size={15} />
                        <bdi>{project?.name ?? "Add project"}</bdi>
                      </button>
                      <button
                        onClick={() => void attachReference()}
                        title="Attach reference files"
                      >
                        <Paperclip size={15} /> Add files
                      </button>
                      <button
                        className={
                          planning ? "composer-mode active" : "composer-mode"
                        }
                        onClick={() => setPlanning((value) => !value)}
                        title="Toggle project planning mode"
                      >
                        <TreeStructure size={15} />{" "}
                        {planning ? "Plan project" : "Chat with Ava"}
                      </button>
                      <span className="composer-divider" />
                      <span>
                        <ShieldCheck size={14} />
                        {planning
                          ? "Plan before execution"
                          : "Ava decides when project work is needed"}
                      </span>
                    </div>
                    <button
                      className="send-button"
                      aria-label={
                        planning
                          ? "Create implementation plan"
                          : "Send chat message"
                      }
                      onClick={() => void submit()}
                      disabled={
                        busy || objective.trim().length < (planning ? 3 : 1)
                      }
                    >
                      {busy ? (
                        <CircleNotch className="spin" />
                      ) : (
                        <ArrowUp weight="bold" />
                      )}
                    </button>
                  </div>
                  {attachments.length > 0 && (
                    <div
                      className="prompt-attachments"
                      aria-label="Attached reference files"
                    >
                      {attachments.map((image) => (
                        <span key={image.id}>
                          <Paperclip /> {image.name}
                          <button
                            aria-label={`Remove ${image.name}`}
                            onClick={() =>
                              setAttachments((current) =>
                                current.filter((item) => item.id !== image.id),
                              )
                            }
                          >
                            <X />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="composer-hint">
                  <span>
                    <ShieldCheck size={12} />{" "}
                    {planning
                      ? "Local execution. Explicit approvals. Your code stays yours."
                      : "Ava chats first and asks before any project work."}
                  </span>
                  <span>
                    <kbd>⌘</kbd> <kbd>↵</kbd> to send
                  </span>
                </div>
              </div>
            )}
          </>
        ) : page === "IDE" ? (
          <IDE project={project} call={call} notify={notify} />
        ) : page === "Graphify" ? (
          <div className="page-scroll">
            {project ? (
              <CodeGraph
                projectId={project.id}
                run={run?.projectId === project.id ? run : undefined}
              />
            ) : (
              <p dir="auto">Open a project to inspect its live code graph.</p>
            )}
          </div>
        ) : page === "Settings" ? (
          <SettingsPage
            data={data}
            save={saveSettings}
            call={call}
            refresh={refresh}
            notify={notify}
          />
        ) : page === "Prompt laboratory" ? (
          <PromptLab
            data={data}
            call={call}
            refresh={refresh}
            notify={notify}
          />
        ) : page === "Skills library" ? (
          <SkillsPage
            data={data}
            call={call}
            refresh={refresh}
            project={project}
          />
        ) : page === "Project memory" ? (
          <MemoryPage
            data={data}
            project={project}
            call={call}
            refresh={refresh}
          />
        ) : page === "Git changes" ? (
          <div className="page-scroll">
            <PageHeading
              eyebrow="REPOSITORY"
              title="Git changes"
              description="The actual state of your original working tree."
              action={
                <Button onClick={() => void loadGit()}>
                  <ArrowsClockwise />
                  Refresh
                </Button>
              }
            />
            {!project ? (
              <Empty icon={<FolderOpen />} title="Open a project first">
                Choose a local Git repository to inspect its changes.
              </Empty>
            ) : (
              <>
                <div className="git-summary">
                  <GitBranch />
                  <strong dir="auto">{gitInfo?.branch ?? "Loading…"}</strong>
                  <span>{gitInfo?.head.slice(0, 8)}</span>
                  <Tag>
                    {gitInfo?.status.trim()
                      ? "Uncommitted changes"
                      : "Clean working tree"}
                  </Tag>
                </div>
                <pre className="git-status">
                  {gitInfo?.status || "No changes in the working tree."}
                </pre>
                <div className="git-actions">
                  <input
                    value={commitMessage}
                    onChange={(event) => setCommitMessage(event.target.value)}
                    placeholder="Commit message"
                    aria-label="Commit message"
                  />
                  <Button
                    disabled={
                      !gitInfo?.status.trim() || !commitMessage.trim() || busy
                    }
                    onClick={async () => {
                      setBusy(true);
                      const result = await call<GitInfo>("git.commit", {
                        projectId,
                        message: commitMessage.trim(),
                      });
                      if (result) {
                        setGitInfo(result);
                        setCommitMessage("");
                        notify("Commit created in this project.");
                      }
                      setBusy(false);
                    }}
                  >
                    <GitBranch /> Commit
                  </Button>
                  <Button
                    disabled={busy || !gitInfo?.head}
                    onClick={async () => {
                      setBusy(true);
                      const result = await call<GitInfo>("git.push", projectId);
                      if (result) {
                        setGitInfo(result);
                        notify("Pushed the current branch.");
                      }
                      setBusy(false);
                    }}
                  >
                    <UploadSimple /> Push
                  </Button>
                </div>
                <Diff text={gitInfo?.diff ?? ""} />
                <h3 dir="auto" className="subheading">
                  Recent commits
                </h3>
                <pre className="git-log">
                  {gitInfo?.log ||
                    "No commits available. Create an initial commit before executing agents."}
                </pre>
                <h3 dir="auto" className="subheading">
                  Repository files
                </h3>
                <div className="file-list">
                  {gitInfo?.files.map((file) => (
                    <button
                      key={file}
                      onClick={async () => {
                        const content = await call<string>("file", {
                          projectId,
                          file,
                        });
                        if (content !== undefined)
                          setFilePreview({ name: file, content });
                      }}
                    >
                      <FileCode />
                      {file}
                      <ArrowUpRight />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : page === "Run history" ? (
          <div className="page-scroll">
            <PageHeading
              eyebrow="PERSISTENT SESSIONS"
              title="Run history"
              description="Every objective, decision, and result. Saved on this computer."
            />
            <label className="search-field">
              <MagnifyingGlass />
              <input
                dir="auto"
                placeholder="Search sessions…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {data.runs.filter((r) =>
              r.title.toLowerCase().includes(search.toLowerCase()),
            ).length ? (
              <div className="history-list">
                {data.runs
                  .filter((r) =>
                    r.title.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((r) => (
                    <article
                      className={`history-row${r.pinned ? " is-pinned" : ""}`}
                      key={r.id}
                    >
                      <button
                        className="history-open"
                        onClick={() => openRun(r)}
                      >
                        <span className="history-icon" aria-hidden="true">
                          <ChatCircleDots />
                        </span>
                        <span className="history-copy">
                          <strong dir="auto">{r.title}</strong>
                          <span className="history-meta">
                            <span>
                              {
                                data.projects.find((p) => p.id === r.projectId)
                                  ?.name
                              }
                            </span>
                            <span>
                              {new Date(r.createdAt).toLocaleDateString()}
                            </span>
                            <span>
                              {r.tasks.length}{" "}
                              {r.tasks.length === 1 ? "task" : "tasks"}
                            </span>
                          </span>
                        </span>
                        <Tag kind={r.status}>
                          <StatusDot status={r.status} />
                          {formatStatus(r.status)}
                        </Tag>
                        <CaretRight className="history-chevron" />
                      </button>
                      <div className="history-actions">
                        <button
                          onClick={() => void setPinned(r)}
                          aria-label={
                            r.pinned ? "Unpin session" : "Pin session"
                          }
                          title={r.pinned ? "Unpin session" : "Pin session"}
                        >
                          <PushPin weight={r.pinned ? "fill" : "regular"} />
                        </button>
                        <button
                          onClick={() => void deleteSession(r)}
                          disabled={["running", "initializing"].includes(
                            r.status,
                          )}
                          aria-label="Delete session"
                          title="Delete session"
                        >
                          <Trash />
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
            ) : (
              <Empty icon={<ClockCounterClockwise />} title="A clean slate">
                Start your first session. Its complete execution trace will be
                saved here.
              </Empty>
            )}
          </div>
        ) : (
          <div className="page-scroll">
            <PageHeading
              eyebrow="SUPERVISED EXECUTION"
              title="Agents & teams"
              description="Agents are created from your approved task plans. Only the roles a task needs."
            />
            <div className="team-summary">
              <div>
                <span>Active task leads</span>
                <strong dir="auto">
                  {
                    data.runs
                      .flatMap((r) => r.tasks)
                      .filter((t) => t.status === "running").length
                  }
                  <small> / {data.settings.concurrency} per run</small>
                </strong>
              </div>
              <div>
                <span>Completed tasks</span>
                <strong dir="auto">
                  {
                    data.runs
                      .flatMap((r) => r.tasks)
                      .filter((t) => t.status === "completed").length
                  }
                </strong>
              </div>
              <div>
                <span>Execution isolation</span>
                <strong dir="auto" className="summary-text">
                  Git worktrees <ShieldCheck />
                </strong>
              </div>
            </div>
            {data.runs.some((r) => r.tasks.length) ? (
              data.runs
                .filter((r) => r.tasks.length)
                .map((r) => (
                  <section className="team-run" key={r.id}>
                    <div className="team-run-title">
                      <h3 dir="auto">{r.title}</h3>
                      <button onClick={() => openRun(r)}>
                        Open session <ArrowUpRight />
                      </button>
                    </div>
                    <TaskList
                      tasks={r.tasks}
                      onSelect={(id) => {
                        openRun(r);
                        setSelectedTask(id);
                        setInspector(true);
                      }}
                    />
                    {r.tasks
                      .filter((t) => t.team)
                      .map((t) => (
                        <div key={t.id} className="team-task-activity">
                          <h4>{t.title}</h4>
                          <CodingTeamActivity
                            team={t.team!}
                            model={(t.model ?? r.config.coder).model}
                          />
                        </div>
                      ))}
                  </section>
                ))
            ) : (
              <Empty icon={<UsersThree />} title="The right team for the task">
                Approve an implementation plan to create workers with specific
                roles, scopes, and acceptance criteria.
              </Empty>
            )}
          </div>
        )}
      </main>
      {inspector && (
        <aside className="inspector">
          <div className="inspector-heading">
            <span>{task ? "Agent inspector" : "Workspace inspector"}</span>
            <button
              className="icon-button"
              aria-label="Close inspector"
              onClick={() => setInspector(false)}
            >
              <X size={15} />
            </button>
          </div>
          <div className="inspector-scroll">
            {task && run ? (
              <>
                <div className="agent-profile">
                  <span className="agent-avatar">
                    <Cpu size={24} />
                  </span>
                  <h3 dir="auto">{task.title}</h3>
                  <span>{task.role}</span>
                  <Tag kind={task.status}>
                    <StatusDot status={task.status} />
                    {formatStatus(task.status)}
                  </Tag>
                </div>
                <InspectorGroup title="ASSIGNMENT">
                  <Info label="Task ID" value={task.id} />
                  <Info
                    label="Provider"
                    value={(task.model ?? run.config.coder).provider}
                  />
                  <Info
                    label="Model"
                    value={
                      (task.model ?? run.config.coder).model ||
                      "Runtime default"
                    }
                  />
                  <Info
                    label="Attempts"
                    value={`${task.attempts} / ${run.config.retries + 1}`}
                  />
                  <Info
                    label="Dependencies"
                    value={task.dependencies.join(", ") || "None"}
                  />
                  {run.status === "awaiting_approval" && (
                    <label className="task-model-override">
                      Task model override
                      <input
                        dir="auto"
                        key={task.id}
                        defaultValue={task.model?.model ?? ""}
                        placeholder="Use global coding model"
                        onBlur={async (e) => {
                          await call("task.configure", {
                            runId: run.id,
                            taskId: task.id,
                            model: e.target.value
                              ? { ...run.config.coder, model: e.target.value }
                              : undefined,
                          });
                          await refresh();
                        }}
                      />
                    </label>
                  )}
                </InspectorGroup>
                {task.team && (
                  <InspectorGroup title="CODING TEAM">
                    <CodingTeamActivity
                      team={task.team}
                      model={(task.model ?? run.config.coder).model}
                    />
                  </InspectorGroup>
                )}
                <InspectorGroup title="FILE OWNERSHIP">
                  {!task.files.length && (
                    <p dir="auto" className="inspector-note">
                      Read-only task. No file writes permitted.
                    </p>
                  )}
                  {task.files.map((f) => (
                    <div className="inspector-file" key={f}>
                      <FileCode size={14} />
                      <code>{f}</code>
                    </div>
                  ))}
                </InspectorGroup>
                <InspectorGroup title="ACCEPTANCE CRITERIA">
                  {task.acceptance.map((a, i) => (
                    <div className="acceptance-item" key={i}>
                      <Circle size={11} />
                      <span dir="auto">{a}</span>
                    </div>
                  ))}
                </InspectorGroup>
                <InspectorGroup title="VERIFICATION">
                  <Info label="Command" value={task.verification} />
                  {task.tests?.map((t, i) => (
                    <Tag
                      key={i}
                      kind={t.exitCode === 0 ? "completed" : "failed"}
                    >
                      Exit {t.exitCode} · {(t.durationMs / 1000).toFixed(1)}s
                    </Tag>
                  ))}
                  {task.reason && (
                    <p dir="auto" className="inspector-note">
                      {task.reason}
                    </p>
                  )}
                </InspectorGroup>
                {task.snapshot && (
                  <InspectorGroup title="EFFECTIVE INSTRUCTIONS">
                    <Info
                      label="Tokens"
                      value={`~${task.snapshot.estimatedTokens.toLocaleString()}`}
                    />
                    <button
                      className="text-action"
                      onClick={() =>
                        setFilePreview({
                          name: `${task.id} · Prompt snapshot`,
                          content: task.snapshot!.text,
                        })
                      }
                    >
                      <Eye />
                      Inspect compiled prompt
                    </button>
                    <code className="hash">
                      SHA256 {task.snapshot.hash.slice(0, 20)}
                    </code>
                  </InspectorGroup>
                )}
                {task.output && (
                  <InspectorGroup title="WORKER RESULT">
                    <p dir="auto" className="inspector-note">
                      {task.output}
                    </p>
                  </InspectorGroup>
                )}
              </>
            ) : (
              <>
                <div className="inspector-intro">
                  <span className="inspector-orbit">
                    <AsteriskSimple size={29} weight="bold" />
                  </span>
                  <h3 dir="auto">
                    A little structure.
                    <br />A lot of possibility.
                  </h3>
                  <p dir="auto">
                    Give your agents a clear objective.
                    <br />
                    Stay close to every decision.
                  </p>
                </div>
                <InspectorGroup title="WORKSPACE">
                  <Info
                    label="Project"
                    value={project?.name ?? "Not selected"}
                  />
                  <Info label="Execution" value="On this computer" />
                  <Info label="Sessions" value={String(projectRuns.length)} />
                  <Info label="Active runs" value={String(activeRuns.length)} />
                </InspectorGroup>
                <InspectorGroup title="YOUR ENGINEERING LOOP">
                  <ol className="engineering-loop">
                    {[
                      {
                        title: "Understand & plan",
                        text: "Repository evidence, clear acceptance criteria.",
                      },
                      {
                        title: "Delegate & execute",
                        text: "Focused agents, isolated changes.",
                      },
                      {
                        title: "Verify & review",
                        text: "Real test results and a reviewable diff.",
                      },
                      {
                        title: "Approve & integrate",
                        text: "You decide what reaches your code.",
                      },
                    ].map((s, i) => (
                      <li key={s.title}>
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <div>
                          <strong dir="auto">{s.title}</strong>
                          <p dir="auto">{s.text}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </InspectorGroup>
                <div className="permission-note">
                  <ShieldCheck size={18} />
                  <div>
                    <strong dir="auto">Built around your control</strong>
                    <p dir="auto">
                      Plans and final changes need your approval. Providers run
                      within their configured sandbox.
                    </p>
                  </div>
                </div>
                <button
                  className="inspector-link"
                  onClick={() => setPage("Settings")}
                >
                  Manage providers & permissions <ArrowUpRight />
                </button>
              </>
            )}
          </div>
        </aside>
      )}
      <footer className="statusbar">
        <span>
          <GitBranch size={12} />
          {project?.name ?? "No project selected"}
        </span>
        <span>
          <ShieldCheck size={12} /> Isolated execution
        </span>
        <span className="statusbar-right">
          {
            data.runs.filter((r) =>
              ["running", "initializing"].includes(r.status),
            ).length
          }{" "}
          active runs <span>·</span> Aether Code v0.1.9{" "}
          <AsteriskSimple size={12} />
        </span>
      </footer>
      {showSplash && (
        <SplashScreen
          onStart={() => {
            localStorage.setItem("aether.welcome.v2", "seen");
            setShowSplash(false);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <WarningCircle size={19} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X />
          </button>
        </div>
      )}
      {filePreview && (
        <div
          className="modal-backdrop"
          onClick={() => setFilePreview(undefined)}
        >
          <section
            className="file-modal"
            role="dialog"
            aria-modal="true"
            aria-label={filePreview.name}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <FileCode />
              <strong dir="auto">{filePreview.name}</strong>
              <button
                autoFocus
                aria-label="Close preview"
                onClick={() => setFilePreview(undefined)}
              >
                <X />
              </button>
            </header>
            <pre>{filePreview.content}</pre>
          </section>
        </div>
      )}
    </div>
  );
}
function CodeIcon() {
  return <TerminalWindow size={15} />;
}
function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1 dir="auto">{title}</h1>
        <p dir="auto">{description}</p>
      </div>
      {action}
    </div>
  );
}
function InspectorGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="inspector-group">
      <h4>{title}</h4>
      {children}
    </section>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong dir="auto" title={value}>
        {value}
      </strong>
    </div>
  );
}
function TaskList({
  tasks,
  selected,
  onSelect,
  expanded = false,
}: {
  tasks: Task[];
  selected?: string;
  onSelect: (id: string) => void;
  expanded?: boolean;
}) {
  return (
    <div className={"task-list " + (expanded ? "expanded" : "")}>
      {tasks.map((task, i) => (
        <button
          className={"task-row " + (selected === task.id ? "selected" : "")}
          key={task.id}
          onClick={() => onSelect(task.id)}
        >
          <span className={"task-number " + task.status}>
            {task.status === "completed" ? (
              <Check />
            ) : task.status === "running" ? (
              <CircleNotch className="spin" />
            ) : (
              String(i + 1).padStart(2, "0")
            )}
          </span>
          <span className="task-text">
            <strong dir="auto">{task.title}</strong>
            <small>
              {task.role} <span>·</span>{" "}
              {task.dependencies.length
                ? `After ${task.dependencies.join(", ")}`
                : "Independent task"}
            </small>
            {expanded && (
              <>
                <p dir="auto">{task.objective}</p>
                <code>
                  {task.files.length
                    ? task.files.join(" · ")
                    : "Read-only · no file writes"}
                </code>
              </>
            )}
          </span>
          <Tag kind={task.status}>{formatStatus(task.status)}</Tag>
          <CaretRight size={13} />
        </button>
      ))}
    </div>
  );
}
function Diff({ text }: { text: string }) {
  if (!text)
    return (
      <div className="diff-empty">
        <GitBranch />
        <span>No diff to display yet.</span>
      </div>
    );
  return (
    <div className="diff-view">
      {text.split("\n").map((line, i) => (
        <div
          key={i}
          className={
            line.startsWith("+") && !line.startsWith("+++")
              ? "add"
              : line.startsWith("-") && !line.startsWith("---")
                ? "remove"
                : line.startsWith("@@")
                  ? "hunk"
                  : line.startsWith("diff ") ||
                      line.startsWith("+++") ||
                      line.startsWith("---")
                    ? "diff-header"
                    : ""
          }
        >
          <span>{i + 1}</span>
          <code>{line || " "}</code>
        </div>
      ))}
    </div>
  );
}
function Activity({
  events,
  compact = false,
}: {
  events: RunEvent[];
  compact?: boolean;
}) {
  return (
    <div className={"activity " + (compact ? "compact" : "")}>
      {compact && <div className="section-label">LATEST ACTIVITY</div>}
      {events.length ? (
        events.map((event) => (
          <div className="event-row" key={event.seq}>
            <time>{relativeTime(event.at)}</time>
            <span className={"event-type " + event.type.replaceAll(".", "-")}>
              {event.type}
            </span>
            {event.taskId && <Tag>{event.taskId}</Tag>}
            <pre className="prose-output" dir="auto">
              {event.text}
            </pre>
          </div>
        ))
      ) : (
        <p dir="auto" className="muted">
          No execution events yet.
        </p>
      )}
    </div>
  );
}
type Call = <T = unknown>(
  command: string,
  payload?: unknown,
) => Promise<T | undefined>;
function SettingsPage({
  data,
  save,
  call,
  refresh,
  notify,
}: {
  data: Snapshot;
  save: (s: Settings) => Promise<void>;
  call: Call;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [draft, setDraft] = useState(data.settings),
    [key, setKey] = useState(""),
    [checking, setChecking] = useState(false),
    [connectionBusy, setConnectionBusy] = useState<ProviderId>();
  useEffect(() => setDraft(data.settings), [data.settings]);
  return (
    <div className="page-scroll">
      <PageHeading
        eyebrow="CONFIGURATION"
        title="Your workspace, your rules."
        description="Connect runtimes, choose models, and set execution boundaries."
        action={
          <Button
            variant="primary"
            onClick={async () => {
              await save(draft);
              notify("Settings saved locally.");
            }}
          >
            Save settings <Check />
          </Button>
        }
      />
      <section className="settings-section">
        <div className="settings-section-title">
          <h2 dir="auto">Provider connections</h2>
          <Button
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              await call("diagnostics");
              await refresh();
              setChecking(false);
            }}
          >
            <ArrowsClockwise className={checking ? "spin" : ""} />
            Run diagnostics
          </Button>
        </div>
        <div className="provider-list">
          {data.providers.map((p) => (
            <div className="provider-card" key={p.id}>
              <span className={"provider-icon " + p.id}>
                {p.id === "codex" ? <AsteriskSimple weight="bold" /> : <Cpu />}
              </span>
              <div>
                <h3 dir="auto">
                  {p.name}
                  <Tag kind={p.installed ? "completed" : ""}>
                    {p.connection?.state === "blocked"
                      ? "Account blocked"
                      : p.connection?.state === "awaiting-signin"
                        ? "Finish sign-in"
                        : p.authenticated === true
                          ? "Connected"
                          : p.installed
                            ? "Detected"
                            : "Unavailable"}
                  </Tag>
                </h3>
                <p dir="auto">{p.detail}</p>
                <div className="provider-capabilities">
                  <span>{p.kind.replaceAll("-", " ")}</span>
                  {p.version && <span>{p.version}</span>}
                  <span>
                    {p.capabilities.coding
                      ? "Sandboxed coding"
                      : "Planning / diagnostics"}
                  </span>
                </div>
                {(p.id === "codex" || p.id === "antigravity") && (
                  <div className="connection-actions">
                    <Button
                      disabled={!p.installed || !!connectionBusy}
                      onClick={async () => {
                        setConnectionBusy(p.id);
                        const result = await call<ConnectionStatus>(
                          "provider.connect",
                          p.id,
                        );
                        await refresh();
                        if (result) notify(result.message);
                        setConnectionBusy(undefined);
                      }}
                    >
                      <ArrowUpRight />
                      {p.id === "codex"
                        ? "Sign in with ChatGPT"
                        : "Sign in with Google"}
                    </Button>
                    <Button
                      disabled={!p.installed || !!connectionBusy}
                      title={
                        p.id === "antigravity"
                          ? "Verifies account access using a small model request."
                          : "Checks the official CLI login status."
                      }
                      onClick={async () => {
                        setConnectionBusy(p.id);
                        const result = await call<ConnectionStatus>(
                          "provider.verify",
                          p.id,
                        );
                        await refresh();
                        if (result) notify(result.message);
                        setConnectionBusy(undefined);
                      }}
                    >
                      {connectionBusy === p.id ? (
                        <CircleNotch className="spin" />
                      ) : (
                        <ShieldCheck />
                      )}
                      Verify connection
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <p dir="auto" className="muted connection-help">
          Sign-in opens the official CLI in Terminal and its browser OAuth flow.
          Finish onboarding, close that terminal, then verify here. Existing
          Codex sessions are reused. Antigravity verification uses a small model
          request; a model catalog alone does not prove account access.
        </p>
      </section>
      <section className="settings-section">
        <h2 dir="auto">Independent model selection</h2>
        <p dir="auto" className="muted">
          Use installed CLI authentication. Leave a CLI model ID empty to use
          its runtime default. Access is checked on execution.
        </p>
        <div className="model-settings-grid">
          {(["planner", "coder"] as const).map((role) => (
            <div className="model-settings" key={role}>
              <h3 dir="auto">
                {role === "planner" ? <TreeStructure /> : <TerminalWindow />}
                {role === "planner"
                  ? "Planner / Supervisor"
                  : "Coding / Implementation"}
              </h3>
              <label>
                Provider
                <select
                  value={draft[role].provider}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [role]: {
                        ...draft[role],
                        provider: e.target.value as ProviderId,
                      },
                    })
                  }
                >
                  {["codex", "claude", "antigravity", "compatible"].map(
                    (id) => (
                      <option key={id} value={id}>
                        {data.providers.find((p) => p.id === id)?.name ?? id}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Model identifier
                <input
                  dir="auto"
                  value={draft[role].model}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [role]: { ...draft[role], model: e.target.value },
                    })
                  }
                  placeholder="Runtime default"
                />
              </label>
              <label>
                Reasoning effort
                <select
                  value={draft[role].reasoning}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [role]: { ...draft[role], reasoning: e.target.value },
                    })
                  }
                >
                  {["low", "medium", "high"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Role instructions
                <textarea
                  dir="auto"
                  value={draft[role].instructions}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [role]: { ...draft[role], instructions: e.target.value },
                    })
                  }
                  placeholder="Additional instructions for this role…"
                />
              </label>
            </div>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <h2>Coding teams (Codex)</h2>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={draft.codingTeam.enabled}
            onChange={(e) =>
              setDraft({
                ...draft,
                codingTeam: { ...draft.codingTeam, enabled: e.target.checked },
              })
            }
          />
          Let coding task leads delegate reviews and integrate helper findings
        </label>
        <div className="form-grid">
          <label>
            Concurrent helpers per task lead
            <select
              disabled={!draft.codingTeam.enabled}
              value={draft.codingTeam.maxHelpers}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  codingTeam: {
                    ...draft.codingTeam,
                    maxHelpers: Number(e.target.value),
                  },
                })
              }
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="inspector-note">
          Applies to new plans. Helpers use the selected coding model in
          read-only sessions. Aether sends their findings back to the coding
          lead for integration and waits for every session to finish. More
          helpers consume extra model usage.
        </p>
        <p className="inspector-note">
          With these settings, up to{" "}
          {draft.concurrency *
            (draft.codingTeam.enabled ? draft.codingTeam.maxHelpers : 1)}{" "}
          agents can run per session. Planning and final review stay
          single-agent.
        </p>
      </section>
      <section className="settings-section">
        <h2 dir="auto">Execution limits</h2>
        <div className="form-grid">
          <label>
            Parallel task leads
            <input
              dir="auto"
              type="number"
              min={1}
              max={4}
              value={draft.concurrency}
              onChange={(e) =>
                setDraft({ ...draft, concurrency: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Task timeout (seconds)
            <input
              dir="auto"
              type="number"
              min={15}
              max={3600}
              value={draft.timeoutSeconds}
              onChange={(e) =>
                setDraft({ ...draft, timeoutSeconds: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Retries per task
            <input
              dir="auto"
              type="number"
              min={0}
              max={3}
              value={draft.retries}
              onChange={(e) =>
                setDraft({ ...draft, retries: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <div className="notice">
          <ShieldCheck />
          <p dir="auto">
            Codex uses its workspace-write sandbox with network access disabled.
            Verification commands execute project code on this computer after
            plan approval. Git worktrees isolate changes; they are not an
            operating system sandbox. No deployment or publication tools are
            exposed.
          </p>
        </div>
      </section>
      <section className="settings-section">
        <h2 dir="auto">Compatible API</h2>
        <p dir="auto" className="muted">
          Optional local or remote OpenAI-compatible endpoint. Planning and
          review only.
        </p>
        <label>
          API base URL
          <input
            dir="auto"
            value={draft.apiUrl}
            onChange={(e) => setDraft({ ...draft, apiUrl: e.target.value })}
          />
        </label>
        <div className="secret-row">
          <label>
            API key
            <input
              dir="auto"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Stored using OS encryption"
            />
          </label>
          <Button
            onClick={async () => {
              if (await call("secret.save", key)) {
                setKey("");
                notify("API credential encrypted with OS secret storage.");
              }
            }}
          >
            Store securely <ShieldCheck />
          </Button>
        </div>
      </section>
      <section className="settings-section appearance">
        <div>
          <h2 dir="auto">Appearance</h2>
          <p dir="auto" className="muted">
            A focused workspace, in either light.
          </p>
        </div>
        <Button
          onClick={async () => {
            const next: Settings = {
              ...draft,
              theme: draft.theme === "dark" ? "light" : "dark",
            };
            setDraft(next);
            await save(next);
            notify(
              `${next.theme === "light" ? "Light" : "Dark"} mode enabled.`,
            );
          }}
        >
          {draft.theme === "dark" ? <Moon /> : <Sun />}
          {draft.theme === "dark" ? "Dark" : "Light"}
        </Button>
        <label className="theme-json">
          Theme JSON overrides
          <textarea
            dir="ltr"
            value={draft.themeJson}
            onChange={(event) =>
              setDraft({ ...draft, themeJson: event.target.value })
            }
            placeholder={'{ "--accent": "#5f7cff", "--bg": "#10131a" }'}
          />
          <small>Optional hex color overrides. Save settings to apply.</small>
        </label>
      </section>
    </div>
  );
}
function PromptLab({
  data,
  call,
  refresh,
  notify,
}: {
  data: Snapshot;
  call: Call;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [name, setName] = useState("Engineering standards"),
    [content, setContent] = useState(
      "Define explicit acceptance criteria. Keep changes within the assigned file scope. Run the relevant verification and report actual test evidence. Never disclose secrets.",
    ),
    [preview, setPreview] = useState<CompiledPrompt>(),
    [coreInfo, setCoreInfo] = useState<PromptCoreInfo>(),
    [previewRole, setPreviewRole] = useState("implementer"),
    [evaluation, setEvaluation] = useState<unknown>(),
    [compare, setCompare] = useState<PromptVersion>(),
    [variables, setVariables] = useState(
      '{"project_name":"project","role":"implementer"}',
    );
  return (
    <div className="page-scroll">
      <PageHeading
        eyebrow="COMPOSABLE INSTRUCTIONS"
        title="Prompt laboratory"
        description="Version your instructions. Inspect what every agent actually receives."
        action={
          <Button
            variant="primary"
            onClick={async () => {
              if (await call("prompt.save", { name, content })) {
                await refresh();
                notify("New prompt version saved and activated.");
              }
            }}
          >
            <Plus />
            Save new version
          </Button>
        }
      />
      <section className="settings-section">
        <div>
          <h2 dir="auto">Nexload prompt core</h2>
          <p dir="auto" className="muted">
            Shared reasoning constitution with focused agent profiles. Your
            fragments extend this core within Aether’s execution boundaries.
          </p>
        </div>
        <Button
          onClick={async () =>
            setCoreInfo(await call<PromptCoreInfo>("prompt.core"))
          }
        >
          <Eye />
          Inspect core
        </Button>
      </section>
      {coreInfo && (
        <section className="compiled-preview" aria-label="Nexload core sources">
          <h2 dir="auto">Pinned reasoning source</h2>
          <p dir="auto">
            {coreInfo.repository} · {coreInfo.revision.slice(0, 12)} ·{" "}
            {coreInfo.adaptation}
          </p>
          <details>
            <summary>Shared constitution and runtime binding</summary>
            <pre>
              {coreInfo.kernel}
              {"\n\n"}
              {coreInfo.binding}
            </pre>
          </details>
          {coreInfo.profiles.map((profile) => (
            <details key={profile.id}>
              <summary>
                {profile.label} · {profile.skill}
              </summary>
              <pre>{profile.instructions}</pre>
            </details>
          ))}
          <details>
            <summary>Source manifest ({coreInfo.files.length} files)</summary>
            <pre>
              {coreInfo.files
                .map((file) => `${file.path}\nSHA256 ${file.sha256}`)
                .join("\n\n")}
            </pre>
          </details>
        </section>
      )}
      <div className="lab-grid">
        <section className="prompt-editor">
          <label>
            Fragment name
            <input
              dir="auto"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="editor-label">
            <span>INSTRUCTIONS / MARKDOWN</span>
            <span>{content.length.toLocaleString()} characters</span>
          </div>
          <textarea
            dir="auto"
            className="code-editor"
            aria-label="Prompt instructions"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <label>
            Preview agent role
            <select
              value={previewRole}
              onChange={(e) => setPreviewRole(e.target.value)}
            >
              {[
                "planner",
                "architect",
                "implementer",
                "test-engineer",
                "reviewer",
                "debugger",
                "integration",
                "documentation",
              ].map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <label className="prompt-variables">
            Preview variables (JSON object)
            <input
              dir="auto"
              value={variables}
              onChange={(e) => setVariables(e.target.value)}
            />
          </label>
          <div className="editor-toolbar">
            <Button
              onClick={async () => {
                try {
                  setPreview(
                    await call<CompiledPrompt>("prompt.preview", {
                      content,
                      role: previewRole,
                      variables: JSON.parse(variables),
                    }),
                  );
                } catch {
                  notify(
                    "Preview variables must be a JSON object with string values.",
                  );
                }
              }}
            >
              <Eye />
              Compile preview
            </Button>
            <Button
              onClick={async () => {
                const result = await call("prompt.evaluate", {
                  a: compare?.content ?? content,
                  b: content,
                });
                setEvaluation(result);
              }}
            >
              <Flask />
              Compare static checks
            </Button>
            <Button
              title="Export Markdown fragment"
              onClick={() =>
                void call("export", {
                  name: name.replace(/[^\w-]/g, "-") + ".md",
                  content,
                })
              }
            >
              <DownloadSimple />
            </Button>
          </div>
        </section>
        <section className="version-panel">
          <div className="section-label">
            VERSION HISTORY <span>{data.prompts.length}</span>
          </div>
          {data.prompts.length ? (
            data.prompts.map((p) => (
              <div className="version-row" key={p.id}>
                <button
                  onClick={() => {
                    setName(p.name);
                    setContent(p.content);
                    setCompare(p);
                  }}
                >
                  <strong dir="auto">{p.name}</strong>
                  <small>
                    v{p.version} · {new Date(p.createdAt).toLocaleDateString()}
                  </small>
                </button>
                {p.active ? (
                  <Tag kind="completed">Active</Tag>
                ) : (
                  <button
                    className="text-action"
                    onClick={async () => {
                      await call("prompt.activate", p.id);
                      await refresh();
                    }}
                  >
                    Activate
                  </button>
                )}
              </div>
            ))
          ) : (
            <p dir="auto" className="muted small-text">
              Save your first version. Rollback creates no silent rewrites:
              activate the version you choose.
            </p>
          )}
        </section>
      </div>
      {preview && (
        <section className="compiled-preview">
          <div className="section-intro">
            <h2 dir="auto">Compiled instructions</h2>
            <p dir="auto">
              {preview.core &&
                `Nexload · ${preview.core.profile} · ${preview.core.revision.slice(0, 12)} · `}
              ~{preview.estimatedTokens} estimated tokens · SHA256{" "}
              {preview.hash.slice(0, 16)}
            </p>
          </div>
          <div className="trace-list">
            {preview.trace.map((t) => (
              <div key={t.id}>
                <Tag>{t.level}</Tag>
                <strong dir="auto">{t.label}</strong>
                <span>{t.reason}</span>
              </div>
            ))}
          </div>
          <pre>{preview.text}</pre>
        </section>
      )}
      {compare && (
        <details className="prompt-snapshot">
          <summary>
            <Eye />
            Compare selected v{compare.version} with draft
          </summary>
          <div className="prompt-comparison">
            <pre>{compare.content}</pre>
            <pre>{content}</pre>
          </div>
        </details>
      )}
      {!!evaluation && (
        <div className="compiled-preview">
          <h3 dir="auto">Static A/B inspection</h3>
          <p dir="auto" className="muted">
            Checks prompt wording and estimated size. No model benchmark or
            task-completion score is implied.
          </p>
          <pre>{JSON.stringify(evaluation, null, 2)}</pre>
        </div>
      )}
      <div className="notice">
        <ShieldCheck />
        <p dir="auto">
          Platform invariants always take precedence. Repository text, imported
          skills, and memories are delimited as untrusted context. Prompt
          controls supplement the runtime sandbox; they do not replace it.
        </p>
      </div>
    </div>
  );
}
const skillTemplate =
  "---\nname: focused-verification\ndescription: Verify a focused change using repository evidence.\n---\n\n## Procedure\n1. Identify the acceptance criteria and changed files.\n2. Select the smallest relevant existing verification command.\n3. Record actual output and exit status.\n4. Report limitations and unverified criteria.\n";
function SkillsPage({
  project,
  data,
  call,
  refresh,
}: {
  data: Snapshot;
  project?: Project;
  call: Call;
  refresh: () => Promise<void>;
}) {
  const [editor, setEditor] = useState(false),
    [content, setContent] = useState(skillTemplate),
    [reviewed, setReviewed] = useState(false),
    [roles, setRoles] = useState("implementer,test-engineer"),
    [query, setQuery] = useState("");
  return (
    <div className="page-scroll">
      <PageHeading
        eyebrow="REUSABLE PROCEDURES"
        title="Skills library"
        description="Small, purposeful workflows. Reviewed by you, used by your agents."
        action={
          <div className="heading-actions">
            <Button
              onClick={async () => {
                const text = await call<string>("skill.import");
                if (text) {
                  setContent(text);
                  setReviewed(false);
                  setEditor(true);
                }
              }}
            >
              <UploadSimple />
              Import skill
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setContent(skillTemplate);
                setReviewed(false);
                setEditor(true);
              }}
            >
              <Plus />
              Create skill
            </Button>
          </div>
        }
      />
      <SkillDiscovery
        project={project}
        call={call}
        refresh={refresh}
        installed={data.skills}
      />
      <label className="search-field">
        <MagnifyingGlass />
        <input
          dir="auto"
          placeholder="Search your skills…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {editor && (
        <section className="skill-editor">
          <div className="settings-section-title">
            <h2 dir="auto">Review skill instructions</h2>
            <button
              className="icon-button"
              aria-label="Close skill editor"
              onClick={() => setEditor(false)}
            >
              <X />
            </button>
          </div>
          <textarea
            dir="auto"
            className="code-editor"
            aria-label="Skill Markdown"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setReviewed(false);
            }}
          />
          <label>
            Assign to roles (comma-separated; * for all)
            <input
              dir="auto"
              value={roles}
              onChange={(e) => setRoles(e.target.value)}
            />
          </label>
          <label className="checkbox-label">
            <input
              dir="auto"
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            I reviewed these instructions. They may be enabled within existing
            permissions.
          </label>
          <Button
            variant="primary"
            onClick={async () => {
              const result = await call<Skill>("skill.save", {
                content,
                reviewed,
                roles: roles
                  .split(",")
                  .map((r) => r.trim())
                  .filter(Boolean),
              });
              if (result) {
                await refresh();
                setEditor(false);
              }
            }}
          >
            <Check />
            Validate & save version
          </Button>
        </section>
      )}
      <div className="skills-grid">
        {data.skills
          .filter((s) => !s.projectId || s.projectId === project?.id)
          .filter((s) =>
            (s.name + " " + s.description)
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((s) => (
            <section className="skill-card" key={s.id}>
              <div className="skill-card-top">
                <Books size={20} />
                <Tag kind={s.enabled ? "completed" : ""}>
                  {s.enabled
                    ? "Enabled"
                    : s.reviewed
                      ? "Reviewed"
                      : "Needs review"}
                </Tag>
              </div>
              <h3 dir="auto">{s.name}</h3>
              <p dir="auto">{s.description}</p>
              <div className="skill-roles">
                {s.roles.map((r) => (
                  <Tag key={r}>{r}</Tag>
                ))}
              </div>
              <div className="skill-card-footer">
                <span>
                  {s.projectId ? "Project · " : ""}v{s.version}
                </span>
                <button
                  disabled={!!s.projectId}
                  onClick={() => {
                    setContent(s.content);
                    setReviewed(false);
                    setRoles(s.roles.join(","));
                    setEditor(true);
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() =>
                    void call("export", {
                      name: s.name + ".md",
                      content: s.content,
                    })
                  }
                  aria-label={"Export " + s.name}
                >
                  <DownloadSimple />
                </button>
                <button
                  className={s.enabled ? "toggle on" : "toggle"}
                  aria-label={(s.enabled ? "Disable " : "Enable ") + s.name}
                  onClick={async () => {
                    await call("skill.toggle", s.id);
                    await refresh();
                  }}
                >
                  <span />
                </button>
              </div>
            </section>
          ))}
      </div>
      {!data.skills.length && !editor && (
        <Empty icon={<Books />} title="Build a library of good habits">
          Create a skill or import a Markdown SKILL.md. Imported instructions
          stay disabled until reviewed and explicitly enabled.
        </Empty>
      )}
    </div>
  );
}
function MemoryPage({
  data,
  project,
  call,
  refresh,
}: {
  data: Snapshot;
  project?: Project;
  call: Call;
  refresh: () => Promise<void>;
}) {
  const [content, setContent] = useState(""),
    [kind, setKind] = useState("hypothesis");
  return (
    <div className="page-scroll">
      <PageHeading
        eyebrow="PROJECT KNOWLEDGE"
        title="Memory, with provenance."
        description="Keep useful decisions close. Separate verified facts from working hypotheses."
      />
      {project ? (
        <>
          <section className="memory-editor">
            <label>
              Project note
              <textarea
                dir="auto"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="A convention, architectural decision, or something worth investigating…"
              />
            </label>
            <div className="editor-toolbar">
              <select
                aria-label="Memory classification"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="hypothesis">Hypothesis</option>
                <option value="verified">Verified by you</option>
                <option value="outdated">Outdated</option>
              </select>
              <Button
                variant="primary"
                disabled={!content.trim()}
                onClick={async () => {
                  if (
                    await call("memory.save", {
                      projectId: project.id,
                      content,
                      kind,
                    })
                  ) {
                    setContent("");
                    await refresh();
                  }
                }}
              >
                <Plus />
                Save memory
              </Button>
            </div>
          </section>
          <div className="memory-list">
            {data.memories
              .filter((m) => m.projectId === project.id)
              .map((m) => (
                <article key={m.id}>
                  <div>
                    <Tag kind={m.kind === "verified" ? "completed" : ""}>
                      {m.kind}
                    </Tag>
                    <time>{new Date(m.createdAt).toLocaleDateString()}</time>
                    <button
                      className="icon-button"
                      aria-label="Delete memory"
                      onClick={async () => {
                        await call("memory.delete", m.id);
                        await refresh();
                      }}
                    >
                      <Trash />
                    </button>
                  </div>
                  <p dir="auto">{m.content}</p>
                </article>
              ))}
          </div>
          <div className="notice">
            <Brain />
            <p dir="auto">
              Only notes explicitly marked “Verified by you” enter future
              project prompts. Memory cannot expand an agent’s permissions.
              Delete a note here to remove it from future context.
            </p>
          </div>
        </>
      ) : (
        <Empty icon={<FolderOpen />} title="Knowledge belongs to a project">
          Open a local project to save and inspect its memory.
        </Empty>
      )}
    </div>
  );
}
