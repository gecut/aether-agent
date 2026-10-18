import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const directory = await mkdtemp(
  path.join(os.tmpdir(), "aether-conversation-ui-"),
);
const project = path.join(directory, "project");
await mkdir(project);
await writeFile(
  path.join(project, "package.json"),
  JSON.stringify({
    name: "fixture",
    scripts: {
      dev: "node server.js",
      build: "node build.js",
      test: "node --test",
    },
  }),
);
await writeFile(
  path.join(project, "greeting.js"),
  'export const greeting = "hello";\n',
);
const requests = [];
const server = createServer((req, res) => {
  if (req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: [{ id: "fixture" }] }));
    return;
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const input = JSON.parse(body);
    requests.push(input);
    const plan = input.messages.some((m) =>
      m.content.includes("Create a structured implementation plan"),
    );
    const text = plan
      ? JSON.stringify({
          title: "Build greeting",
          summary: "Implement and verify greeting",
          tasks: [
            {
              id: "greeting",
              title: "Implement greeting",
              role: "implementer",
              objective: "Update greeting.js",
              files: ["greeting.js"],
              acceptance: ["Greets the user"],
              dependencies: [],
              verification: "node --test",
              priority: 5,
            },
          ],
        })
      : "PROJECT_WORK: I will prepare the greeting changes and feature checks in this conversation.";
    res.setHeader("Content-Type", "text/event-stream");
    res.end(
      "data: " +
        JSON.stringify({ choices: [{ delta: { content: text } }] }) +
        "\n\ndata: [DONE]\n\n",
    );
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const app = await electron.launch({
  args: ["."],
  env: { ...process.env, AETHER_TEST_DATA: path.join(directory, "data") },
});
const page = await app.firstWindow();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
try {
  await page
    .getByRole("button", { name: "Start building", exact: true })
    .click();
  await page.evaluate(
    async ({ project, port }) => {
      await window.aether.invoke("project.add", project);
      const { settings } = await window.aether.invoke("snapshot");
      await window.aether.invoke("settings.save", {
        ...settings,
        planner: {
          ...settings.planner,
          provider: "compatible",
          model: "fixture",
        },
        apiUrl: `http://127.0.0.1:${port}/v1`,
      });
    },
    { project, port: server.address().port },
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "What are we building today?" })
    .first()
    .waitFor();
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: project,
    encoding: "utf8",
  });
  await writeFile(
    path.join(project, "greeting.js"),
    'export const greeting = "changed before chat";\n',
  );
  await page
    .getByRole("button", { name: "Project actions", exact: true })
    .click();
  const menu = page.getByRole("dialog", { name: "Project actions" });
  await menu
    .getByRole("button", { name: "Open terminal", exact: false })
    .waitFor();
  await menu
    .getByRole("button", { name: "Open folder", exact: false })
    .waitFor();
  await menu.getByRole("button", { name: "Open IDE", exact: false }).waitFor();
  await menu.getByText("npm run dev", { exact: true }).waitFor();
  await menu.getByText("npm run build", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  const composer = page.locator(".composer textarea");
  await composer.fill("Build a greeting for Alice");
  await composer.press(
    process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
  );
  await page
    .getByRole("region", { name: "Project work in this conversation" })
    .waitFor();
  await page.getByText("Checkpoint saved", { exact: false }).waitFor();
  await page
    .getByRole("button", { name: "Approve & run", exact: true })
    .waitFor();
  await page
    .getByText("Verify application features", { exact: false })
    .waitFor();
  await page
    .getByText("node --test aether-tests/features.test.mjs", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Create project plan", exact: true })
      .count(),
    0,
  );
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: project,
      encoding: "utf8",
    }),
    head,
  );
  assert.ok(
    (await readFile(path.join(project, "greeting.js"), "utf8")).includes(
      "changed before chat",
    ),
  );
  const chat = await page.evaluate(async () => {
    const s = await window.aether.invoke("snapshot");
    return s.chats[0];
  });
  assert.equal(chat.runIds.length, 1);
  assert.match(chat.messages[0].checkpoint.commit, /^[a-f0-9]{40}$/);
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await page.getByText("cancelled", { exact: true }).first().waitFor();
  await composer.fill("Now greet Bob instead");
  await composer.press(
    process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
  );
  await page
    .getByRole("button", { name: "Approve & run", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Project work in this conversation" })
      .count(),
    2,
  );
  assert.ok(requests.every((r) => r.messages[0].content.includes("Nexload")));
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/conversation-workflow.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Conversation UI passed: project actions, detected commands, isolated message checkpoint, inline coding/feature plan, rejection and same-chat follow-up; no execution before approval.",
  );
} finally {
  await app.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
