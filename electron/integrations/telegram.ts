import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { redact } from "../core/security";
import type { Store } from "../core/store";
import type { Run, RunEvent } from "../../shared/types";
import type { TelegramConnection } from "../../shared/integrations";
import type { IntegrationSecrets } from "./secrets";
type Action = "status" | "details" | "approve" | "apply" | "reject" | "stop";
interface Button {
  version: 1;
  id: string;
  runId: string;
  action: Action;
  fingerprint: string;
  userId: number;
  chatId: number;
  messageId?: number;
  expires: number;
  used: boolean;
}
interface Host {
  runs(): Run[];
  run(id: string): Run;
  projectName(id: string): string;
  decide(
    action: "approve" | "apply" | "reject" | "stop",
    runId: string,
  ): Promise<unknown>;
  audit(runId: string, message: string): void;
}
const user = z.object({
  id: z.number().int().positive().safe(),
  first_name: z.string().max(256),
  username: z.string().max(64).optional(),
  is_bot: z.boolean().optional(),
});
const message = z.object({
  message_id: z.number().int(),
  date: z.number().optional(),
  chat: z.object({ id: z.number().int().safe(), type: z.string() }),
  from: user.optional(),
  text: z.string().max(10000).optional(),
});
const update = z.object({
  update_id: z.number().int(),
  message: message.optional(),
  callback_query: z
    .object({
      id: z.string().max(256),
      from: user,
      data: z.string().max(64).optional(),
      message: message.optional(),
    })
    .optional(),
});
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function decisionFingerprint(run: Run) {
  return hash({
    status: run.status,
    plan: run.plan,
    config: run.config,
    head: run.head,
    sourceCheckpoint: run.sourceCheckpoint,
    workspace: run.workspace,
    patch: run.patch,
    review: run.review,
    verification: run.verification,
    tasks: run.tasks.map(
      ({
        id,
        title,
        objective,
        role,
        files,
        acceptance,
        dependencies,
        verification,
        model,
        status,
        tests,
        priority,
        commit,
      }) => ({
        id,
        title,
        objective,
        role,
        files,
        acceptance,
        dependencies,
        verification,
        model,
        status,
        tests,
        priority,
        commit,
      }),
    ),
  });
}
export class TelegramIntegration {
  private controller?: AbortController;
  private polling?: Promise<void>;
  private sending: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private pending = new Set<string>();
  private closing = false;
  private settingUp = false;
  constructor(
    private store: Store,
    private secrets: IntegrationSecrets,
    private host: Host,
    private request: typeof fetch = fetch,
  ) {}
  status(): TelegramConnection {
    const state = this.state();
    if (state.pairingExpiresAt && state.pairingExpiresAt < Date.now()) {
      delete state.pairingCode;
      delete state.pendingRecipient;
      delete state.pairingExpiresAt;
    }
    return state;
  }
  private state(): TelegramConnection {
    return (
      this.store.get("integration", "telegram") ?? {
        version: 1,
        configured: false,
        enabled: false,
        remoteDecisions: false,
        message:
          "Connect a dedicated Telegram bot to receive project activity in your private DM.",
      }
    );
  }
  private save(patch: Partial<TelegramConnection>) {
    const previous = this.state();
    const state = { ...previous, ...patch };
    if (JSON.stringify(state) !== JSON.stringify(previous))
      this.store.put("integration", "telegram", state);
    return state;
  }
  private async api(
    method: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
    retry = false,
  ): Promise<any> {
    const token = this.secrets.get();
    if (!token) throw new Error("Telegram bot is not configured.");
    try {
      const response = await this.request(
        `https://api.telegram.org/bot${token}/${method}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          redirect: "error",
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(40000)])
            : AbortSignal.timeout(15000),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (result.error_code === 429 && method === "sendMessage" && !retry) {
          const delay =
            Math.min(
              60,
              Math.max(1, Number(result.parameters?.retry_after) || 3),
            ) * 1000;
          await new Promise<void>((resolve, reject) => {
            if (signal?.aborted) {
              reject(new Error("Cancelled"));
              return;
            }
            const done = () => {
              signal?.removeEventListener("abort", abort);
              resolve();
            };
            const abort = () => {
              clearTimeout(timer);
              signal?.removeEventListener("abort", abort);
              reject(new Error("Cancelled"));
            };
            const timer = setTimeout(done, delay);
            signal?.addEventListener("abort", abort, { once: true });
          });
          return this.api(method, body, signal, true);
        }
        const error = new Error(
          result.error_code === 409
            ? "Telegram bot is in use elsewhere. Use a dedicated bot without a webhook or another polling app."
            : `Telegram request failed (${Number(result.error_code) || response.status}). Check the bot token, DM and connection.`,
        );
        Object.assign(error, {
          retryAfter: Math.min(
            60,
            Math.max(1, Number(result.parameters?.retry_after) || 3),
          ),
        });
        throw error;
      }
      return result.result;
    } catch (error) {
      if (error instanceof Error && /^Telegram /.test(error.message))
        throw error;
      throw new Error(
        "Telegram connection interrupted. Check your network and bot access.",
      );
    }
  }
  async configure(token: string) {
    if (this.settingUp) throw new Error("Telegram setup is already running.");
    if (this.closing) throw new Error("Aether is closing.");
    this.settingUp = true;
    try {
      await this.stop();
      this.save({ enabled: false, remoteDecisions: false });
      this.secrets.set(token);
      this.save({
        configured: true,
        enabled: false,
        remoteDecisions: false,
        recipient: undefined,
        pendingRecipient: undefined,
        pairingCode: undefined,
        pairingExpiresAt: undefined,
        bot: undefined,
        error: undefined,
      });
      this.store.remove("integration-private", "telegram-offset");
      const bot = z
        .object({
          is_bot: z.literal(true),
          username: z.string().regex(/^[a-zA-Z0-9_]{5,32}$/),
        })
        .parse(await this.api("getMe", {}));
      const webhook = await this.api("getWebhookInfo", {});
      if (webhook.url)
        throw new Error(
          "Telegram bot has an active webhook. Use a dedicated bot; Aether will not remove another app's webhook.",
        );
      const code = randomBytes(16).toString("hex");
      this.save({
        bot: bot.username,
        pairingCode: code,
        pairingExpiresAt: Date.now() + 10 * 60 * 1000,
        message:
          "Send the pairing command to your bot in a private DM, then confirm the recipient here.",
      });
      this.start();
      return this.status();
    } catch (error) {
      this.save({
        error:
          error instanceof Error ? error.message : "Telegram setup failed.",
        message: "Telegram setup needs attention.",
      });
      throw error;
    } finally {
      this.settingUp = false;
    }
  }
  async confirm() {
    if (this.settingUp) throw new Error("Wait for Telegram setup to finish.");
    const state = this.status();
    if (
      !state.pendingRecipient ||
      !state.pairingCode ||
      !state.pairingExpiresAt ||
      state.pairingExpiresAt < Date.now()
    )
      throw new Error("Send the current pairing command to your bot first.");
    this.save({
      recipient: state.pendingRecipient,
      pendingRecipient: undefined,
      pairingCode: undefined,
      pairingExpiresAt: undefined,
      enabled: true,
      remoteDecisions: false,
      error: undefined,
      message:
        "Private DM connected. Notifications are enabled; remote decisions are optional.",
    });
    await this.sendText(
      "Aether is connected. Use /status to see live work or /pending for decisions. Remote decisions must be enabled in Aether settings.",
    );
    this.queueCurrent();
    return this.status();
  }
  async preferences(enabled: boolean, remoteDecisions: boolean) {
    if (this.settingUp) throw new Error("Wait for Telegram setup to finish.");
    if (!this.state().recipient)
      throw new Error("Pair and confirm your private DM first.");
    await this.stop();
    this.save({
      enabled,
      remoteDecisions: enabled && remoteDecisions,
      error: undefined,
      message: enabled
        ? "Telegram activity notifications are enabled."
        : "Telegram is paused. No notifications or remote commands will be processed.",
    });
    if (enabled) this.start();
    return this.status();
  }
  async disconnect() {
    if (this.settingUp) throw new Error("Wait for Telegram setup to finish.");
    await this.stop();
    this.secrets.remove();
    this.store.remove("integration", "telegram");
    this.store.remove("integration-private", "telegram-offset");
    for (const button of this.store.all<Button>("telegram-button"))
      this.store.remove("telegram-button", button.id, false);
    this.store.flush();
    return this.status();
  }
  start() {
    const state = this.status();
    if (
      this.closing ||
      this.polling ||
      !state.configured ||
      (!state.enabled &&
        !(state.pairingCode && state.pairingExpiresAt! > Date.now()))
    )
      return;
    const controller = new AbortController();
    this.controller = controller;
    this.polling = this.poll(controller.signal).finally(() => {
      this.polling = undefined;
    });
    if (state.enabled) this.queueCurrent();
  }
  private queueCurrent() {
    for (const run of this.host
      .runs()
      .filter((run) =>
        [
          "initializing",
          "running",
          "retrying",
          "awaiting_approval",
          "awaiting_review",
          "blocked",
          "failed",
        ].includes(run.status),
      )
      .slice(0, 20))
      this.pending.add(run.id);
    if (this.pending.size) this.schedule();
  }
  private async stop() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending.clear();
    this.controller?.abort();
    await this.polling;
    await this.sending;
  }
  async shutdown() {
    this.closing = true;
    await this.stop();
  }
  private enqueue(work: () => Promise<void>) {
    this.sending = this.sending.then(work).catch((error) => {
      if (!this.closing)
        this.save({
          error:
            error instanceof Error
              ? error.message
              : "Telegram delivery failed.",
        });
    });
    return this.sending;
  }
  changed(event: RunEvent) {
    if (
      this.closing ||
      !/^(plan\.created|run\.|task\.|approval\.|test\.completed|review\.completed|changes\.restored)/.test(
        event.type,
      ) ||
      !this.state().enabled
    )
      return;
    if (this.pending.size < 50) this.pending.add(event.runId);
    this.schedule();
  }
  private schedule(delay = 1000) {
    if (this.timer || this.closing || this.controller?.signal.aborted) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const ids = [...this.pending];
      this.pending.clear();
      void this.enqueue(async () => {
        for (let i = 0; i < ids.length; i++) {
          try {
            await this.activity(this.host.run(ids[i]));
          } catch (error) {
            if (error instanceof Error && error.message === "Session not found")
              continue;
            if (!this.closing && !this.controller?.signal.aborted) {
              for (const id of ids.slice(i))
                if (this.pending.size < 50) this.pending.add(id);
              this.schedule(
                Math.max(
                  15000,
                  ((error as { retryAfter?: number }).retryAfter ?? 0) * 1000,
                ),
              );
            }
            throw error;
          }
        }
      });
    }, delay);
  }
  private async poll(signal: AbortSignal) {
    while (!signal.aborted) {
      const state = this.status();
      if (!state.enabled && !state.pairingCode) break;
      try {
        const offset =
          this.store.get<number>("integration-private", "telegram-offset") ?? 0;
        const updates = z
          .array(update)
          .max(100)
          .parse(
            await this.api(
              "getUpdates",
              {
                offset,
                timeout: 25,
                limit: 25,
                allowed_updates: ["message", "callback_query"],
              },
              signal,
            ),
          );
        for (const item of updates) {
          if (signal.aborted) break;
          // Acknowledge before dispatch; decision tokens persist separately for at-most-once execution.
          this.store.put(
            "integration-private",
            "telegram-offset",
            item.update_id + 1,
          );
          await this.enqueue(() => this.handleUpdate(item));
        }
        if (!signal.aborted && this.state().error)
          this.save({ error: undefined });
      } catch (error) {
        if (signal.aborted) break;
        this.save({
          error:
            error instanceof Error ? error.message : "Telegram polling failed.",
        });
        const delay = Math.min(
          60000,
          ((error as { retryAfter?: number }).retryAfter ?? 5) * 1000,
        );
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
          };
          const timer = setTimeout(done, delay);
          signal.addEventListener("abort", done, { once: true });
        });
      }
    }
  }
  async handleUpdate(input: unknown) {
    const parsed = update.safeParse(input);
    if (!parsed.success || this.closing) return;
    const item = parsed.data,
      state = this.status(),
      msg = item.message;
    if (msg && msg.chat.type === "private" && msg.from && !msg.from.is_bot) {
      if (
        state.pairingCode &&
        state.pairingExpiresAt! > Date.now() &&
        msg.text === `/start ${state.pairingCode}` &&
        msg.chat.id === msg.from.id
      ) {
        this.save({
          pendingRecipient: {
            userId: msg.from.id,
            chatId: msg.chat.id,
            name: msg.from.username
              ? "@" + msg.from.username
              : msg.from.first_name,
          },
          message:
            "Pairing request received. Confirm this Telegram recipient in Aether.",
        });
        return;
      }
      if (
        !state.enabled ||
        !state.recipient ||
        msg.chat.id !== state.recipient.chatId ||
        msg.from.id !== state.recipient.userId
      )
        return;
      if (/^\/(status|pending)(?:@\w+)?$/.test(msg.text ?? "")) {
        const pending = msg.text!.startsWith("/pending");
        const runs = this.host
          .runs()
          .filter((run) =>
            pending
              ? ["awaiting_approval", "awaiting_review"].includes(run.status)
              : !["completed", "cancelled"].includes(run.status),
          )
          .slice(0, 8);
        if (!runs.length)
          await this.sendText(
            pending
              ? "No decisions are waiting."
              : "Aether is idle. No active or waiting sessions.",
          );
        for (const run of runs)
          await this.activity(this.host.run(run.id), true);
      } else if (/^\/(start|help)(?:@\w+)?$/.test(msg.text ?? ""))
        await this.sendText(
          "Aether controls: /status shows current sessions; /pending shows decisions. Review a plan or diff before approving. Aether must be running on your computer. Messages here do not start new coding tasks.",
        );
      return;
    }
    const callback = item.callback_query;
    if (!callback) return;
    const token = callback.data?.match(/^a:([a-f0-9]{24})$/)?.[1];
    const button = token
      ? this.store.get<Button>("telegram-button", token)
      : undefined;
    let acknowledged = false;
    let answer =
      "This button is unavailable or expired. Use /status for current actions.";
    try {
      if (
        !state.enabled ||
        !state.recipient ||
        !button ||
        button.used ||
        button.expires < Date.now() ||
        callback.from.is_bot ||
        callback.from.id !== state.recipient.userId ||
        callback.from.id !== button.userId ||
        callback.message?.chat.type !== "private" ||
        callback.message.chat.id !== state.recipient.chatId ||
        callback.message.chat.id !== button.chatId ||
        callback.message.message_id !== button.messageId
      )
        return;
      const run = this.host.run(button.runId);
      if (button.fingerprint !== decisionFingerprint(run)) {
        answer = "This session changed. Use /status and review it again.";
        return;
      }
      this.store.put("telegram-button", button.id, { ...button, used: true });
      if (button.action === "status" || button.action === "details") {
        await this.api("answerCallbackQuery", {
          callback_query_id: callback.id,
          text: "Preparing the current session details…",
        }).catch(() => {});
        acknowledged = true;
      }
      if (button.action === "status") {
        await this.activity(run, true);
        answer = "Current status sent.";
        return;
      }
      if (button.action === "details") {
        await this.details(run);
        answer = "Review details sent.";
        return;
      }
      if (!state.remoteDecisions) {
        answer = "Enable remote decisions in Aether settings first.";
        return;
      }
      const allowed =
        button.action === "approve"
          ? run.status === "awaiting_approval"
          : button.action === "apply"
            ? run.status === "awaiting_review"
            : button.action === "reject"
              ? ["awaiting_approval", "awaiting_review"].includes(run.status)
              : ["running", "initializing", "retrying"].includes(run.status);
      if (!allowed) {
        answer = "This action is no longer available.";
        return;
      }
      this.host.audit(
        run.id,
        `Telegram user ${callback.from.id} requested ${button.action}; reviewed fingerprint ${button.fingerprint}.`,
      );
      await this.host.decide(button.action, run.id);
      answer =
        button.action === "apply"
          ? "Reviewed changes applied. No commit or push was made."
          : `Decision accepted: ${button.action}.`;
      await this.api("editMessageReplyMarkup", {
        chat_id: button.chatId,
        message_id: button.messageId,
        reply_markup: { inline_keyboard: [] },
      }).catch(() => {});
    } catch {
      answer =
        "Aether could not complete this action. Check the session in the desktop app; its existing safety checks still apply.";
      this.save({ error: answer });
      if (acknowledged) await this.sendText(answer).catch(() => {});
    } finally {
      if (!acknowledged)
        await this.api("answerCallbackQuery", {
          callback_query_id: callback.id,
          text: answer.slice(0, 200),
          show_alert: true,
        }).catch(() => {});
    }
  }
  private async sendText(
    text: string,
    run?: Run,
    actions: { text: string; action: Action }[] = [],
  ) {
    const state = this.state();
    if (!state.enabled || !state.recipient || this.closing) return;
    const buttons = run
      ? actions.map((action) => ({
          version: 1 as const,
          id: randomBytes(12).toString("hex"),
          runId: run.id,
          action: action.action,
          fingerprint: decisionFingerprint(run),
          userId: state.recipient!.userId,
          chatId: state.recipient!.chatId,
          expires: Date.now() + 24 * 60 * 60 * 1000,
          used: false,
        }))
      : [];
    const safeText = redact(text);
    if (safeText.length > 3900)
      throw new Error(
        "Telegram notification is too large. Review this session in Aether.",
      );
    const result = await this.api(
      "sendMessage",
      {
        chat_id: state.recipient.chatId,
        text: safeText,
        link_preview_options: { is_disabled: true },
        ...(buttons.length
          ? {
              reply_markup: {
                inline_keyboard: buttons.map((button, i) => [
                  { text: actions[i].text, callback_data: "a:" + button.id },
                ]),
              },
            }
          : {}),
      },
      this.controller?.signal,
    );
    const id = z.number().int().parse(result.message_id);
    for (const button of buttons)
      this.store.put(
        "telegram-button",
        button.id,
        {
          ...button,
          messageId: id,
        },
        false,
      );
    const old = this.store.all<Button>("telegram-button");
    for (const button of old.filter(
      (value, index) => value.expires < Date.now() || index >= 500,
    ))
      this.store.remove("telegram-button", button.id, false);
    this.save({ lastDeliveryAt: new Date().toISOString(), error: undefined });
  }
  private async activity(run: Run, force = false) {
    const fingerprint = hash({
      recipient: this.state().recipient?.userId,
      bot: this.state().bot,
      status: run.status,
      tasks: run.tasks.map((task) => [task.id, task.status]),
      decision: decisionFingerprint(run),
    });
    if (!force && this.store.get("telegram-delivery", run.id) === fingerprint)
      return;
    const checks = [
      ...run.tasks.flatMap((task) => task.tests ?? []),
      ...(run.verification ?? []),
    ];
    const lines = [
      `Aether · ${this.host.projectName(run.projectId)}`,
      run.plan?.title ?? "Project session",
      `Status: ${run.status.replaceAll("_", " ")}`,
      `Tasks: ${run.tasks.filter((task) => task.status === "completed").length}/${run.tasks.length} completed`,
      ...(checks.length
        ? [
            `Checks: ${checks.filter((check) => check.exitCode === 0).length}/${checks.length} passed`,
          ]
        : []),
      ...run.tasks
        .filter((task) =>
          ["running", "failed", "blocked"].includes(task.status),
        )
        .slice(0, 5)
        .map((task) => `${task.status}: ${task.title}`),
    ];
    const actions: { text: string; action: Action }[] = [
      { text: "Refresh status", action: "status" },
    ];
    if (["awaiting_approval", "awaiting_review"].includes(run.status))
      actions.unshift({
        text:
          run.status === "awaiting_approval" ? "Review plan" : "Review changes",
        action: "details",
      });
    if (
      this.state().remoteDecisions &&
      ["running", "initializing", "retrying"].includes(run.status)
    )
      actions.push({ text: "Stop session", action: "stop" });
    await this.sendText(lines.join("\n"), run, actions);
    this.store.put("telegram-delivery", run.id, fingerprint);
  }
  private async details(run: Run) {
    const state = this.state();
    const plan = run.status === "awaiting_approval";
    const text = redact(
      plan
        ? `PLAN REVIEW · ${this.host.projectName(run.projectId)}\n${run.plan?.title}\n${run.plan?.summary}\n\n${run.tasks.map((task) => `${task.title}\nObjective: ${task.objective}\nRole: ${task.role}\nFiles: ${task.files.join(", ") || "Read-only"}\nAcceptance: ${task.acceptance.join("; ")}\nDependencies: ${task.dependencies.join(", ") || "None"}\nVerification: ${task.verification}\nModel: ${(task.model ?? run.config.coder).provider}/${(task.model ?? run.config.coder).model || "default"} (${(task.model ?? run.config.coder).reasoning})`).join("\n\n")}\n\nExecution settings: concurrency ${run.config.concurrency}; timeout ${run.config.timeoutSeconds}s; retries ${run.config.retries}; team ${JSON.stringify(run.config.codingTeam)}\nApproving executes these tasks and repository test commands on your computer in isolated worktrees. It does not apply changes to your original project.`
        : `CHANGE REVIEW · ${this.host.projectName(run.projectId)}\n${run.plan?.title}\nSupervisor review:\n${run.review ?? "No review available"}\nVerification:\n${JSON.stringify(run.verification ?? [])}\nTask verification:\n${run.tasks.map((task) => `${task.title}: ${task.status}\n${JSON.stringify(task.tests ?? [])}`).join("\n")}\n\nFull patch:\n${run.patch ?? "No file changes"}\n\nApply writes this reviewed patch into your original working folder. It does not commit or push.`,
    );
    if (!["awaiting_approval", "awaiting_review"].includes(run.status)) {
      await this.activity(run, true);
      return;
    }
    if (text.length > 24000) {
      await this.sendText(
        "This review is too large to present completely in Telegram. Review and decide in the Aether desktop app.",
      );
      return;
    }
    const characters = Array.from(text);
    for (let i = 0; i < characters.length; i += 1750)
      await this.sendText(characters.slice(i, i + 1750).join(""));
    // Decision buttons are issued only after the entire review has been delivered.
    await this.sendText(
      state.remoteDecisions
        ? "Review the details above, then choose a decision. These buttons apply only to this exact version."
        : "Review delivered. Enable remote decisions in Aether settings to approve or reject here.",
      run,
      state.remoteDecisions
        ? [
            {
              text: plan ? "Approve & run" : "Apply to original project",
              action: plan ? "approve" : "apply",
            },
            { text: plan ? "Reject plan" : "Reject changes", action: "reject" },
          ]
        : [],
    );
  }
  async test() {
    await this.sendText(
      "Ava is connected. Aether notifications will appear in this private DM while the desktop app is running.",
    );
    return this.status();
  }
}
