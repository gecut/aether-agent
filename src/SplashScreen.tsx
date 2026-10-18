import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { AvaLogo } from "./AvaLogo";
import { GitBranch } from "@phosphor-icons/react/dist/csr/GitBranch";
import { Paperclip } from "@phosphor-icons/react/dist/csr/Paperclip";
import { TreeStructure } from "@phosphor-icons/react/dist/csr/TreeStructure";
import { UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree";

export function SplashScreen({ onStart }: { onStart: () => void }) {
  return (
    <div
      className="splash-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Aether Code"
    >
      <section className="splash-card">
        <span className="splash-mark">
          <AvaLogo size={46} />
        </span>
        <p className="eyebrow">WELCOME TO AETHER CODE</p>
        <h1>Your local command center for thoughtful code work.</h1>
        <p>
          Aether keeps planning, worktrees, reviews, Git tools, and your session
          history in one place on this computer.
        </p>
        <div className="splash-features">
          <span>
            <TreeStructure /> Plan before execution
          </span>
          <span>
            <UsersThree /> Coordinate coding teams
          </span>
          <span>
            <GitBranch /> Review, commit, and push
          </span>
          <span>
            <Paperclip /> Share images with prompts
          </span>
        </div>
        <button className="button primary" onClick={onStart}>
          Start building <ArrowRight />
        </button>
      </section>
    </div>
  );
}
