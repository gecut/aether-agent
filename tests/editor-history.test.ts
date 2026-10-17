import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Store } from "../electron/core/store";
import { EditorHistory } from "../electron/core/editor-history";
import { Service } from "../electron/core/service";
import type { Invocation } from "../electron/providers/registry";
import { defaults, type Chat, type Run } from "../shared/types";
import { compile } from "../electron/core/prompts";
import { randomUUID } from "node:crypto";

let directory: string, store: Store, editor: EditorHistory;
const project = { id: "project", path: "", name: "Test", createdAt: "" };
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "aether-editor-"));
  project.path = path.join(directory, "project");
  await mkdir(project.path);
  store = new Store(path.join(directory, "data"));
  await store.open();
  editor = new EditorHistory(store);
});
afterEach(async () => {
  store.close();
  await rm(directory, { recursive: true, force: true });
});
it("restores previous saves and retains the newer version across restart", async () => {
  await writeFile(path.join(project.path, "a.ts"), "before");
  const original = await editor.read(project, "a.ts");
  const next = await editor.write(project, "a.ts", "after", original.revision);
  const version = editor.list(project, "a.ts")[0];
  store.close();
  await store.open();
  const restored = await editor.restore(
    project,
    "a.ts",
    version.id,
    next.revision,
  );
  expect(await readFile(path.join(project.path, "a.ts"), "utf8")).toBe(
    "before",
  );
  const newer = editor
    .list(project, "a.ts")
    .find((item) => item.id !== version.id)!;
  await editor.restore(project, "a.ts", newer.id, restored.revision);
  expect(await readFile(path.join(project.path, "a.ts"), "utf8")).toBe("after");
});
it("blocks stale writes, external edits, sensitive files and path escapes", async () => {
  await writeFile(path.join(project.path, "a.ts"), "before");
  const original = await editor.read(project, "a.ts");
  await editor.write(project, "a.ts", "after", original.revision);
  await expect(
    editor.write(project, "a.ts", "stale", original.revision),
  ).rejects.toThrow("changed outside");
  const version = editor.list(project, "a.ts")[0];
  await expect(
    editor.restore(
      { ...project, id: "other" },
      "a.ts",
      version.id,
      original.revision,
    ),
  ).rejects.toThrow("not found");
  await expect(editor.read(project, ".env")).rejects.toThrow("Sensitive");
  await writeFile(path.join(directory, "outside"), "private");
  await symlink(
    path.join(directory, "outside"),
    path.join(project.path, "link"),
  );
  await expect(editor.read(project, "link")).rejects.toThrow("boundary");
});
it("pins and deletes chats without affecting other sessions", async () => {
  const service = new Service(store);
  const chat: Chat = {
    id: randomUUID(),
    title: "Conversation",
    createdAt: "",
    updatedAt: "",
    messages: [],
    config: defaults,
  };
  store.put("chat", chat.id, chat);
  await service.command("chat.pin", { id: chat.id, pinned: true });
  expect(store.get<Chat>("chat", chat.id)?.pinned).toBe(true);
  await service.command("chat.delete", chat.id);
  expect(store.get("chat", chat.id)).toBeUndefined();
  await expect(service.command("chat.delete", chat.id)).rejects.toThrow(
    "not found",
  );
  await service.shutdown();
});
it("keeps chat actions made while a response is running", async () => {
  const service = new Service(store);
  let finish!: (result: { text: string }) => void;
  vi.spyOn(service.registry, "get").mockReturnValue({
    id: "codex",
    diagnose: async () => ({}) as never,
    run: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = service.sendChat("hello");
  const chat = store.all<Chat>("chat")[0];
  await expect(
    service.sendChat("duplicate while busy", chat.id),
  ).rejects.toThrow("current response");
  expect(store.get<Chat>("chat", chat.id)?.messages).toHaveLength(1);
  await service.command("chat.pin", { id: chat.id, pinned: true });
  finish({ text: "Hello" });
  await pending;
  expect(store.get<Chat>("chat", chat.id)?.pinned).toBe(true);
  const second = service.sendChat("follow up", chat.id);
  await service.command("chat.delete", chat.id);
  finish({ text: "Response after deletion" });
  await expect(second).rejects.toThrow("deleted while");
  expect(store.get("chat", chat.id)).toBeUndefined();
  await service.shutdown();
});

it("keeps project chat scoped, bounded, and read-only without losing saved history", async () => {
  const service = new Service(store);
  const p = await service.addProject(project.path);
  await writeFile(
    path.join(p.path, "README.md"),
    "# Focus project\nRead this project context.",
  );
  store.put("settings", "global", { ...defaults, efficiency: "economy" });
  const run = vi.fn(async (_input: Invocation) => ({
    text: "Explanation",
    usage: { input_tokens: 200 },
  }));
  vi.spyOn(service.registry, "get").mockReturnValue({
    id: "codex",
    diagnose: async () => ({}) as never,
    run,
  });
  const chat = await service.sendChat("Explain this project", undefined, p.id);
  expect(chat.projectId).toBe(p.id);
  expect(run.mock.calls[0][0]).toMatchObject({ mode: "plan", cwd: p.path });
  expect(run.mock.calls[0][0].prompt).toContain("Read this project context");
  expect(chat.messages[1].context?.estimatedTokens).toBeGreaterThan(0);
  expect(chat.messages[1].usage).toEqual({ input_tokens: 200 });
  expect(await service.command("chat.project", p.id)).toHaveLength(1);
  store.put("settings", "global", {
    ...defaults,
    apiUrl: "http://127.0.0.1:7777/v1",
  });
  await service.sendChat("Follow up with current settings", chat.id);
  expect(run.mock.calls.at(-1)![0].apiUrl).toBe("http://127.0.0.1:7777/v1");
  await expect(
    service.sendChat("switch", chat.id, randomUUID()),
  ).rejects.toThrow("switching projects");
  await service.shutdown();
});

it("disables helper inference in Economy while keeping the selected coding model", async () => {
  const service = new Service(store);
  const provider = vi.fn(async (_input: Invocation) => ({
    text: "Fixture result",
  }));
  vi.spyOn(service.registry, "get").mockReturnValue({
    id: "codex",
    diagnose: async () => ({}) as never,
    run: provider,
  });
  const run: Run = {
    id: randomUUID(),
    projectId: project.id,
    title: "Fixture",
    objective: "Fixture",
    tasks: [],
    status: "running",
    config: structuredClone(defaults),
    createdAt: "",
    updatedAt: "",
  };
  for (const mode of ["economy", "balanced", "thorough"] as const) {
    run.config.efficiency = mode;
    await service.invokeProvider(
      run,
      run.config.coder,
      "code",
      project.path,
      compile([]),
      new AbortController().signal,
    );
    const input = provider.mock.calls.at(-1)![0];
    expect(input.config).toEqual(defaults.coder);
    expect(input.team).toEqual(
      mode === "economy" ? undefined : { maxHelpers: 1 },
    );
  }
  await service.shutdown();
});
