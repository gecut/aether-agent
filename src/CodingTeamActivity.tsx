import type { CodingTeam } from "../shared/types";

export function CodingTeamActivity({
  team,
  model,
}: {
  team: CodingTeam;
  model: string;
}) {
  return (
    <div className="coding-team" aria-label="Coding team">
      <p className="inspector-note">
        Lead + up to {team.maxHelpers} concurrent helpers · coding model:{" "}
        {model || "Runtime default"}
      </p>
      {!team.members.length && (
        <p className="inspector-note">Waiting for the lead to delegate…</p>
      )}
      {team.members.map((member, index) => (
        <details key={member.id} className="coding-helper">
          <summary>
            <span>Helper {index + 1}</span>
            <span>
              {member.closed && member.status === "completed"
                ? "Finished"
                : member.status.replaceAll("_", " ")}
            </span>
          </summary>
          <code title={member.id}>{member.id}</code>
          {member.message && <p dir="auto">{member.message}</p>}
        </details>
      ))}
      {!!team.events.length && (
        <details className="coding-handoffs">
          <summary>Collaboration · {team.events.length} recent events</summary>
          {team.events.slice(-12).map((event) => (
            <div key={event.id}>
              <strong>{event.tool.replaceAll("_", " ")}</strong>{" "}
              <span>{event.status.replaceAll("_", " ")}</span>
              {event.prompt && <p dir="auto">{event.prompt}</p>}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
