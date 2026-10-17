import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { FolderOpen } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { TreeStructure } from "@phosphor-icons/react/dist/csr/TreeStructure";
import type { Chat, Project, Settings, ProviderInfo } from "../shared/types";
import { companionPose } from "./companion/state";
import { ModelPicker } from "./ModelPicker";
const Avatar = lazy(() =>
  import("./companion/Avatar").then((module) => ({ default: module.Avatar })),
);
type Call = <T = unknown>(
  command: string,
  payload?: unknown,
) => Promise<T | undefined>;
export function AgentPanel({
  project,
  settings,
  providers,
  call,
  refresh,
  onPlan,
}: {
  project: Project;
  settings: Settings;
  providers: ProviderInfo[];
  call: Call;
  refresh: () => Promise<void>;
  onPlan: (objective: string) => void;
}) {
  const [chat, setChat] = useState<Chat>(),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false);
  const current = useRef(project.id);
  current.current = project.id;
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setChat(undefined);
    setInput("");
    let live = true;
    void call<Chat[]>("chat.project", project.id).then((chats) => {
      if (live) setChat(chats?.[0]);
    });
    return () => {
      live = false;
    };
  }, [project.id]);
  useEffect(() => {
    scroll.current?.scrollTo({
      top: scroll.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chat?.messages.length, busy]);
  const send = async () => {
    const content = input.trim();
    if (!content || busy) return;
    setInput("");
    setBusy(true);
    const result = await call<Chat>("chat.send", {
      content,
      chatId: chat?.id,
      projectId: project.id,
    });
    if (current.current === project.id && result) setChat(result);
    else if (!result) setInput(content);
    setBusy(false);
    await refresh();
  };
  const last = chat?.messages.at(-1);
  return (
    <aside className="ide-agent" aria-label="Project agent chat">
      <header>
        <span className="agent-avatar">
          <Suspense fallback={null}>
            <Avatar
              state={companionPose(busy ? "planning" : "idle")}
              paused={!busy}
            />
          </Suspense>
        </span>
        <div>
          <strong>Ava</strong>
          <small>Your project partner</small>
        </div>
        <button
          aria-label="New project chat"
          title="New project chat"
          disabled={busy}
          onClick={() => setChat(undefined)}
        >
          <Plus />
        </button>
      </header>
      <div className="agent-project">
        <FolderOpen />
        <bdi>{project.name}</bdi>
        <button
          title="Show project folder"
          aria-label="Show project folder"
          onClick={() => void call("project.reveal", project.id)}
        >
          Open folder
        </button>
      </div>
      <div
        className="agent-messages"
        ref={scroll}
        role="log"
        aria-label="Agent conversation"
      >
        {!chat?.messages.length && (
          <div className="agent-intro">
            <h2>Code together.</h2>
            <p>
              Ask about your project, work through a problem, or turn an idea
              into a reviewed plan.
            </p>
            <div>
              {[
                "Explain this project",
                "Find what to improve",
                "Plan my next feature",
              ].map((text) => (
                <button key={text} onClick={() => setInput(text)}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat?.messages.map((message) => (
          <article key={message.id} className={`agent-message ${message.role}`}>
            <small>{message.role === "assistant" ? "Ava" : "You"}</small>
            <p dir="auto">{message.content.replace(/^PROJECT_WORK:\s*/, "")}</p>
            {message.context && (
              <span className="agent-context">
                ~{message.context.estimatedTokens.toLocaleString()} input tokens
                estimated
                {message.context.omitted
                  ? ` · ${message.context.omitted} earlier messages kept in history`
                  : ""}
              </span>
            )}
          </article>
        ))}
        {busy && (
          <div
            className="agent-thinking"
            role="status"
            aria-label="Ava is thinking"
          >
            <Suspense fallback={null}>
              <Avatar state={companionPose("planning")} paused={false} />
            </Suspense>
          </div>
        )}
      </div>
      {last?.role === "assistant" &&
        last.content.startsWith("PROJECT_WORK:") && (
          <button
            className="agent-plan"
            onClick={() =>
              onPlan(
                chat?.messages
                  .filter((message) => message.role === "user")
                  .at(-1)?.content ?? "",
              )
            }
          >
            <TreeStructure />
            Review a project plan
          </button>
        )}
      <div className="agent-composer">
        <ModelPicker
          compact
          role="planner"
          value={settings.planner}
          providers={providers}
          call={call}
          onSelect={async (patch) => {
            await call("settings.model", { role: "planner", patch });
            await refresh();
          }}
        />
        <textarea
          aria-label="Message project agent"
          placeholder="Ask Ava about this project…"
          value={input}
          maxLength={12000}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div>
          <span>{settings.efficiency} · read-only chat</span>
          <button
            aria-label="Send to project agent"
            disabled={busy || !input.trim()}
            onClick={() => void send()}
          >
            <ArrowUp weight="bold" />
          </button>
        </div>
      </div>
    </aside>
  );
}
