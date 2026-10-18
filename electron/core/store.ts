import initSqlJs, { type Database } from "sql.js";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import path from "node:path";
import { defaults, type RunEvent, type Settings } from "../../shared/types";
export class Store {
  private db!: Database;
  private flushTimer?: ReturnType<typeof setTimeout>;
  private pendingEvents = 0;
  private file: string;
  constructor(public directory: string) {
    this.file = path.join(directory, "aether.db");
  }
  async open(wasm?: string) {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const SQL = await initSqlJs(wasm ? { locateFile: () => wasm } : {});
    this.db = existsSync(this.file)
      ? new SQL.Database(readFileSync(this.file))
      : new SQL.Database();
    this.db.run(
      "CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
    );
    if (
      !this.db.exec("SELECT version FROM migrations WHERE version=1").length
    ) {
      this.db.run(
        "BEGIN; CREATE TABLE records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id)); CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, task_id TEXT, type TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL); CREATE INDEX event_run ON events(run_id,seq); INSERT INTO migrations VALUES (1,datetime('now')); COMMIT;",
      );
    }
    if (!this.get<Settings>("settings", "global"))
      this.put("settings", "global", defaults);
    this.flush();
  }
  all<T>(kind: string): T[] {
    const statement = this.db.prepare(
      "SELECT value FROM records WHERE kind=? ORDER BY rowid DESC",
    );
    statement.bind([kind]);
    const result: T[] = [];
    try {
      while (statement.step())
        result.push(JSON.parse(String(statement.get()[0])));
    } finally {
      statement.free();
    }
    return result;
  }
  uiRecords<T>(kind: "run" | "chat", selected = ""): T[] {
    const projection =
      kind === "chat"
        ? "json_set(value,'$.messages',json('[]'))"
        : `json_set(json_remove(value,'$.plannerSnapshot','$.reviewSnapshot','$.continuationContext','$.patch','$.review','$.verification'),'$.tasks',json(COALESCE((SELECT json_group_array(json_remove(t.value,'$.snapshot','$.output','$.tests','$.team')) FROM json_each(records.value,'$.tasks') t),'[]')))`;
    const statement = this.db.prepare(
      `SELECT CASE WHEN id=? THEN value ELSE ${projection} END FROM records WHERE kind=? ORDER BY rowid DESC`,
    );
    statement.bind([selected, kind]);
    const rows: T[] = [];
    try {
      while (statement.step())
        rows.push(JSON.parse(String(statement.get()[0])));
    } finally {
      statement.free();
    }
    return rows;
  }
  get<T>(kind: string, id: string): T | undefined {
    const statement = this.db.prepare(
      "SELECT value FROM records WHERE kind=? AND id=?",
    );
    statement.bind([kind, id]);
    try {
      return statement.step()
        ? JSON.parse(String(statement.get()[0]))
        : undefined;
    } finally {
      statement.free();
    }
  }
  put(kind: string, id: string, value: unknown, durable = true) {
    this.db.run(
      "INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value",
      [kind, id, JSON.stringify(value)],
    );
    if (durable) this.flush();
    else this.scheduleFlush();
    return value;
  }
  remove(kind: string, id: string) {
    this.db.run("DELETE FROM records WHERE kind=? AND id=?", [kind, id]);
    this.flush();
  }
  removeEvents(runId: string) {
    this.db.run("DELETE FROM events WHERE run_id=?", [runId]);
    this.flush();
  }
  event(event: Omit<RunEvent, "seq">, durable = true) {
    this.db.run(
      "INSERT INTO events(run_id,task_id,type,text,at) VALUES(?,?,?,?,?)",
      [event.runId, event.taskId ?? null, event.type, event.text, event.at],
    );
    const seq = Number(
      this.db.exec("SELECT last_insert_rowid()")[0].values[0][0],
    );
    if (durable || ++this.pendingEvents >= 64) this.flush();
    else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 200);
      this.flushTimer.unref();
    }
    return { ...event, seq };
  }
  events(runId: string, after = 0): RunEvent[] {
    const s = this.db.prepare(
      "SELECT seq,run_id,task_id,type,text,at FROM events WHERE run_id=? AND seq>? ORDER BY seq LIMIT 2000",
    );
    s.bind([runId, after]);
    const rows: RunEvent[] = [];
    try {
      while (s.step()) {
        const [seq, runId, taskId, type, text, at] = s.get();
        rows.push({
          seq: Number(seq),
          runId: String(runId),
          taskId: taskId ? String(taskId) : undefined,
          type: String(type),
          text: String(text),
          at: String(at),
        });
      }
    } finally {
      s.free();
    }
    return rows;
  }
  private scheduleFlush() {
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 200);
      this.flushTimer.unref();
    }
  }
  flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    this.pendingEvents = 0;
    const temp = this.file + ".tmp";
    writeFileSync(temp, this.db.export(), { mode: 0o600 });
    renameSync(temp, this.file);
  }
  close() {
    this.flush();
    this.db.close();
  }
}
