import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowUpRight,
  CaretDown,
  CaretUp,
  Check,
  CircleNotch,
  Clock,
  PushPin,
  X,
  WarningCircle,
} from "@phosphor-icons/react";
import type { WidgetActivity, WidgetSnapshot } from "../../shared/widget";
import { companionPose } from "../companion/state";
import "./widget.css";
const Avatar = lazy(() =>
  import("../companion/Avatar").then((module) => ({ default: module.Avatar })),
);
const bridge = window.aetherWidget;
function label(item: WidgetActivity) {
  if (item.status === "completed")
    return item.kind === "task" ? "Task completed" : "Session completed";
  if (item.status === "awaiting_approval") return "Plan needs approval";
  if (item.status === "awaiting_review") return "Result needs review";
  return item.status.replaceAll("_", " ");
}
export function DesktopWidget() {
  useEffect(
    () =>
      bridge?.onPointer((point) =>
        window.dispatchEvent(
          new CustomEvent("aether:pointer", { detail: point }),
        ),
      ),
    [],
  );
  const [snapshot, setSnapshot] = useState<WidgetSnapshot>();
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false,
      loading = false,
      dirty = false;
    const load = async () => {
      if (loading) {
        dirty = true;
        return;
      }
      loading = true;
      try {
        const result = await bridge!.invoke<WidgetSnapshot>("snapshot", offset);
        if (!stopped) {
          setSnapshot(result);
          setError("");
        }
      } catch (error) {
        if (!stopped) setError(String(error));
      } finally {
        loading = false;
        if (!stopped && dirty) {
          dirty = false;
          void load();
        }
      }
    };
    const unsubscribe = bridge?.onUpdate(() => void load());
    void load();
    return () => {
      stopped = true;
      unsubscribe?.();
    };
  }, [offset]);
  const action = async (command: string, payload?: unknown) => {
    try {
      await bridge!.invoke(command, payload);
    } catch (error) {
      setError(String(error));
    }
  };
  const mood = snapshot?.attention
    ? "question"
    : snapshot?.active
      ? "working"
      : snapshot?.completed
        ? "done"
        : "idle";
  const title = snapshot?.attention
    ? "Your attention is needed"
    : snapshot?.active
      ? "Work is in progress"
      : snapshot?.completed
        ? "Tasks are complete"
        : "Ready when you are";
  const projectName =
    snapshot?.projects.find((project) => project.id === snapshot.projectId)
      ?.name ?? "All projects";
  return (
    <main
      className={`desktop-widget ${snapshot?.compact ? "compact" : ""}`}
      aria-label="Aether desktop activity"
    >
      <header className="widget-titlebar">
        <span>
          AETHER <small>ACTIVITY</small>
        </span>
        <div>
          <button
            aria-label={snapshot?.pinned ? "Unpin widget" : "Pin widget"}
            aria-pressed={snapshot?.pinned ?? true}
            onClick={() => void action("pin", !snapshot?.pinned)}
          >
            <PushPin weight={snapshot?.pinned ? "fill" : "regular"} />
          </button>
          <button
            aria-label={snapshot?.compact ? "Expand widget" : "Collapse widget"}
            onClick={() => void action("compact", !snapshot?.compact)}
          >
            {snapshot?.compact ? <CaretDown /> : <CaretUp />}
          </button>
          <button
            aria-label="Hide desktop widget"
            onClick={() => void action("hide")}
          >
            <X />
          </button>
        </div>
      </header>
      {!snapshot?.compact && (
        <label className="widget-project">
          <span>Project</span>
          <select
            aria-label="Widget project"
            value={snapshot?.projectId ?? ""}
            onChange={(event) => {
              setOffset(0);
              void action("project", event.target.value);
            }}
          >
            <option value="">All projects</option>
            {snapshot?.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <section className="widget-summary">
        <div className="widget-avatar">
          <Suspense fallback={null}>
            <Avatar state={companionPose(mood)} paused={false} />
          </Suspense>
        </div>
        <div>
          <strong>{title}</strong>
          <p>
            {snapshot?.compact
              ? `${projectName} · ${snapshot?.completed ?? 0} done`
              : `${snapshot?.completed ?? 0} tasks done · ${snapshot?.active ?? 0} active sessions`}
          </p>
          {!!snapshot?.attention && (
            <small>{snapshot.attention} sessions need attention</small>
          )}
        </div>
      </section>
      {error && (
        <p className="widget-error" role="alert">
          {error}
        </p>
      )}
      {!snapshot?.compact && (
        <>
          <div className="widget-feed-heading">
            <span>PROJECT ACTIVITY</span>
            <span>{snapshot?.total ?? 0} updates</span>
          </div>
          <div
            className="widget-feed"
            aria-label="Project task updates"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {!snapshot?.items.length && (
              <div className="widget-empty">
                <Clock size={24} />
                <p>Task updates appear here as your projects run.</p>
              </div>
            )}
            {snapshot?.items.map((item) => (
              <button
                className={`widget-item ${item.status}`}
                key={item.id}
                onClick={() =>
                  void action("open", {
                    runId: item.runId,
                    taskId: item.taskId,
                  })
                }
              >
                <span className="widget-item-icon">
                  {item.status === "completed" ? (
                    <Check />
                  ) : ["running", "initializing", "retrying"].includes(
                      item.status,
                    ) ? (
                    <CircleNotch className="widget-spin" />
                  ) : ["failed", "blocked"].includes(item.status) ? (
                    <WarningCircle />
                  ) : (
                    <Clock />
                  )}
                </span>
                <span className="widget-item-text">
                  <strong dir="auto">{item.title}</strong>
                  <span>
                    <bdi>{item.projectName}</bdi> · {label(item)}
                  </span>
                  <time dateTime={item.at}>
                    {new Date(item.at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </span>
                <ArrowUpRight className="widget-open-icon" />
              </button>
            ))}
          </div>
          <footer className="widget-pagination">
            <button
              disabled={!snapshot?.offset}
              onClick={() =>
                setOffset(Math.max(0, (snapshot?.offset ?? 0) - 20))
              }
            >
              Newer
            </button>
            <span>
              {snapshot?.total
                ? `${(snapshot.offset ?? 0) + 1}–${Math.min(snapshot.total, (snapshot.offset ?? 0) + 20)} of ${snapshot.total}`
                : "No updates yet"}
            </span>
            <button
              disabled={!snapshot || snapshot.offset + 20 >= snapshot.total}
              onClick={() => setOffset((snapshot?.offset ?? 0) + 20)}
            >
              Older
            </button>
          </footer>
        </>
      )}
    </main>
  );
}
