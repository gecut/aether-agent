import { useEffect, useState } from "react";
import {
  ArrowsClockwise,
  BracketsCurly,
  FileCode,
  FloppyDisk,
  FolderOpen,
  MonitorArrowUp,
} from "@phosphor-icons/react";
import type { GitInfo, Project } from "../shared/types";

type Call = <T = unknown>(
  command: string,
  payload?: unknown,
) => Promise<T | undefined>;

export function IDE({
  project,
  call,
  notify,
}: {
  project?: Project;
  call: Call;
  notify: (message: string) => void;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    if (!project) return;
    const info = await call<GitInfo>("git", project.id);
    setFiles(info?.files ?? []);
  };
  useEffect(() => {
    setSelected("");
    setContent("");
    setSaved(true);
    void refresh();
  }, [project?.id]);
  const open = async (file: string) => {
    if (!project) return;
    const next = await call<string>("file", { projectId: project.id, file });
    if (next === undefined) return;
    setSelected(file);
    setContent(next);
    setSaved(true);
  };
  const save = async () => {
    if (!project || !selected || saved) return;
    setBusy(true);
    const result = await call("editor.write", {
      projectId: project.id,
      file: selected,
      content,
    });
    if (result) {
      setSaved(true);
      notify(`Saved ${selected}`);
      await refresh();
    }
    setBusy(false);
  };
  if (!project)
    return (
      <div className="ide-empty">
        <FolderOpen />
        <h1>Open a project to start editing</h1>
        <p>Aether keeps code, agents, and Git activity in one workspace.</p>
      </div>
    );
  return (
    <div className="ide-page">
      <aside className="ide-explorer">
        <header>
          <span>
            <BracketsCurly /> Explorer
          </span>
          <button aria-label="Refresh files" onClick={() => void refresh()}>
            <ArrowsClockwise />
          </button>
        </header>
        <strong>{project.name}</strong>
        <div className="ide-files">
          {files.map((file) => (
            <button
              className={file === selected ? "active" : ""}
              key={file}
              onClick={() => void open(file)}
            >
              <FileCode /> <bdi>{file}</bdi>
            </button>
          ))}
        </div>
        <section className="ide-extensions">
          <h3>VS Code extensions</h3>
          <p>Extensions run in VS Code, not in Aether’s protected editor.</p>
          <button onClick={() => void call("ide.open-vscode", project.id)}>
            <MonitorArrowUp /> Open in VS Code
          </button>
        </section>
      </aside>
      <section className="ide-editor">
        <header>
          <span>
            {selected || "Choose a file"}
            {selected && !saved ? " • unsaved" : ""}
          </span>
          <button
            disabled={!selected || saved || busy}
            onClick={() => void save()}
          >
            <FloppyDisk /> Save
          </button>
        </header>
        {selected ? (
          <textarea
            aria-label={`Editor ${selected}`}
            spellCheck={false}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setSaved(false);
            }}
          />
        ) : (
          <div className="ide-empty">
            <FileCode />
            <p>Select a safe text file from the explorer.</p>
          </div>
        )}
      </section>
    </div>
  );
}
