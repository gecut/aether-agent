import { Avatar } from "./companion/Avatar";
import { companionPose } from "./companion/state";

export function BootScreen() {
  return (
    <main className="boot-screen" role="status" aria-label="Loading Aether">
      <span className="boot-mascot companion-avatar">
        <Avatar state={companionPose("idle")} paused={false} />
      </span>
    </main>
  );
}
