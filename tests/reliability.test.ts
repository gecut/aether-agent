import { expect, it, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { binaryCandidates } from "../electron/providers/runtime";
import { safeEnv } from "../electron/core/security";
import { loginScript } from "../electron/providers/connections";
import { Store } from "../electron/core/store";
import { Service } from "../electron/core/service";
import { defaults, type Run, type Chat } from "../shared/types";
import {
  checkpointChat,
  matchesCheckpoint,
} from "../electron/core/chat-checkpoint";
import { git } from "../electron/core/repository";
import * as processTools from "../electron/core/process";
it("finds bundled and native Windows binaries with spaces without relying on cmd shims", () => {
  const candidates = binaryCandidates(
    "codex",
    "win32",
    {
      PATH: "C:\\Tools",
      APPDATA: "C:\\Users\\Test User\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\Test User\\AppData\\Local",
      ProgramFiles: "C:\\Program Files",
      SystemRoot: "C:\\Windows",
    },
    "C:\\Users\\Test User",
    "C:\\Aether\\resources\\provider-runtime",
  );
  expect(candidates[0]).toBe(
    "C:\\Aether\\resources\\provider-runtime\\codex.exe",
  );
  expect(candidates).toContain("C:\\Tools\\codex.exe");
  expect(candidates.every((file) => file.endsWith(".exe"))).toBe(true);
  expect(
    binaryCandidates(
      "agy",
      "win32",
      { ProgramFiles: "C:\\Program Files" },
      "C:\\Users\\Name",
    ),
  ).toContain("C:\\Program Files\\Google\\antigravity-cli\\agy.exe");
});
it("preserves required native auth environment without inheriting API credentials", () => {
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "private-test-key";
  try {
    expect(safeEnv()).not.toHaveProperty("OPENAI_API_KEY");
    expect(safeEnv().PATH).toContain(path.join(os.homedir(), ".local", "bin"));
  } finally {
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
  }
});
it("creates native Windows login/install scripts without changing execution policy", () => {
  const script = loginScript(
    "C:\\Program Files\\Codex\\codex.exe",
    "codex",
    "C:\\Users\\O'Neil\\Workspace",
    "win32",
  );
  expect(script.startsWith("@echo off\r\n")).toBe(true);
  const body = Buffer.from(
    script.match(/EncodedCommand ([A-Za-z0-9+/=]+)/)![1],
    "base64",
  ).toString("utf16le");
  expect(body).toContain("'C:\\Users\\O''Neil\\Workspace'");
  expect(body).toContain("'login'");
  expect(body).not.toContain("Bypass");
  expect(body).not.toContain("\b");
  const install = loginScript("agy", "antigravity", "C:\\Work", "win32", true);
  expect(
    Buffer.from(
      install.match(/EncodedCommand ([A-Za-z0-9+/=]+)/)![1],
      "base64",
    ).toString("utf16le"),
  ).toContain("https://antigravity.google/cli/install.cmd");
});
it("renders startup data before slow provider diagnostics finish", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "aether-startup-fast-"),
  );
  const store = new Store(directory);
  await store.open();
  const service = new Service(store);
  let finish!: (value: []) => void;
  const held = new Promise<[]>((resolve) => (finish = resolve));
  vi.spyOn(service.registry, "diagnostics").mockReturnValue(held);
  try {
    await service.initialize({ background: true });
    expect((await service.snapshot()).providers).toHaveLength(4);
    finish([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    finish([]);
    await service.shutdown();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
it("omits inactive history payloads without losing saved evidence or active details", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "aether-history-fast-"),
  );
  const store = new Store(directory);
  await store.open();
  try {
    const run: Run = {
      id: "one",
      projectId: "project",
      title: "Work",
      objective: "Work",
      status: "completed",
      createdAt: "now",
      updatedAt: "now",
      config: defaults,
      tasks: [
        {
          id: "task",
          title: "Task",
          role: "implementer",
          objective: "Work",
          acceptance: ["Works"],
          files: ["a.js"],
          dependencies: [],
          verification: "none",
          priority: 5,
          status: "completed",
          attempts: 1,
          output: "output".repeat(50000),
          snapshot: {
            text: "prompt".repeat(10000),
            hash: "hash",
            trace: [],
            estimatedTokens: 10000,
          },
        },
      ],
      patch: "diff".repeat(50000),
    };
    store.put("run", run.id, run);
    const chat: Chat = {
      id: "chat",
      title: "Chat",
      createdAt: "now",
      updatedAt: "now",
      config: defaults,
      messages: [
        { id: "m", role: "user", at: "now", content: "history".repeat(50000) },
      ],
    };
    store.put("chat", chat.id, chat);
    const small = store.uiRecords<Run>("run");
    expect(small[0].tasks[0].output).toBeUndefined();
    expect(small[0].tasks[0].snapshot).toBeUndefined();
    expect(small[0].tasks[0].status).toBe("completed");
    expect(JSON.stringify(small).length).toBeLessThan(
      JSON.stringify(run).length / 100,
    );
    expect(store.uiRecords<Run>("run", run.id)[0].patch).toBe(run.patch);
    expect(store.uiRecords<Chat>("chat")[0].messages).toEqual([]);
    expect(store.uiRecords<Chat>("chat", chat.id)[0].messages).toEqual(
      chat.messages,
    );
    expect(store.get<Run>("run", run.id)).toEqual(run);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
it("checkpoints many changed files with bounded Git process count and exact blob contents", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "aether-bulk-checkpoint-"),
  );
  const store = new Store(path.join(directory, "data"));
  await store.open();
  const service = new Service(store);
  await mkdir(path.join(directory, "project"));
  const spy = vi.spyOn(processTools, "execute");
  try {
    const project = await service.addProject(path.join(directory, "project"));
    for (let i = 0; i < 30; i++)
      await writeFile(
        path.join(project.path, `file-${i}.js`),
        `export const value = ${i};\n`,
      );
    spy.mockClear();
    const checkpoint = await checkpointChat(
      store,
      project,
      "11111111-1111-4111-8111-111111111111",
    );
    expect(
      spy.mock.calls.filter(([binary]) => binary === "git").length,
    ).toBeLessThan(24);
    for (const i of [0, 15, 29])
      expect(
        await git(project.path, ["show", `${checkpoint.commit}:file-${i}.js`]),
      ).toBe(`export const value = ${i};\n`);
    expect(
      await matchesCheckpoint(project.path, checkpoint.commit, ["*"]),
    ).toBe(true);
  } finally {
    spy.mockRestore();
    await service.shutdown();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
it("rediscovers installed runtimes when verifying after first-device setup", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "aether-install-verify-"),
  );
  const store = new Store(directory);
  await store.open();
  const service = new Service(store);
  const providers = await service.registry.detect();
  const claude = providers.find((provider) => provider.id === "claude")!;
  claude.installed = true;
  vi.spyOn(service.connections, "verify").mockResolvedValue({
    provider: "claude",
    state: "signed-in",
    message: "Verified",
    checkedAt: "now",
  });
  const diagnostics = vi
    .spyOn(service.registry, "diagnostics")
    .mockResolvedValue(providers);
  try {
    await service.command("provider.verify", "claude");
    expect(diagnostics).toHaveBeenCalledOnce();
    expect(
      (await service.snapshot()).providers.find(
        (provider) => provider.id === "claude",
      )?.installed,
    ).toBe(true);
  } finally {
    await service.shutdown();
    store.close();
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  }
});
