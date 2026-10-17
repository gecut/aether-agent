import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowsClockwise,
  FileCode,
  FloppyDisk,
  FolderOpen,
  MonitorArrowUp,
  SidebarSimple,
  ClockCounterClockwise,
} from "@phosphor-icons/react";
import type {
  EditorDocument,
  EditorVersion,
  GitInfo,
  Project,
} from "../shared/types";
import { Collapsible } from "./Collapsible";
const CodeEditor = lazy(() => import("./CodeEditor"));
type Call = <T = unknown>(
  command: string,
  payload?: unknown,
) => Promise<T | undefined>;

export function IDE({
  project,
  call,
  notify,
  theme,
  onDirtyChange,
}: {
  project?: Project;
  call: Call;
  notify: (message: string) => void;
  theme: "light" | "dark";
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [document, setDocument] = useState<EditorDocument>();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [versions, setVersions] = useState<EditorVersion[]>([]);
  const [explorer, setExplorer] = useState(
    () => localStorage.getItem("aether.ide.v1.explorer") !== "closed",
  );
  const currentProject = useRef(project?.id);
  const request = useRef(0);
  currentProject.current = project?.id;
  const dirty = !!document && content !== document.content;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const refresh = async () => {
    if (!project) return;
    const info = await call<GitInfo>("git", project.id);
    if (currentProject.current === project.id) setFiles(info?.files ?? []);
  };
  useEffect(() => {
    request.current++;
    setDocument(undefined);
    setContent("");
    setVersions([]);
    setFiles([]);
    void refresh();
  }, [project?.id]);
  const history = async (file: string) => {
    if (!project) return;
    const result = await call<EditorVersion[]>("editor.history", {
      projectId: project.id,
      file,
    });
    if (currentProject.current === project.id) setVersions(result ?? []);
  };
  const open = async (file: string) => {
    if (!project || busy) return;
    if (dirty && !window.confirm("Discard unsaved edits and open this file?"))
      return;
    const id = ++request.current;
    const result = await call<EditorDocument>("editor.read", {
      projectId: project.id,
      file,
    });
    if (
      !result ||
      id !== request.current ||
      currentProject.current !== project.id
    )
      return;
    setDocument(result);
    setContent(result.content);
    await history(file);
  };
  const save = async () => {
    if (!project || !document || !dirty || busy) return;
    setBusy(true);
    const result = await call<EditorDocument>("editor.write", {
      projectId: project.id,
      file: document.file,
      content,
      revision: document.revision,
    });
    if (result && currentProject.current === project.id) {
      setDocument(result);
      notify(`Saved ${document.file}`);
      await history(document.file);
      await refresh();
    }
    setBusy(false);
  };
  const restore = async (version: EditorVersion) => {
    if (
      !project ||
      !document ||
      busy ||
      !window.confirm(
        `Restore ${document.file} to its saved version from ${new Date(version.at).toLocaleString()}? ${dirty ? "Unsaved edits will be discarded. " : ""}Your current saved file will also remain in history.`,
      )
    )
      return;
    setBusy(true);
    const result = await call<EditorDocument>("editor.restore", {
      projectId: project.id,
      file: document.file,
      id: version.id,
      revision: document.revision,
    });
    if (result && currentProject.current === project.id) {
      setDocument(result);
      setContent(result.content);
      await history(result.file);
      notify(
        "Previous version restored. You can restore the newer version from file history.",
      );
    }
    setBusy(false);
  };
  if (!project)
    return (
      <div className="ide-empty">
        <FolderOpen />
        <h1>Open a project to start editing</h1>
        <p>Code, agents, and Git activity in one workspace.</p>
      </div>
    );
  return (
    <div className={`ide-page ${explorer ? "" : "explorer-hidden"}`}>
      {explorer && (
        <aside className="ide-explorer">
          <header>
            <strong>EXPLORER</strong>
            <button
              aria-label="Refresh files"
              title="Refresh files"
              onClick={() => void refresh()}
            >
              <ArrowsClockwise />
            </button>
          </header>
          <Collapsible id="project-files" title={project.name}>
            <input
              className="ide-search"
              aria-label="Filter project files"
              placeholder="Find a file…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="ide-files">
              {files
                .filter((file) =>
                  file.toLowerCase().includes(query.toLowerCase()),
                )
                .map((file) => (
                  <button
                    className={file === document?.file ? "active" : ""}
                    title={file}
                    key={file}
                    disabled={busy}
                    onClick={() => void open(file)}
                  >
                    <FileCode />
                    <bdi>{file}</bdi>
                  </button>
                ))}
            </div>
          </Collapsible>
          <Collapsible
            id="file-history"
            title="File history"
            className="ide-history"
          >
            {versions.length ? (
              versions.map((version) => (
                <button
                  disabled={busy}
                  key={version.id}
                  title="Restore this version"
                  onClick={() => void restore(version)}
                >
                  <ClockCounterClockwise />
                  {new Date(version.at).toLocaleString()}
                </button>
              ))
            ) : (
              <p>
                Previous versions appear when you save a file. Up to 20 versions
                per project.
              </p>
            )}
          </Collapsible>
          <Collapsible
            id="extensions"
            title="Extensions"
            className="ide-extensions"
          >
            <p>
              Switch to Full IDE to search Open VSX or install VSIX extensions.
              You can also open this project in your installed VS Code app.
            </p>
            <button onClick={() => void call("ide.open-vscode", project.id)}>
              <MonitorArrowUp />
              Open in VS Code
            </button>
          </Collapsible>
        </aside>
      )}
      <section className="ide-editor">
        <header>
          <button
            title={explorer ? "Hide explorer" : "Show explorer"}
            aria-label={explorer ? "Hide explorer" : "Show explorer"}
            aria-expanded={explorer}
            onClick={() => {
              setExplorer(!explorer);
              localStorage.setItem(
                "aether.ide.v1.explorer",
                explorer ? "closed" : "open",
              );
            }}
          >
            <SidebarSimple />
          </button>
          <span className="ide-filename" title={document?.file}>
            {document?.file ?? "Choose a file"}
            {dirty ? " • unsaved" : ""}
          </span>
          <button
            title="Save (⌘/Ctrl S)"
            disabled={!dirty || busy}
            onClick={() => void save()}
          >
            <FloppyDisk />
            Save
          </button>
        </header>
        {document ? (
          <Suspense
            fallback={
              <div className="ide-empty" aria-label="Loading editor">
                <FileCode />
              </div>
            }
          >
            <CodeEditor
              key={`${project.id}/${document.file}`}
              file={document.file}
              content={content}
              onChange={setContent}
              onSave={() => void save()}
              theme={theme}
            />
          </Suspense>
        ) : (
          <div className="ide-empty">
            <FileCode />
            <p>Choose a file to start editing.</p>
            <small>Powered by the VS Code editor</small>
          </div>
        )}
      </section>
    </div>
  );
}
