import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FolderOpen } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { GithubLogo } from "@phosphor-icons/react/dist/csr/GithubLogo";
import { X } from "@phosphor-icons/react/dist/csr/X";
import type {
  Project,
  ProjectImport as ImportStatus,
  StarterSkill,
  Skill,
} from "../shared/types";
type Call = <T = unknown>(
  command: string,
  payload?: unknown,
) => Promise<T | undefined>;
export function ProjectImportDialog({
  initialProject,
  call,
  onClose,
  onContinue,
}: {
  initialProject?: Project;
  call: Call;
  onClose: () => void;
  onContinue: (
    project: Project,
    target: "workspace" | "ide" | "skills",
  ) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [project, setProject] = useState(initialProject);
  const [source, setSource] = useState("");
  const [parent, setParent] = useState("");
  const [job, setJob] = useState<ImportStatus>();
  const [busy, setBusy] = useState(false);
  const [skills, setSkills] = useState<StarterSkill[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [installed, setInstalled] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  async function invoke<T = unknown>(
    command: string,
    payload?: unknown,
  ): Promise<T | undefined> {
    try {
      return await call<T>(command, payload);
    } catch (error) {
      setMessage(
        String(error).replace(
          /^Error: Error invoking remote method '[^']+': Error: /,
          "",
        ),
      );
      return undefined;
    }
  }
  const cloning = !!job && ["cloning", "preparing"].includes(job.status);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    void call("ide.view.overlay", true).catch(() => {});
    return () => {
      void call("ide.view.overlay", false).catch(() => {});
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (!project) return;
    let live = true;
    void invoke<StarterSkill[]>("skill.starters").then((value) => {
      if (live && value) setSkills(value);
    });
    return () => {
      live = false;
    };
  }, [project?.id]);
  useEffect(() => {
    if (!job || !["cloning", "preparing"].includes(job.status)) return;
    let live = true,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const value = await invoke<ImportStatus>("project.import.status", job.id);
      if (!live) return;
      if (!value) {
        setMessage("Connection interrupted. Checking clone status again…");
        timer = setTimeout(() => void poll(), 2000);
        return;
      }
      if (value.status === "ready" && value.projectId) {
        const imported = await invoke<Project>("project.open", value.projectId);
        if (!live) return;
        if (imported) setProject(imported);
        setJob(value);
      } else {
        setJob(value);
      }
      if (["cloning", "preparing"].includes(value.status))
        timer = setTimeout(() => void poll(), 1000);
    };
    timer = setTimeout(() => void poll(), 500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [job?.id, job?.status]);
  async function openLocal() {
    setBusy(true);
    const opened = await invoke<Project>("project.choose");
    if (opened) setProject(opened);
    setBusy(false);
  }
  async function clone() {
    setBusy(true);
    setMessage("");
    const started = await invoke<ImportStatus>("project.clone", {
      source,
      parent,
    });
    if (started) setJob(started);
    setBusy(false);
  }
  async function install() {
    if (!project) return;
    setBusy(true);
    setMessage("");
    const result = await invoke<Skill[]>("skill.starter.install", {
      projectId: project.id,
      reviewed: true,
      skills: skills
        .filter((skill) => selected.includes(skill.id))
        .map(({ id, hash }) => ({ id, hash })),
    });
    if (result) {
      setInstalled((previous) => [...previous, ...selected]);
      setSelected([]);
      setReviewed(false);
      setMessage("Selected skills installed and enabled for this project.");
    }
    setBusy(false);
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="project-import-dialog"
      aria-labelledby="project-import-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!cloning && !busy) onClose();
      }}
    >
      <header>
        <div>
          <p className="eyebrow">
            {project ? "MAKE IT YOUR WORKSPACE" : "BRING YOUR CODE"}
          </p>
          <h2 id="project-import-title">
            {project ? "Skills before you start" : "Import a project"}
          </h2>
        </div>
        <button
          aria-label="Close project import"
          disabled={cloning || busy}
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      <div className="project-import-content">
        {!project ? (
          <>
            <p>
              Open any existing project, or clone a repository. Aether works
              with code created anywhere.
            </p>
            <button
              className="import-local button"
              disabled={busy || cloning}
              onClick={() => void openLocal()}
            >
              <FolderOpen />
              Open existing local project
            </button>
            <div className="import-divider">
              <span>or clone from GitHub / Git</span>
            </div>
            <label>
              Repository URL
              <input
                autoFocus
                disabled={busy || cloning}
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="https://github.com/owner/repository"
              />
            </label>
            <small>
              Use owner/repository for GitHub, or an HTTPS Git URL. Private
              repositories use your existing Git or GitHub CLI sign-in.
            </small>
            <label>
              Clone location
              <div className="import-location">
                <input
                  aria-label="Clone location"
                  value={parent}
                  readOnly
                  placeholder="Choose a parent folder…"
                />
                <button
                  className="button"
                  disabled={busy || cloning}
                  onClick={async () => {
                    const folder = await invoke<string>("project.clone.parent");
                    if (folder) setParent(folder);
                  }}
                >
                  Choose folder
                </button>
              </div>
            </label>
            <p className="muted">
              A new repository folder is created inside this location. Existing
              folders are preserved. Dependencies, submodules and project
              scripts are not run during import.
            </p>
            {job && (
              <div role="status" className={`import-progress ${job.status}`}>
                <strong>{job.message}</strong>
                {cloning && (
                  <progress aria-label="Repository import progress" />
                )}
              </div>
            )}
            {message && <p role="status">{message}</p>}
            <footer>
              {cloning ? (
                <button
                  className="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const value = await invoke<ImportStatus>(
                      "project.import.cancel",
                      job!.id,
                    );
                    if (value) setJob(value);
                    setBusy(false);
                  }}
                >
                  Cancel clone
                </button>
              ) : (
                <button
                  className="button primary"
                  disabled={busy || !source.trim() || !parent}
                  onClick={() => void clone()}
                >
                  <GithubLogo />
                  {busy ? "Starting…" : "Clone repository"}
                </button>
              )}
            </footer>
          </>
        ) : (
          <>
            <div className="import-project-summary">
              <FolderOpen />
              <div>
                <strong>{project.name}</strong>
                <small dir="ltr">{project.path}</small>
              </div>
              <span>Ready</span>
            </div>
            <p>
              Optional Aether skills help the agent follow your project’s
              conventions and verify changes. Review their instructions before
              installing; they do not grant extra permissions.
            </p>
            <div className="import-skill-list">
              {skills.map((skill) => (
                <section key={skill.id}>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      disabled={busy || installed.includes(skill.id)}
                      checked={
                        selected.includes(skill.id) ||
                        installed.includes(skill.id)
                      }
                      onChange={(event) => {
                        setSelected((previous) =>
                          event.target.checked
                            ? [...previous, skill.id]
                            : previous.filter((id) => id !== skill.id),
                        );
                        setReviewed(false);
                      }}
                    />
                    <span>
                      <strong>{skill.name}</strong>
                      <small>
                        {installed.includes(skill.id)
                          ? "Installed and enabled"
                          : skill.description}
                      </small>
                    </span>
                  </label>
                  <details>
                    <summary>Read skill instructions</summary>
                    <pre>{skill.content}</pre>
                  </details>
                </section>
              ))}
            </div>
            {!!selected.length && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                I reviewed the selected skills and want them enabled for this
                project.
              </label>
            )}
            <div className="import-skill-actions">
              <button
                className="button"
                disabled={busy || !selected.length || !reviewed}
                onClick={() => void install()}
              >
                {busy ? "Installing…" : "Install reviewed skills"}
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => onContinue(project, "skills")}
              >
                Browse more skills
              </button>
            </div>
            {message && <p role="status">{message}</p>}
            <footer>
              <button
                className="button"
                disabled={busy}
                onClick={() => onContinue(project, "workspace")}
              >
                Continue to workspace
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => onContinue(project, "ide")}
              >
                Open in IDE
              </button>
            </footer>
          </>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
