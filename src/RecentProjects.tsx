import { ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { FolderOpen } from "@phosphor-icons/react/dist/csr/FolderOpen";
import type { Project } from "../shared/types";
export function RecentProjects({
  projects,
  openProject,
}: {
  projects: Project[];
  openProject: (id: string) => void;
}) {
  if (!projects.length) return null;
  return (
    <section className="recent-projects" aria-label="Recent projects">
      <h2>
        Recent projects <span>Pick up where you left off</span>
      </h2>
      {projects.slice(0, 3).map((project, i) => (
        <button
          key={project.id}
          onClick={() => openProject(project.id)}
          aria-label={`${i === 0 ? "Open latest project" : "Open recent project"}: ${project.name}`}
          title={project.path}
        >
          <FolderOpen />
          <span className="recent-project-info">
            <strong dir="auto">{project.name}</strong>
            <small dir="ltr">
              {project.path.replace(/^\/Users\/[^/]+/, "~")}
            </small>
          </span>
          <span className="recent-project-action">
            {i === 0 ? "Continue in IDE" : "Open in IDE"}
          </span>
          <ArrowUpRight />
        </button>
      ))}
    </section>
  );
}
