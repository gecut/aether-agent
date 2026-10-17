import { expect, it } from "vitest";
import {
  conversationContext,
  compactLog,
  efficiencyBudgets,
} from "../electron/core/efficiency";
import type { ChatMessage } from "../shared/types";

it("bounds UTF-8 history, preserves the latest request, and declares omissions", () => {
  const messages: ChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    role: i % 2 ? "assistant" : "user",
    content: "مثال ".repeat(200),
    at: "2026-10-18",
  }));
  messages.push({
    id: "latest",
    role: "user",
    content: "Keep this exact request",
    at: "2026-10-18",
  });
  const result = conversationContext(messages, 5000);
  expect(result.text).toContain("Keep this exact request");
  expect(result.omitted).toBeGreaterThan(0);
  expect(result.text).toContain("Ask for missing context rather than guessing");
  expect(Buffer.byteLength(result.text)).toBeLessThan(5300);
  expect(messages).toHaveLength(21);
  expect(conversationContext(messages, 2).text).toContain(
    "Keep this exact request",
  );
  expect(efficiencyBudgets("economy").chatBytes).toBeLessThan(
    efficiencyBudgets().chatBytes,
  );
});

it("compacts repeated logs without removing distinct failures or changing evidence", () => {
  const input =
    "\u001b[32mPassed\u001b[0m\nPassed\nPassed\nFAILED: expected 42\ntrace.ts:9";
  expect(compactLog(input)).toBe(
    "Passed\n[Previous line repeated 2 more times]\nFAILED: expected 42\ntrace.ts:9",
  );
  expect(input).toContain("\u001b[32m");
});
