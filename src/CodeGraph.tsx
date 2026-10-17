import { useEffect, useState } from "react";
import type { CodeGraph as Graph, Run } from "../shared/types";

export function CodeGraph({
  projectId,
  run,
}: {
  projectId: string;
  run?: Run;
}) {
  const [graph, setGraph] = useState<Graph>();
  const [error, setError] = useState("");
  const [live, setLive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    setGraph(undefined);
    setSelected("");
    const load = async (refresh = false) => {
      setBusy(true);
      try {
        const next = await window.aether!.invoke<Graph>("graph.read", {
          projectId,
          runId: run?.id,
          refresh,
        });
        if (!disposed) {
          setGraph(next);
          setError(next.error ?? "");
        }
      } catch (e) {
        if (!disposed) setError(String(e));
      } finally {
        if (!disposed) {
          setBusy(false);
          if (live) timer = setTimeout(() => void load(), 4000);
        }
      }
    };
    void load(revision > 0);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [projectId, run?.id, live, revision]);
  const nodes = (graph?.nodes ?? [])
    .filter((node) =>
      (node.label + " " + node.file)
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .slice(0, 150);
  const positions = new Map(
    nodes.map((node, index) => {
      const ring = Math.floor(index / 30) + 1;
      const angle =
        ((index % 30) / Math.min(nodes.length - (ring - 1) * 30, 30)) *
        Math.PI *
        2;
      return [
        node.id,
        {
          x: 600 + Math.cos(angle) * ring * 90,
          y: 480 + Math.sin(angle) * ring * 75,
        },
      ];
    }),
  );
  const focus = graph?.nodes.find((node) => node.id === selected);
  const related = new Set([
    selected,
    ...(graph?.edges ?? []).flatMap((edge) =>
      edge.source === selected
        ? [edge.target]
        : edge.target === selected
          ? [edge.source]
          : [],
    ),
  ]);
  const fileStatus = (file: string) =>
    run?.tasks.find(
      (task) =>
        ["running", "retrying"].includes(task.status) &&
        task.files.some(
          (scope) =>
            scope === "*" ||
            file === scope ||
            file.startsWith(scope.replace(/\/$/, "") + "/"),
        ),
    )
      ? "active"
      : run?.tasks.some(
            (task) =>
              task.status === "completed" &&
              task.files.some(
                (scope) =>
                  scope === "*" ||
                  file === scope ||
                  file.startsWith(scope.replace(/\/$/, "") + "/"),
              ),
          )
        ? "complete"
        : "";
  return (
    <section className="code-graph" aria-label="Live Graphify repository graph">
      <div className="graph-toolbar">
        <div>
          <h2>Graphify</h2>
          <p>Repository symbols and relationships · local AST extraction</p>
        </div>
        <label>
          <input
            type="checkbox"
            checked={live}
            onChange={(event) => setLive(event.target.checked)}
          />{" "}
          Live
        </label>
        <button
          onClick={() => setRevision((value) => value + 1)}
          disabled={busy}
        >
          {busy ? "Indexing…" : "Refresh graph"}
        </button>
      </div>
      <div className="graph-toolbar graph-controls">
        <input
          dir="auto"
          aria-label="Search graph nodes"
          placeholder="Find a symbol or file…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span>
          {graph?.nodes.length ?? 0} nodes · {graph?.edges.length ?? 0} edges
        </span>
        <button
          aria-label="Zoom out graph"
          onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))}
        >
          −
        </button>
        <button
          aria-label="Zoom in graph"
          onClick={() => setZoom((value) => Math.min(3, value + 0.2))}
        >
          +
        </button>
      </div>
      {error && (
        <p role="alert" className="notice error" dir="auto">
          {error}
        </p>
      )}
      {!error && !busy && graph && !graph.nodes.length && (
        <p className="graph-empty">
          No supported code files yet. Nodes appear as implementation creates
          source files.
        </p>
      )}
      <div className="graph-canvas">
        <svg
          width={`${100 * zoom}%`}
          height={600 * zoom}
          viewBox="0 0 1200 960"
          aria-label="Repository symbol nodes"
        >
          {(graph?.edges ?? [])
            .filter(
              (edge) =>
                positions.has(edge.source) && positions.has(edge.target),
            )
            .map((edge, index) => {
              const from = positions.get(edge.source)!,
                to = positions.get(edge.target)!;
              return (
                <line
                  key={index}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={
                    selected &&
                    related.has(edge.source) &&
                    related.has(edge.target)
                      ? "selected"
                      : ""
                  }
                >
                  <title>{edge.relation}</title>
                </line>
              );
            })}
          {nodes.map((node) => {
            const point = positions.get(node.id)!;
            return (
              <g
                key={node.id}
                transform={`translate(${point.x},${point.y})`}
                role="button"
                tabIndex={0}
                aria-label={node.label + " in " + node.file}
                className={`symbol-node ${fileStatus(node.file)} ${selected === node.id ? "selected" : ""} ${selected && !related.has(node.id) ? "dimmed" : ""}`}
                onClick={() => setSelected(node.id)}
                onKeyDown={(event) => {
                  if (["Enter", " "].includes(event.key)) {
                    event.preventDefault();
                    setSelected(node.id);
                  }
                }}
              >
                <title>
                  {node.label + " · " + node.file + ":" + node.line}
                </title>
                <rect
                  x={-65}
                  y={-30}
                  width={130}
                  height={42}
                  fill="transparent"
                />
                <circle r={node.id === selected ? 10 : 7} />
                <text
                  y={-12}
                  textAnchor="middle"
                  direction="ltr"
                  unicodeBidi="isolate"
                >
                  {node.label.length > 24
                    ? node.label.slice(0, 23) + "…"
                    : node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {focus && (
        <div className="graph-detail">
          <strong dir="auto">{focus.label}</strong>
          <code dir="ltr">
            {focus.file}:{focus.line}
          </code>
          <span>
            {related.size - 1} connected nodes ·{" "}
            {fileStatus(focus.file) === "active"
              ? "Active coding scope"
              : "Source symbol"}
          </span>
        </div>
      )}
      <footer>
        {graph?.source ?? "Reading repository…"} ·{" "}
        {graph
          ? "Indexed " + new Date(graph.updatedAt).toLocaleTimeString()
          : "Waiting for index"}
        <br />
        Showing {nodes.length} nodes.{" "}
        {graph?.truncated
          ? "Index limited to 1,000 files / 2,000 nodes / 5,000 edges. "
          : ""}
        Blue: source · amber: active task scope · green: completed task scope.
        Search to narrow the graph.
      </footer>
    </section>
  );
}
