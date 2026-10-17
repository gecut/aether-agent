import type { ChatMessage, Settings } from "../../shared/types";

export const efficiencyBudgets = (mode: Settings["efficiency"] = "balanced") =>
  ({
    economy: { context: 10000, worker: 9000, evidence: 4000, chatBytes: 24000 },
    balanced: {
      context: 18000,
      worker: 14000,
      evidence: 8000,
      chatBytes: 48000,
    },
    thorough: {
      context: 30000,
      worker: 22000,
      evidence: 12000,
      chatBytes: 96000,
    },
  })[mode];

export function conversationContext(messages: ChatMessage[], budget: number) {
  const selected: ChatMessage[] = [];
  let bytes = 0;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    const size =
      Buffer.byteLength(message.content, "utf8") + message.role.length + 4;
    if (selected.length && bytes + size > budget) break;
    selected.unshift(message);
    bytes += size;
  }
  while (selected.length > 1 && selected[0].role === "assistant")
    selected.shift();
  const omitted = messages.length - selected.length;
  const text =
    (omitted
      ? `[${omitted} earlier messages omitted from this request; full conversation remains saved. Ask for missing context rather than guessing.]\n\n`
      : "") +
    selected
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n\n");
  return {
    text,
    included: selected.length,
    omitted,
    estimatedTokens: Math.ceil(Buffer.byteLength(text) / 3),
  };
}

export function compactLog(text: string) {
  const lines = text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").split("\n");
  const result: string[] = [];
  for (let start = 0; start < lines.length;) {
    let end = start + 1;
    while (end < lines.length && lines[end] === lines[start]) end++;
    result.push(lines[start]);
    if (end - start > 1)
      result.push(`[Previous line repeated ${end - start - 1} more times]`);
    start = end;
  }
  return result.join("\n");
}
