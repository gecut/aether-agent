import { useEffect, useRef, useState } from "react";
import { Code } from "@phosphor-icons/react/dist/csr/Code";
import { FolderOpen } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { TerminalWindow } from "@phosphor-icons/react/dist/csr/TerminalWindow";
import { IDE } from "./IDE";
import { AgentPanel } from "./AgentPanel";
import type {
  IDERuntimeStatus,
  Project,
  Settings,
  ProviderInfo,
} from "../shared/types";
type Call = <T = unknown>(
  command: string,
  payload?: unknown,
) => Promise<T | undefined>;
export function IDEWorkspace({
  project,
  settings,
  providers,
  call,
  refresh,
  notify,
  onDirtyChange,
  onPlan,
  onOpenProject,
}: {
  project?: Project;
  settings: Settings;
  providers: ProviderInfo[];
  call: Call;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onPlan: (objective: string) => void;
  onOpenProject: () => void;
}) {
  const [mode, setMode] = useState<"workbench" | "quick">("workbench"),
    [status, setStatus] = useState<IDERuntimeStatus>(),
    [busy, setBusy] = useState(false),
    [opened, setOpened] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const dirty = useRef(false);
  const installed = ["ready", "starting", "running"].includes(
    status?.state ?? "",
  );
  const changeMode = (next: "workbench" | "quick") => {
    if (next === mode) return;
    if (
      dirty.current &&
      !window.confirm("Discard unsaved editor changes and leave this file?")
    )
      return;
    dirty.current = false;
    onDirtyChange(false);
    setMode(next);
  };
  const bounds = () => {
    const rect = host.current!.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  };
  const start = async () => {
    if (!project || !host.current) return;
    const id = ++generation.current;
    setBusy(true);
    const result = await call<boolean>("ide.view.open", {
      projectId: project.id,
      bounds: bounds(),
    });
    if (id === generation.current) {
      setOpened(!!result);
      setBusy(false);
    }
  };
  useEffect(() => {
    let live = true;
    const load = async () => {
      const value = await call<IDERuntimeStatus>("ide.runtime.status");
      if (live && value) setStatus(value);
    };
    void load();
    const timer = setInterval(() => void load(), 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [call]);
  useEffect(() => {
    setOpened(false);
    if (mode === "workbench" && installed) void start();
    return () => {
      generation.current++;
      onDirtyChange(false);
      void call("ide.view.hide");
    };
  }, [project?.id, mode, installed]);
  useEffect(() => {
    if (!host.current || mode !== "workbench") return;
    const place = () => {
      if (host.current && opened) void call("ide.view.bounds", bounds());
    };
    const observer = new ResizeObserver(place);
    observer.observe(host.current);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [mode, opened]);
  if (!project)
    return (
      <div className="ide-empty">
        <FolderOpen />
        <h1>Your project, ready to build.</h1>
        <p>
          Open a folder to edit files, use the terminal, install extensions, and
          work with Ava.
        </p>
        <button className="button primary" onClick={onOpenProject}>
          Open project folder
        </button>
      </div>
    );
  const installing =
    status && ["downloading", "verifying", "installing"].includes(status.state);
  return (
    <div className={`ide-workspace ${chatOpen ? "" : "chat-collapsed"}`}>
      <section className="ide-workbench-panel">
        <div className="ide-modebar">
          <button
            className={mode === "workbench" ? "active" : ""}
            onClick={() => changeMode("workbench")}
          >
            <Code />
            Full IDE
          </button>
          <button
            className={mode === "quick" ? "active" : ""}
            onClick={() => changeMode("quick")}
          >
            Quick editor
          </button>
          <span>Code · Extensions · Terminal</span>
          <button
            title={chatOpen ? "Hide agent chat" : "Show agent chat"}
            aria-label={chatOpen ? "Hide agent chat" : "Show agent chat"}
            onClick={() => setChatOpen(!chatOpen)}
          >
            Ava {chatOpen ? "›" : "‹"}
          </button>
        </div>
        {mode === "quick" ? (
          <IDE
            project={project}
            call={call}
            notify={notify}
            theme={settings.theme}
            onDirtyChange={(value) => {
              dirty.current = value;
              onDirtyChange(value);
            }}
          />
        ) : (
          <div
            ref={host}
            className="native-ide-host"
            aria-label="VS Code workbench host"
          >
            {!opened && (
              <div className="ide-runtime-setup">
                <span>
                  <Code />
                  <TerminalWindow />
                </span>
                <h1>
                  {busy
                    ? "Opening your IDE…"
                    : installing
                      ? "Preparing your IDE"
                      : "Your full coding workspace."}
                </h1>
                <p>
                  A real Code-OSS workbench: Explorer, Git, an interactive
                  terminal, debugging, and an extension host. Ava stays beside
                  your code.
                </p>
                {status?.error && <p role="alert">{status.error}</p>}
                {installing ? (
                  <>
                    <progress value={status.progress} max={100} />
                    <small>
                      {status.state} · {status.progress}%
                    </small>
                  </>
                ) : (
                  !busy && (
                    <button
                      className="button primary"
                      disabled={status?.supported === false}
                      onClick={async () => {
                        if (installed) {
                          await start();
                          return;
                        }
                        setBusy(true);
                        const result = await call<IDERuntimeStatus>(
                          "ide.runtime.install",
                        );
                        if (result) setStatus(result);
                        else setBusy(false);
                      }}
                    >
                      {["ready", "running"].includes(status?.state ?? "")
                        ? "Open full IDE"
                        : `Set up full IDE${status?.downloadMB ? ` · ${status.downloadMB} MB` : ""}`}
                    </button>
                  )
                )}
                <small>
                  VS Code source via code-server · Extensions from Open VSX or
                  VSIX
                </small>
              </div>
            )}
          </div>
        )}
      </section>
      {chatOpen && (
        <AgentPanel
          project={project}
          settings={settings}
          providers={providers}
          call={call}
          refresh={refresh}
          onPlan={onPlan}
        />
      )}
    </div>
  );
}
