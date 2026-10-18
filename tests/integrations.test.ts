import { Service } from "../electron/core/service";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../electron/core/store";
import {
  TelegramIntegration,
  decisionFingerprint,
} from "../electron/integrations/telegram";
import {
  GitHubIntegration,
  githubLoginScript,
} from "../electron/integrations/github";
import { encryptedIntegrationSecret } from "../electron/integrations/secrets";
import { defaults, type Run } from "../shared/types";
import type { TelegramConnection } from "../shared/integrations";
let directory: string, store: Store, telegram: TelegramIntegration;
const token = "123456:fixture_bot_token_never_a_real_credential";
let secret: string | undefined,
  run: Run,
  sent: { method: string; body: any }[],
  decide: ReturnType<typeof vi.fn>,
  audit: ReturnType<typeof vi.fn>;
let failMethod: string | undefined;
const recipient = { userId: 123, chatId: 123, name: "@fixture" };
function state(patch: Partial<TelegramConnection> = {}) {
  store.put("integration", "telegram", {
    version: 1,
    configured: true,
    enabled: true,
    remoteDecisions: true,
    recipient,
    message: "Connected",
    ...patch,
  });
}
const request: typeof fetch = async (input, options) => {
  const method = String(input).split("/").at(-1)!;
  const body = JSON.parse(options?.body as string);
  sent.push({ method, body });
  if (method === "getUpdates")
    return new Promise((_resolve, reject) => {
      if (options?.signal?.aborted) reject(new Error("aborted"));
      else
        options?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
    });
  if (method === failMethod)
    return new Response(JSON.stringify({ ok: false, error_code: 409 }), {
      status: 409,
    });
  const result =
    method === "getMe"
      ? { is_bot: true, username: "aether_fixture_bot" }
      : method === "getWebhookInfo"
        ? { url: "" }
        : method === "sendMessage"
          ? { message_id: sent.length }
          : true;
  return new Response(JSON.stringify({ ok: true, result }));
};
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "aether-integrations-"));
  store = new Store(directory);
  await store.open();
  secret = token;
  sent = [];
  failMethod = undefined;
  run = {
    id: "run",
    projectId: "project",
    title: "Fixture",
    objective: "Fixture",
    status: "awaiting_approval",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: structuredClone(defaults),
    plan: {
      title: "Implement greeting",
      summary: "Change and verify greeting",
      tasks: [],
    },
    tasks: [
      {
        id: "task",
        title: "Change greeting",
        objective: "Greet Ada",
        role: "implementer",
        files: ["src/greeting.js"],
        acceptance: ["Greets Ada"],
        dependencies: [],
        verification: "node --test",
        priority: 5,
        status: "queued",
        attempts: 0,
      },
    ],
  };
  decide = vi.fn(async (_action: string, _id: string) => {});
  audit = vi.fn();
  telegram = new TelegramIntegration(
    store,
    {
      get: () => secret,
      set: (value) => {
        secret = value;
      },
      remove: () => {
        secret = undefined;
      },
    },
    {
      runs: () => [run],
      run: () => structuredClone(run),
      projectName: () => "Fixture project",
      decide,
      audit,
    },
    request,
  );
});
afterEach(async () => {
  await telegram.shutdown();
  store.close();
  await rm(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});
function msg(text: string, id = 123, type = "private") {
  return {
    update_id: 1,
    message: {
      message_id: 2,
      chat: { id, type },
      from: { id, first_name: "Fixture", username: "fixture" },
      text,
    },
  };
}
async function status() {
  await telegram.handleUpdate(msg("/status"));
}
function button(label: string) {
  const message = sent
    .filter(
      (item) =>
        item.method === "sendMessage" &&
        item.body.reply_markup?.inline_keyboard.some((row: any[]) =>
          row.some((item) => item.text === label),
        ),
    )
    .at(-1)!;
  expect(message, `button ${label}`).toBeTruthy();
  const id = message.body.reply_markup.inline_keyboard
    .flat()
    .find((item: any) => item.text === label).callback_data;
  const entry = store.get<any>("telegram-button", id.slice(2));
  return { id, entry };
}
async function click(label: string, patch: Record<string, unknown> = {}) {
  const b = button(label);
  await telegram.handleUpdate({
    update_id: 2,
    callback_query: {
      id: "callback",
      from: { id: 123, first_name: "Fixture" },
      data: b.id,
      message: {
        message_id: b.entry.messageId,
        chat: { id: 123, type: "private" },
      },
      ...patch,
    },
  });
  return b;
}
it("requires private code pairing and desktop confirmation before sending notifications", async () => {
  await telegram.configure(token);
  const s = telegram.status();
  expect(s.pairingCode).toHaveLength(32);
  expect(s.enabled).toBe(false);
  await telegram.handleUpdate(msg(`/start ${s.pairingCode}`, 123, "group"));
  expect(telegram.status().pendingRecipient).toBeUndefined();
  await telegram.handleUpdate(msg("/start wrong"));
  expect(telegram.status().pendingRecipient).toBeUndefined();
  await telegram.handleUpdate(msg(`/start ${s.pairingCode}`));
  expect(telegram.status().pendingRecipient?.userId).toBe(123);
  expect(sent.filter((s) => s.method === "sendMessage")).toHaveLength(0);
  await telegram.confirm();
  expect(telegram.status().recipient?.chatId).toBe(123);
  expect(telegram.status().remoteDecisions).toBe(false);
  expect(telegram.status().pairingCode).toBeUndefined();
  expect(JSON.stringify(store.all("integration"))).not.toContain(token);
});
it("does not remove another app's webhook and sanitizes API failures", async () => {
  failMethod = "getWebhookInfo";
  await expect(telegram.configure(token)).rejects.toThrow("in use elsewhere");
  expect(sent.some((s) => s.method === "deleteWebhook")).toBe(false);
  expect(JSON.stringify(telegram.status())).not.toContain(token);
});
it("blocks expired pairing and unknown recipients, group chats and arbitrary task text", async () => {
  state({
    enabled: false,
    recipient: undefined,
    pairingCode: "expired",
    pairingExpiresAt: Date.now() - 1,
    pendingRecipient: recipient,
  });
  await expect(telegram.confirm()).rejects.toThrow("pairing command");
  state();
  await telegram.handleUpdate(msg("/status", 999));
  await telegram.handleUpdate(msg("/status", 123, "group"));
  await telegram.handleUpdate(msg("create and deploy a project"));
  expect(sent).toHaveLength(0);
  expect(decide).not.toHaveBeenCalled();
});
it("delivers full scoped plan before issuing decision buttons and uses at-most-once decisions", async () => {
  state();
  await status();
  expect(
    sent
      .filter((s) => s.method === "sendMessage")
      .some((s) => s.body.text.includes("Status: awaiting approval")),
  ).toBe(true);
  expect(
    sent.some((s) =>
      s.body.reply_markup?.inline_keyboard
        .flat()
        .some((b: any) => b.text === "Approve & run"),
    ),
  ).toBe(false);
  await click("Review plan");
  const details = sent.find(
    (s) => s.method === "sendMessage" && s.body.text.includes("PLAN REVIEW"),
  )!;
  expect(details.body.text).toContain("src/greeting.js");
  expect(details.body.text).toContain("node --test");
  expect(details.body.text).toContain("isolated worktrees");
  const approved = await click("Approve & run");
  expect(decide).toHaveBeenCalledWith("approve", "run");
  expect(audit).toHaveBeenCalledOnce();
  await telegram.handleUpdate({
    update_id: 3,
    callback_query: {
      id: "duplicate",
      from: { id: 123, first_name: "Fixture" },
      data: approved.id,
      message: {
        message_id: approved.entry.messageId,
        chat: { id: 123, type: "private" },
      },
    },
  });
  expect(decide).toHaveBeenCalledOnce();
});
it("rejects mismatched users, chats, message identities, expired and stale buttons", async () => {
  state();
  await status();
  await click("Review plan");
  await click("Approve & run", { from: { id: 999, first_name: "Intruder" } });
  await click("Approve & run", {
    message: { message_id: 999, chat: { id: 123, type: "private" } },
  });
  await click("Approve & run", {
    message: {
      message_id: button("Approve & run").entry.messageId,
      chat: { id: 456, type: "private" },
    },
  });
  expect(decide).not.toHaveBeenCalled();
  run.tasks[0].files = ["different.js"];
  await click("Approve & run");
  expect(decide).not.toHaveBeenCalled();
  expect(
    sent.filter((s) => s.method === "answerCallbackQuery").at(-1)?.body.text,
  ).toContain("changed");
  await status();
  await click("Review plan");
  const b = button("Approve & run");
  store.put("telegram-button", b.entry.id, {
    ...b.entry,
    expires: Date.now() - 1,
  });
  await click("Approve & run");
  expect(decide).not.toHaveBeenCalled();
});
it("persists consumed tokens and ignores old buttons after recipient replacement", async () => {
  state();
  await status();
  await click("Review plan");
  const b = button("Approve & run");
  state({ recipient: { userId: 456, chatId: 456, name: "other" } });
  await click("Approve & run");
  expect(decide).not.toHaveBeenCalled();
  state();
  await click("Approve & run");
  expect(store.get<any>("telegram-button", b.entry.id).used).toBe(true);
});
it("honors disabled remote decisions even for already-issued review buttons", async () => {
  state();
  await status();
  await click("Review plan");
  state({ remoteDecisions: false });
  await click("Approve & run");
  expect(decide).not.toHaveBeenCalled();
});
it("requires complete change review before apply and preserves normal host validation failures", async () => {
  state();
  run.status = "awaiting_review";
  run.patch = "diff --git a/greeting.js b/greeting.js\n+hello";
  run.review = "Verified greeting";
  run.verification = [
    {
      command: "node --test",
      exitCode: 0,
      output: "passed",
      at: new Date().toISOString(),
      durationMs: 1,
    },
  ];
  await status();
  await click("Review changes");
  expect(
    sent.find((s) => s.body.text?.includes("CHANGE REVIEW"))?.body.text,
  ).toContain(run.patch);
  decide.mockRejectedValueOnce(new Error("Original project changed"));
  await click("Apply to original project");
  expect(decide).toHaveBeenCalledWith("apply", "run");
  expect(
    sent.filter((s) => s.method === "answerCallbackQuery").at(-1)?.body.text,
  ).toContain("safety checks");
});
it("withholds remote approval for oversized or failed review delivery", async () => {
  state();
  run.tasks[0].objective = "x".repeat(25000);
  await status();
  await click("Review plan");
  expect(sent.some((s) => s.body.text?.includes("too large"))).toBe(true);
  expect(
    store.all<any>("telegram-button").some((b) => b.action === "approve"),
  ).toBe(false);
  run.tasks[0].objective = "Small";
  await status();
  failMethod = "sendMessage";
  await click("Review plan");
  expect(
    store.all<any>("telegram-button").some((b) => b.action === "approve"),
  ).toBe(false);
});
it("routes stop and reject through their fixed host actions and pauses all DM commands", async () => {
  state();
  run.status = "running";
  await status();
  await click("Stop session");
  expect(decide).toHaveBeenCalledWith("stop", "run");
  run.status = "awaiting_approval";
  await status();
  await click("Review plan");
  await click("Reject plan");
  expect(decide).toHaveBeenCalledWith("reject", "run");
  await telegram.preferences(false, false);
  sent = [];
  await status();
  expect(sent).toHaveLength(0);
  await telegram.disconnect();
  expect(secret).toBeUndefined();
  expect(store.all("telegram-button")).toHaveLength(0);
});
it("changes decision fingerprints when scopes, verification, models or review artifacts change", () => {
  const before = decisionFingerprint(run);
  run.config.coder.model = "other";
  expect(decisionFingerprint(run)).not.toBe(before);
  const model = decisionFingerprint(run);
  run.tasks[0].verification = "npm test";
  expect(decisionFingerprint(run)).not.toBe(model);
});
it("encrypts secrets outside metadata and refuses plaintext Linux keyring fallback", async () => {
  const vault = encryptedIntegrationSecret(directory, {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value).reverse(),
    decryptString: (value) => Buffer.from(value).reverse().toString(),
  });
  vault.set(token);
  expect(
    (await readFile(path.join(directory, "telegram-bot.enc"))).toString(),
  ).not.toContain(token);
  expect(vault.get()).toBe(token);
  vault.remove();
  expect(vault.get()).toBeUndefined();
  const insecure = encryptedIntegrationSecret(directory, {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "basic_text",
    encryptString: Buffer.from,
    decryptString: (value) => value.toString(),
  });
  expect(() => insecure.set(token)).toThrow("keyring");
});
it("verifies the real GitHub account endpoint without extracting tokens and lists only validated repo URLs", async () => {
  const commands: string[][] = [];
  const exec = vi.fn(async (_binary: string, args: string[]) => {
    commands.push(args);
    return {
      code: 0,
      stderr: "",
      durationMs: 1,
      stdout:
        args[0] === "api"
          ? "fixture-user\n"
          : JSON.stringify([
              {
                nameWithOwner: "fixture/repository",
                url: "https://github.com/fixture/repository",
                isPrivate: true,
              },
            ]),
    };
  });
  const launch = vi.fn();
  const github = new GitHubIntegration(
    store,
    launch,
    exec,
    async () => "/path with spaces/gh",
  );
  expect((await github.connect()).state).toBe("connected");
  expect(launch).not.toHaveBeenCalled();
  expect((await github.repositories())[0].isPrivate).toBe(true);
  expect(commands.flat()).not.toContain("token");
  exec.mockResolvedValueOnce({
    code: 1,
    stderr: "sensitive diagnostic",
    stdout: "",
    durationMs: 1,
  });
  expect((await github.verify()).state).toBe("signed-out");
  expect(github.status().message).not.toContain("sensitive diagnostic");
});
it("handles absent GitHub CLI and safely quotes official browser sign-in on Windows and Unix", async () => {
  const github = new GitHubIntegration(
    store,
    vi.fn(),
    undefined,
    async () => undefined,
  );
  expect((await github.connect()).state).toBe("unavailable");
  expect(
    githubLoginScript("/path's/gh", "/login's folder", "darwin"),
  ).toContain("'\\''");
  const windows = githubLoginScript(
    "C:\\Program Files\\gh.exe",
    "C:\\Aether Login",
    "win32",
  );
  expect(windows).toContain("-EncodedCommand");
  expect(
    Buffer.from(windows.split("-EncodedCommand ")[1].trim(), "base64").toString(
      "utf16le",
    ),
  ).toContain("'--web'");
});
it("coalesces activity, retries delivery after an outage and resumes notifications after pause", async () => {
  vi.useFakeTimers();
  try {
    state();
    const event = {
      seq: 1,
      runId: run.id,
      type: "task.completed",
      text: "Finished",
      at: new Date().toISOString(),
    };
    telegram.changed(event);
    telegram.changed(event);
    failMethod = "sendMessage";
    await vi.advanceTimersByTimeAsync(1100);
    expect(telegram.status().error).toContain("in use elsewhere");
    failMethod = undefined;
    await vi.advanceTimersByTimeAsync(15100);
    expect(sent.filter((item) => item.method === "sendMessage")).toHaveLength(
      2,
    );
    telegram.changed(event);
    await vi.advanceTimersByTimeAsync(1100);
    expect(sent.filter((item) => item.method === "sendMessage")).toHaveLength(
      2,
    );
    run.tasks[0].status = "running";
    telegram.changed(event);
    await telegram.preferences(false, false);
    await telegram.preferences(true, true);
    telegram.changed(event);
    await vi.advanceTimersByTimeAsync(1100);
    expect(sent.filter((item) => item.method === "sendMessage")).toHaveLength(
      3,
    );
  } finally {
    await telegram.shutdown();
    vi.useRealTimers();
  }
});
it("waits for Telegram flood control and retries only the rejected message", async () => {
  vi.useFakeTimers();
  let attempts = 0;
  const limited: typeof fetch = async (input, options) => {
    if (String(input).endsWith("/sendMessage") && attempts++ === 0)
      return new Response(
        JSON.stringify({
          ok: false,
          error_code: 429,
          parameters: { retry_after: 1 },
        }),
        { status: 429 },
      );
    return request(input, options);
  };
  const transport = new TelegramIntegration(
    store,
    { get: () => token, set: () => {}, remove: () => {} },
    {
      runs: () => [run],
      run: () => run,
      projectName: () => "Fixture",
      decide,
      audit,
    },
    limited,
  );
  try {
    state();
    const work = transport.handleUpdate(msg("/status"));
    await vi.advanceTimersByTimeAsync(1100);
    await work;
    expect(attempts).toBe(2);
    expect(sent.filter((item) => item.method === "sendMessage")).toHaveLength(
      1,
    );
  } finally {
    await transport.shutdown();
    vi.useRealTimers();
  }
});

it("serializes desktop/remote session decisions and releases the guard after failures", async () => {
  const service = new Service(store);
  let finish!: (run: Run) => void;
  const apply = vi.spyOn(service, "apply").mockImplementation(
    () =>
      new Promise<Run>((resolve) => {
        finish = resolve;
      }),
  );
  const reject = vi.spyOn(service, "reject").mockResolvedValue(run);
  try {
    const first = service.command("run.apply", "run");
    await expect(service.command("run.reject", "run")).rejects.toThrow(
      "Another decision",
    );
    expect(reject).not.toHaveBeenCalled();
    finish(run);
    await first;
    apply.mockRejectedValueOnce(new Error("Original project changed"));
    await expect(service.command("run.apply", "run")).rejects.toThrow(
      "Original project changed",
    );
    await service.command("run.reject", "run");
    expect(reject).toHaveBeenCalledOnce();
  } finally {
    await service.shutdown();
  }
});
