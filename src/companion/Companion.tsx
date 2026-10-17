import { lazy, Suspense, useState } from "react";
import {
  CaretDown,
  CaretUp,
  Pause,
  Play,
  ArrowUpRight,
} from "@phosphor-icons/react";
import type { Run, RunEvent } from "../../shared/types";
import { companionState } from "./state";
const Avatar = lazy(() =>
  import("./Avatar").then((module) => ({ default: module.Avatar })),
);

const preferenceKey = "aether.companion.v1";
function preferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey) ?? "{}");
    return {
      collapsed: saved.collapsed === true,
      paused: saved.paused === true,
    };
  } catch {
    return { collapsed: false, paused: false };
  }
}
export function Companion({
  runs,
  selectedId,
  events,
  onOpen,
}: {
  runs: Run[];
  selectedId: string;
  events: RunEvent[];
  onOpen: (run: Run) => void;
}) {
  const [prefs, setPrefs] = useState(preferences);
  const state = companionState(runs, selectedId, events);
  const update = (patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(next));
    } catch {
      /* Preferences are optional when local storage is unavailable. */
    }
  };
  return (
    <section
      className={`companion-dock ${prefs.collapsed ? "collapsed" : ""}`}
      aria-label="Ava companion"
      data-mood={state.mood}
    >
      <header>
        <span dir="ltr">
          Ava <small>AETHER</small>
        </span>
        <div>
          {!prefs.collapsed && (
            <button
              aria-label={
                prefs.paused
                  ? "Resume companion animation"
                  : "Pause companion animation"
              }
              aria-pressed={prefs.paused}
              onClick={() => update({ paused: !prefs.paused })}
            >
              {prefs.paused ? <Play /> : <Pause />}
            </button>
          )}
          <button
            aria-label={
              prefs.collapsed ? "Expand companion" : "Minimize companion"
            }
            aria-expanded={!prefs.collapsed}
            onClick={() => update({ collapsed: !prefs.collapsed })}
          >
            {prefs.collapsed ? <CaretUp /> : <CaretDown />}
          </button>
        </div>
      </header>
      {!prefs.collapsed && (
        <div className="companion-stage">
          <Suspense
            fallback={<span className="companion-loading" aria-hidden="true" />}
          >
            <Avatar state={state} paused={prefs.paused} />
          </Suspense>
          <span className="companion-badge" aria-hidden="true">
            {state.mood === "question" || state.mood === "blocked"
              ? "?"
              : state.mood === "working"
                ? "</>"
                : state.mood === "done"
                  ? "✓"
                  : state.mood === "error"
                    ? "!"
                    : "·"}
          </span>
        </div>
      )}
      <div
        className="companion-caption"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <strong dir="ltr">{state.title}</strong>
        {!prefs.collapsed && <p dir="ltr">{state.message}</p>}
      </div>
      {!prefs.collapsed && state.run && (
        <button className="companion-open" onClick={() => onOpen(state.run!)}>
          <ArrowUpRight />
          <span dir="ltr">
            {state.mood === "question" ? "Review & continue" : "Open session"}
          </span>
        </button>
      )}
    </section>
  );
}
