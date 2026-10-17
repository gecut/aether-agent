import { useEffect, useState } from "react";
import type {
  CatalogSkill,
  Project,
  Skill,
  SkillPreview,
} from "../shared/types";
type Call = <T = unknown>(
  command: string,
  payload?: unknown,
) => Promise<T | undefined>;
export function SkillDiscovery({
  project,
  call,
  refresh,
  installed,
}: {
  project?: Project;
  call: Call;
  refresh: () => Promise<void>;
  installed: Skill[];
}) {
  const [query, setQuery] = useState(""),
    [skills, setSkills] = useState<CatalogSkill[]>([]),
    [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<SkillPreview>(),
    [reviewed, setReviewed] = useState(false),
    [opened, setOpened] = useState(false),
    [searched, setSearched] = useState(false);
  useEffect(() => {
    setPreview(undefined);
    setReviewed(false);
  }, [project?.id]);
  async function search(force = false) {
    setBusy(true);
    try {
      const result = await call<{ skills: CatalogSkill[]; errors: string[] }>(
        "skill.search",
        { query, refresh: force },
      );
      if (result) {
        setSkills(result.skills);
        setErrors(result.errors);
        setSearched(true);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="skill-discovery">
      <div className="settings-section-title">
        <div>
          <h2>Discover project skills</h2>
          <p>
            Browse OpenAI, Anthropic, and Vercel. Review instructions and
            package files before installing.
          </p>
        </div>
        <button
          className="button"
          onClick={() => {
            setOpened(!opened);
            if (!opened && !searched) void search();
          }}
        >
          {opened ? "Close catalog" : "Browse skills"}
        </button>
      </div>
      {opened && (
        <>
          <form
            className="heading-actions"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <input
              aria-label="Search available skills"
              placeholder="Search by skill name or publisher…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="button" disabled={busy}>
              {busy ? "Loading…" : "Search catalog"}
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void search(true)}
            >
              Refresh sources
            </button>
          </form>
          {errors.map((error) => (
            <p role="status" key={error}>
              {error}
            </p>
          ))}
          {!busy && searched && (
            <p>
              {skills.length} skills found. GitHub stars describe the source
              repository.
            </p>
          )}
          <div className="skills-grid catalog-results">
            {skills.map((skill) => (
              <article className="skill-card" key={skill.id}>
                <h3>{skill.name}</h3>
                <p>
                  {skill.repository} ·{" "}
                  {skill.stars === null
                    ? "Stars unavailable"
                    : `${skill.stars.toLocaleString()} stars`}
                </p>
                <code>{skill.commit.slice(0, 10)}</code>
                <button
                  className="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setReviewed(false);
                    try {
                      setPreview(
                        await call<SkillPreview>("skill.preview", skill.id),
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Review package
                </button>
              </article>
            ))}
          </div>
          {preview && (
            <section
              className="skill-editor"
              aria-label="Skill package preview"
            >
              <div className="settings-section-title">
                <h2>{preview.skill.name}</h2>
                <button
                  className="button"
                  onClick={() => setPreview(undefined)}
                >
                  Close preview
                </button>
              </div>
              <p>{preview.description}</p>
              <p className="catalog-source">Source: {preview.skill.url}</p>
              <button
                className="button"
                onClick={() => void call("skill.source", preview.skill.url)}
              >
                Open source and licenses
              </button>
              <textarea
                readOnly
                className="code-editor"
                aria-label="Catalog skill instructions"
                value={preview.content}
              />
              <details>
                <summary>
                  {preview.files.length} package files (including available
                  licenses)
                </summary>
                <pre>{preview.files.join("\n")}</pre>
              </details>
              <p>
                Installs to{" "}
                {project
                  ? `${project.path}/.agents/skills/${preview.skill.name}`
                  : "the selected project"}
                . Scripts are copied as resources and are not run during
                installation. Skills can guide agents within existing task
                permissions.
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I reviewed the instructions, source, and package files.
              </label>
              <button
                className="button primary"
                disabled={
                  !project ||
                  !reviewed ||
                  busy ||
                  installed.some(
                    (s) =>
                      s.projectId === project.id &&
                      s.installPath === `.agents/skills/${preview.skill.name}`,
                  )
                }
                onClick={async () => {
                  if (!project) return;
                  setBusy(true);
                  try {
                    const result = await call<Skill>("skill.install", {
                      token: preview.token,
                      projectId: project.id,
                      reviewed: true,
                    });
                    if (result) {
                      await refresh();
                      setPreview(undefined);
                      setReviewed(false);
                    }
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {!project
                  ? "Select a project to install"
                  : installed.some(
                        (s) =>
                          s.projectId === project.id &&
                          s.installPath ===
                            `.agents/skills/${preview.skill.name}`,
                      )
                    ? "Installed in project"
                    : `Install into ${project.name}`}
              </button>
            </section>
          )}
        </>
      )}
    </section>
  );
}
