import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { inside, sensitive } from "./security";
import type { Store } from "./store";
import type {
  EditorDocument,
  EditorVersion,
  Project,
} from "../../shared/types";

interface SavedVersion extends EditorVersion {
  version: 1;
  projectId: string;
  content: string;
}
const revision = (content: string) =>
  createHash("sha256").update(content).digest("hex");
export class EditorHistory {
  constructor(private store: Store) {}
  async read(project: Project, file: string): Promise<EditorDocument> {
    if (sensitive(file))
      throw new Error("Sensitive or generated files are excluded");
    const target = await inside(project.path, file);
    const info = await stat(target);
    if (!info.isFile() || info.size > 800000)
      throw new Error("File is binary or exceeds editor limit");
    const bytes = await readFile(target);
    const content = bytes.toString("utf8");
    if (
      content.length > 200000 ||
      content.includes("\0") ||
      !Buffer.from(content, "utf8").equals(bytes)
    )
      throw new Error("File is binary or exceeds editor limit");
    return { file, content, revision: revision(content) };
  }
  list(project: Project, file: string): EditorVersion[] {
    return this.store
      .all<SavedVersion>("editor-version")
      .filter((item) => item.projectId === project.id && item.file === file)
      .sort((a, b) => b.at.localeCompare(a.at))
      .map(({ id, file, at }) => ({ id, file, at }));
  }
  async write(
    project: Project,
    file: string,
    content: string,
    expectedRevision: string,
  ) {
    const previous = await this.read(project, file);
    if (previous.revision !== expectedRevision)
      throw new Error(
        "This file changed outside the editor. Reload it before saving or restoring.",
      );
    if (content.length > 200000 || content.includes("\0"))
      throw new Error("File is binary or exceeds editor limit");
    if (previous.content === content) return previous;
    const snapshot: SavedVersion = {
      version: 1,
      id: randomUUID(),
      projectId: project.id,
      file,
      content: previous.content,
      at: new Date().toISOString(),
    };
    this.store.put("editor-version", snapshot.id, snapshot);
    await writeFile(await inside(project.path, file), content, "utf8");
    const versions = this.store
      .all<SavedVersion>("editor-version")
      .filter((item) => item.projectId === project.id)
      .sort((a, b) => b.at.localeCompare(a.at));
    for (const item of versions.slice(20))
      this.store.remove("editor-version", item.id);
    return { file, content, revision: revision(content) };
  }
  async restore(
    project: Project,
    file: string,
    id: string,
    expectedRevision: string,
  ) {
    const snapshot = this.store.get<SavedVersion>("editor-version", id);
    if (
      !snapshot ||
      snapshot.version !== 1 ||
      snapshot.projectId !== project.id ||
      snapshot.file !== file
    )
      throw new Error("File version not found");
    return this.write(project, file, snapshot.content, expectedRevision);
  }
}
