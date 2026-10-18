import { useEffect, useRef, useState } from "react";
import type { Run } from "../shared/types";
type Call = <T = unknown>(
  command: string,
  payload?: unknown,
) => Promise<T | undefined>;
export function ConversationRun({
  id,
  call,
  refresh,
}: {
  id: string;
  call: Call;
  refresh: () => Promise<void>;
}) {
  const [run, setRun] = useState<Run>();
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (
      run?.status === "awaiting_approval" ||
      run?.status === "awaiting_review"
    )
      panel.current?.scrollIntoView({
        block: "end",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [run?.status]);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      if (document.hidden) {
        timer = setTimeout(() => void load(), 1500);
        return;
      }
      const value = await call<Run>("run.conversation", id);
      if (!live) return;
      if (value) setRun(value);
      if (value && !["completed", "failed", "cancelled"].includes(value.status))
        timer = setTimeout(() => void load(), 1500);
    };
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [id, call, run?.status]);
  const action = async (command: string) => {
    setBusy(true);
    await call(command, id);
    const value = await call<Run>("run.conversation", id);
    if (value) setRun(value);
    await refresh();
    setBusy(false);
  };
  if (!run)
    return (
      <div className="conversation-run" role="status">
        Loading project work…
      </div>
    );
  const running = ["initializing", "running", "queued"].includes(run.status);
  return (
    <section
      ref={panel}
      className="conversation-run"
      aria-label="Project work in this conversation"
    >
      <header>
        <strong>{run.title}</strong>
        <span role="status">{run.status.replaceAll("_", " ")}</span>
      </header>
      {run.reason && <p>{run.reason}</p>}
      {run.tasks.map((task) => (
        <div className="conversation-task" key={task.id}>
          <details>
            <summary>
              {task.title}
              <small>{task.status.replaceAll("_", " ")}</small>
            </summary>
            <p>{task.objective}</p>
            <ul>
              {task.acceptance.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
            {task.output && <pre>{task.output}</pre>}
            {task.tests?.map((test, index) => (
              <details key={index}>
                <summary>
                  {test.command} · exit {test.exitCode}
                </summary>
                <pre>{test.output}</pre>
              </details>
            ))}
          </details>
          <div className="conversation-task-contract">
            <p>
              <b>Files:</b> {task.files.join(", ") || "Read-only"}
            </p>
            <p>
              <b>Verification:</b> <code>{task.verification}</code>
            </p>
          </div>
        </div>
      ))}
      {run.patch && (
        <details>
          <summary>Review code changes</summary>
          <pre>{run.patch}</pre>
        </details>
      )}
      {run.review && (
        <details>
          <summary>Review findings</summary>
          <pre>{run.review}</pre>
        </details>
      )}
      <div className="conversation-run-actions">
        {run.status === "awaiting_approval" && (
          <>
            <small>
              Approval runs the listed commands in isolated worktrees.
            </small>
            <button disabled={busy} onClick={() => void action("run.approve")}>
              Approve & run
            </button>
            <button disabled={busy} onClick={() => void action("run.reject")}>
              Reject
            </button>
          </>
        )}
        {run.status === "awaiting_review" && (
          <>
            <small>Apply writes the reviewed changes to your project.</small>
            <button disabled={busy} onClick={() => void action("run.apply")}>
              Apply changes
            </button>
            <button disabled={busy} onClick={() => void action("run.reject")}>
              Reject
            </button>
          </>
        )}
        {["failed", "blocked"].includes(run.status) && run.plan && (
          <button disabled={busy} onClick={() => void action("run.approve")}>
            Retry remaining tasks
          </button>
        )}
        {running && (
          <button disabled={busy} onClick={() => void action("run.cancel")}>
            Stop work
          </button>
        )}
        {run.status === "completed" && (
          <small>Saved. Send your next request in this conversation.</small>
        )}
      </div>
    </section>
  );
}
