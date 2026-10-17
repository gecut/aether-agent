import { useState, type ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react";

export function Collapsible({
  id,
  title,
  children,
  className = "",
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(
    () => localStorage.getItem(`aether.sections.v1.${id}`) !== "closed",
  );
  return (
    <section className={`collapsible ${className}`}>
      <button
        className="collapse-heading"
        aria-expanded={open}
        aria-controls={`section-${id}`}
        onClick={() => {
          setOpen(!open);
          localStorage.setItem(
            `aether.sections.v1.${id}`,
            open ? "closed" : "open",
          );
        }}
      >
        <CaretDown className={open ? "" : "is-collapsed"} />
        {title}
      </button>
      <div id={`section-${id}`} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
