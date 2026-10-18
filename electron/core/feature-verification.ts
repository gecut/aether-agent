import type { Plan, ProjectCommands } from "../../shared/types";

export function requireFeatureVerification(
  plan: Plan,
  project: ProjectCommands,
): Plan {
  if (
    !plan.tasks.some((task) => task.files.length) ||
    ["Not detected", "Invalid package.json"].includes(project.ecosystem)
  )
    return plan;
  if (
    plan.tasks.some(
      (task) => task.role === "test-engineer" && task.verification !== "none",
    )
  )
    return plan;
  if (plan.tasks.length >= 20)
    throw new Error(
      "Application plans need room for a feature-verification task. Reduce the plan and retry.",
    );
  let id = "feature-verification";
  while (plan.tasks.some((task) => task.id === id)) id += "-1";
  return {
    ...plan,
    tasks: [
      ...plan.tasks,
      {
        id,
        title: "Verify application features",
        role: "test-engineer",
        objective:
          "Create and execute JavaScript feature checks for the requested changes and affected application flows. Use the installed browser/desktop testing tools for UI interactions, persistence, navigation and error recovery. For non-UI logic use node:test. Do not install tools or claim unavailable UI coverage. Use aether-tests/features.test.mjs for new checks; invoke existing installed browser/desktop tooling from that script when available. Report each feature, actual evidence and any untested behavior.",
        acceptance: [
          "Requested features and affected flows have executable checks",
          "Existing tests still pass",
          "Report unavailable tooling and untested features explicitly",
        ],
        dependencies: plan.tasks.map((task) => task.id),
        files: ["aether-tests/"],
        verification: "node --test aether-tests/features.test.mjs",
        priority: 5,
      },
    ],
  };
}
