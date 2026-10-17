import type { Task } from "../shared/types";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Cpu } from "@phosphor-icons/react/dist/csr/Cpu";
export function TaskGraph({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (id: string) => void;
}) {
  const levels = new Map<string, number>();
  const level = (id: string): number => {
    if (levels.has(id)) return levels.get(id)!;
    const task = tasks.find((t) => t.id === id)!;
    const value = task.dependencies.length
      ? Math.max(...task.dependencies.map(level)) + 1
      : 0;
    levels.set(id, value);
    return value;
  };
  for (const task of tasks) level(task.id);
  const columns = Array.from(
    { length: Math.max(...levels.values()) + 1 },
    (_, i) => tasks.filter((t) => levels.get(t.id) === i),
  );
  const positions = new Map(
    tasks.map((task) => [
      task.id,
      {
        x: level(task.id) * 225 + 10,
        y:
          columns[level(task.id)].findIndex((t) => t.id === task.id) * 100 + 15,
      },
    ]),
  );
  const width = columns.length * 225 - 20,
    height = Math.max(...columns.map((c) => c.length)) * 100;
  return (
    <div className="task-graph" aria-label="Task dependency graph">
      <div style={{ width, height, position: "relative" }}>
        <svg
          width={width}
          height={height}
          aria-hidden="true"
          className="graph-edges"
        >
          {tasks.flatMap((task) =>
            task.dependencies.map((dep) => {
              const from = positions.get(dep)!,
                to = positions.get(task.id)!;
              return (
                <path
                  key={dep + task.id}
                  d={`M ${from.x + 180} ${from.y + 30} C ${from.x + 205} ${from.y + 30},${to.x - 25} ${to.y + 30},${to.x} ${to.y + 30}`}
                />
              );
            }),
          )}
        </svg>
        {tasks.map((task) => {
          const position = positions.get(task.id)!;
          return (
            <button
              key={task.id}
              className={"graph-node " + task.status}
              style={{ left: position.x, top: position.y }}
              onClick={() => onSelect(task.id)}
            >
              <span>
                {task.status === "completed" ? <Check /> : <Cpu />}
                <code>{task.id}</code>
                <span className={"status-dot " + task.status} />
              </span>
              <strong dir="auto">{task.title}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}
