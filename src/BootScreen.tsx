import { AsteriskSimple, CircleNotch } from "@phosphor-icons/react";

export function BootScreen() {
  return (
    <main className="boot-screen" aria-live="polite">
      <span className="boot-mark">
        <AsteriskSimple weight="bold" />
      </span>
      <div>
        <strong>Aether Code</strong>
        <p>Loading your local workspace…</p>
      </div>
      <CircleNotch className="spin" aria-label="Loading" />
    </main>
  );
}
