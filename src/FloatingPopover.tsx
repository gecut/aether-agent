import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export function FloatingPopover({
  anchor,
  onClose,
  className = "",
  children,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  useEffect(() => {
    panel.current
      ?.querySelector<HTMLElement>("button:not(:disabled), input, select")
      ?.focus();
  }, [anchor]);
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const bounds = anchor.getBoundingClientRect();
      const box = panel.current!.getBoundingClientRect();
      setPosition({
        left: Math.max(
          12,
          Math.min(bounds.left, window.innerWidth - box.width - 12),
        ),
        top: Math.max(
          12,
          bounds.bottom + box.height + 20 > window.innerHeight
            ? bounds.top - box.height - 8
            : bounds.bottom + 8,
        ),
      });
    };
    const dismiss = (event: PointerEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !anchor.contains(event.target as Node)
      )
        onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        anchor.focus();
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div
      ref={panel}
      className={`popover floating-popover ${className}`}
      style={position}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(
          panel.current!.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input, select, textarea, [tabindex='0']",
          ),
        );
        if (!items.length) return;
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault();
          items.at(-1)!.focus();
        } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
          event.preventDefault();
          items[0].focus();
        }
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
