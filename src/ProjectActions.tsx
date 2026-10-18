import { useEffect, useRef, useState } from "react";
import { FolderOpen } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { TerminalWindow } from "@phosphor-icons/react/dist/csr/TerminalWindow";
import { Code } from "@phosphor-icons/react/dist/csr/Code";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { FloatingPopover } from "./FloatingPopover";
import type { Project, ProjectCommands } from "../shared/types";
type Call = <T = unknown>(
  command: string,
  payload?: unknown,
) => Promise<T | undefined>;
export function ProjectActions({
  project,
  call,
  openIDE,
  openTerminal,
  openSetup,
}: {
  project: Project;
  call: Call;
  openIDE: () => void;
  openTerminal: () => void;
  openSetup?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [commands, setCommands] = useState<ProjectCommands>();
  const anchor = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setOpen(false);
    setCommands(undefined);
  }, [project.id]);
  useEffect(() => {
    if (!open) return;
    void call("ide.view.overlay", true);
    let live = true;
    void call<ProjectCommands>("project.commands", project.id).then((value) => {
      if (live) setCommands(value);
    });
    return () => {
      live = false;
      void call("ide.view.overlay", false);
    };
  }, [open, project.id]);
  return (
    <>
      <button
        ref={anchor}
        className="project-folder-action"
        aria-label="Project actions"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <FolderOpen />
        <span>Open project</span>
        <CaretDown size={12} />
      </button>
      {open && (
        <FloatingPopover
          anchor={anchor.current}
          onClose={() => setOpen(false)}
          className="project-actions-menu"
        >
          <div role="dialog" aria-label="Project actions">
            <strong>{project.name}</strong>
            {openSetup && (
              <button
                onClick={() => {
                  setOpen(false);
                  openSetup();
                }}
              >
                <Code />
                <span>
                  Project setup & skills
                  <small>Review optional Aether skills</small>
                </span>
              </button>
            )}
            <button
              onClick={() => {
                setOpen(false);
                openTerminal();
              }}
            >
              <TerminalWindow />
              <span>
                Open terminal<small>Integrated terminal in Aether</small>
              </span>
            </button>
            <button
              onClick={() => {
                setOpen(false);
                void call("project.reveal", project.id);
              }}
            >
              <FolderOpen />
              <span>
                Open folder<small>Show in your file manager</small>
              </span>
            </button>
            <button
              onClick={() => {
                setOpen(false);
                openIDE();
              }}
            >
              <Code />
              <span>
                Open IDE<small>Files, extensions and Ava</small>
              </span>
            </button>
            <div className="detected-commands">
              <small>
                {commands?.ecosystem ?? "Detecting project commands…"}
              </small>
              {commands?.commands.map((item) => (
                <div key={item.command}>
                  <span>{item.purpose}</span>
                  <code>{item.command}</code>
                </div>
              ))}
              <p>{commands?.note}</p>
            </div>
          </div>
        </FloatingPopover>
      )}
    </>
  );
}
