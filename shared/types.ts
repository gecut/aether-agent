import { z } from "zod";
export const providerId = z.enum([
  "codex",
  "claude",
  "antigravity",
  "compatible",
]);
export type ProviderId = z.infer<typeof providerId>;
export const modelSchema = z.object({
  provider: providerId,
  model: z.string().max(100),
  reasoning: z.enum(["low", "medium", "high"]).default("medium"),
  instructions: z.string().max(12000).default(""),
});
export type ModelConfig = z.infer<typeof modelSchema>;
export const codingTeamSchema = z.object({
  enabled: z.boolean().default(true),
  maxHelpers: z.number().int().min(1).max(3).default(1),
});
export const settingsSchema = z.object({
  planner: modelSchema,
  coder: modelSchema,
  concurrency: z.number().int().min(1).max(4),
  codingTeam: codingTeamSchema.default({ enabled: true, maxHelpers: 1 }),
  timeoutSeconds: z.number().int().min(15).max(3600),
  retries: z.number().int().min(0).max(3),
  theme: z.enum(["dark", "light"]),
  apiUrl: z.string().url().default("http://127.0.0.1:11434/v1"),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaults: Settings = {
  planner: {
    provider: "codex",
    model: "",
    reasoning: "medium",
    instructions: "",
  },
  coder: {
    provider: "codex",
    model: "",
    reasoning: "medium",
    instructions: "",
  },
  concurrency: 2,
  codingTeam: { enabled: true, maxHelpers: 1 },
  timeoutSeconds: 600,
  retries: 1,
  theme: "dark",
  apiUrl: "http://127.0.0.1:11434/v1",
};
export const verificationSchema = z.enum([
  "none",
  "node --test",
  "npm test",
  "npm run build",
  "pnpm test",
  "python3 -m unittest discover",
  "cargo test",
  "go test ./...",
]);
export const taskSpecSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/),
  title: z.string().min(1).max(200),
  role: z.enum([
    "architect",
    "implementer",
    "test-engineer",
    "reviewer",
    "debugger",
    "integration",
    "documentation",
  ]),
  objective: z.string().min(1).max(12000),
  acceptance: z.array(z.string().max(2000)).min(1).max(20),
  dependencies: z.array(z.string()).max(30),
  files: z.array(z.string().min(1).max(300)).max(50),
  verification: verificationSchema,
  priority: z.number().int().min(0).max(10),
  model: modelSchema.optional(),
});
export const planSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(8000),
  tasks: z.array(taskSpecSchema).min(1).max(20),
});
export type TaskSpec = z.infer<typeof taskSpecSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Status =
  | "queued"
  | "initializing"
  | "running"
  | "retrying"
  | "blocked"
  | "failed"
  | "cancelled"
  | "completed"
  | "awaiting_approval"
  | "awaiting_review";
export type Task = TaskSpec & {
  status: Status;
  attempts: number;
  reason?: string;
  output?: string;
  workspace?: string;
  commit?: string;
  tests?: TestEvidence[];
  snapshot?: CompiledPrompt;
  team?: CodingTeam;
  startedAt?: string;
  endedAt?: string;
};
export interface TestEvidence {
  command: string;
  exitCode: number;
  output: string;
  at: string;
  durationMs: number;
}
export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}
export interface Run {
  id: string;
  projectId: string;
  objective: string;
  title: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  plan?: Plan;
  tasks: Task[];
  reason?: string;
  baseline?: string;
  head?: string;
  workspace?: string;
  patch?: string;
  review?: string;
  verification?: TestEvidence[];
  parentRunId?: string;
  intent?: "implementation";
  continuationContext?: string;
  plannerSnapshot?: CompiledPrompt;
  reviewSnapshot?: CompiledPrompt;
  /** User-selected prompt images copied into Aether's private application data. */
  attachments?: PromptAttachment[];
  /** Pinned sessions remain at the top of a project's history. */
  pinned?: boolean;
  config: Settings;
}
export interface PromptAttachment {
  id: string;
  name: string;
  mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  path: string;
}
export interface RunEvent {
  seq: number;
  runId: string;
  taskId?: string;
  type: string;
  text: string;
  at: string;
}
export interface ConnectionStatus {
  provider: "codex" | "antigravity";
  state:
    | "signed-in"
    | "signed-out"
    | "awaiting-signin"
    | "blocked"
    | "error"
    | "unavailable";
  message: string;
  checkedAt: string;
}
export interface ProviderInfo {
  connection?: ConnectionStatus;
  id: ProviderId;
  name: string;
  kind: "supported-cli" | "native-api" | "unavailable";
  installed: boolean;
  authenticated: boolean | null;
  version?: string;
  detail: string;
  models: string[];
  capabilities: {
    planning: boolean;
    coding: boolean;
    streaming: boolean;
    cancellation: boolean;
  };
  verified: boolean;
}
export interface PromptLayer {
  id: string;
  level: number;
  label: string;
  content: string;
  trusted: boolean;
}
export interface PromptCoreInfo {
  id: "nexload";
  adaptation: string;
  repository: string;
  revision: string;
  kernel: string;
  binding: string;
  profiles: {
    id: string;
    label: string;
    skill: string;
    instructions: string;
  }[];
  files: { path: string; sha256: string }[];
}
export interface CompiledPrompt {
  systemLength?: number;
  core?: {
    id: "nexload";
    revision: string;
    adaptation: string;
    profile: string;
    hash: string;
  };
  text: string;
  hash: string;
  estimatedTokens: number;
  trace: {
    id: string;
    label: string;
    level: number;
    included: boolean;
    reason: string;
  }[];
}
export interface PromptVersion {
  id: string;
  name: string;
  content: string;
  version: number;
  active: boolean;
  createdAt: string;
}
export interface CatalogSkill {
  id: string;
  name: string;
  repository: string;
  directory: string;
  commit: string;
  stars: number | null;
  url: string;
}
export interface SkillPreview {
  skill: CatalogSkill;
  content: string;
  description: string;
  files: string[];
  token: string;
}
export interface Skill {
  projectId?: string;
  installPath?: string;
  source?: string;
  packageFiles?: { path: string; sha256: string }[];
  id: string;
  name: string;
  description: string;
  version: number;
  content: string;
  enabled: boolean;
  reviewed: boolean;
  roles: string[];
  createdAt: string;
}
export interface Memory {
  id: string;
  projectId: string;
  content: string;
  kind: "verified" | "hypothesis" | "outdated";
  createdAt: string;
}
export interface Snapshot {
  projects: Project[];
  runs: Run[];
  settings: Settings;
  providers: ProviderInfo[];
  prompts: PromptVersion[];
  skills: Skill[];
  memories: Memory[];
}
export interface GitInfo {
  branch: string;
  status: string;
  diff: string;
  log: string;
  files: string[];
  head: string;
}
export interface Bridge {
  invoke<T = unknown>(command: string, payload?: unknown): Promise<T>;
  onEvent(callback: (event: RunEvent) => void): () => void;
  onNavigate(
    callback: (target: { runId: string; taskId?: string }) => void,
  ): () => void;
  desktop: boolean;
}
declare global {
  interface Window {
    aether?: Bridge;
  }
}

export interface CodeGraph {
  nodes: { id: string; label: string; file: string; line: string }[];
  edges: { source: string; target: string; relation: string }[];
  updatedAt: string;
  source: string;
  truncated: boolean;
  error?: string;
}

export interface CollaborationEvent {
  id: string;
  tool: string;
  status: string;
  senderId: string;
  receiverIds: string[];
  prompt?: string;
  agents: { id: string; status: string; message?: string }[];
  at: string;
}
export interface CodingTeam {
  protocol: "aether-managed-v1";
  maxHelpers: number;
  members: { id: string; status: string; message?: string; closed: boolean }[];
  events: CollaborationEvent[];
}
