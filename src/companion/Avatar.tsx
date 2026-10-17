import { memo, useEffect, useId, useRef, useState } from "react";
import { BotEngine, type BotFrame } from "../vendor/bloub/engine";
import { EXPRESSION_BY_ID } from "../vendor/bloub/expressions";
import { PROFILE_SAMPLES } from "../vendor/bloub/profiles";
import type { CompanionState } from "./state";

const body = Array.from({ length: PROFILE_SAMPLES }, (_, i) => {
  const angle = (i / PROFILE_SAMPLES) * Math.PI * 2;
  return (
    0.94 +
    0.075 * Math.cos(5 * angle - Math.PI / 2) +
    0.035 * Math.sin(3 * angle)
  );
});
export const Avatar = memo(
  function Avatar({
    state,
    paused,
  }: {
    state: CompanionState;
    paused: boolean;
  }) {
    const engine = useRef<BotEngine | null>(null);
    if (!engine.current)
      engine.current = new BotEngine(
        100,
        state.animation,
        body,
        EXPRESSION_BY_ID.get(state.expression),
      );
    const clock = useRef(0);
    const [frame, setFrame] = useState<BotFrame>(() => ({
      ...engine.current!.sample(1),
    }));
    const id = useId().replaceAll(":", "");
    useEffect(() => {
      const bot = engine.current!;
      bot.setState(state.animation, clock.current);
      bot.setExpression(
        EXPRESSION_BY_ID.get(state.expression) ?? null,
        clock.current,
      );
      const motion = matchMedia("(prefers-reduced-motion: reduce)");
      let raf = 0,
        last = 0;
      const draw = (ms: number) => {
        raf = requestAnimationFrame(draw);
        if (last && ms - last < 1000 / 24) return;
        clock.current += last ? Math.min((ms - last) / 1000, 0.1) : 0;
        last = ms;
        setFrame({ ...bot.sample(clock.current) });
      };
      const resume = () => {
        cancelAnimationFrame(raf);
        last = 0;
        if (paused || motion.matches || document.hidden) {
          clock.current += 1;
          setFrame({ ...bot.sample(clock.current) });
        } else raf = requestAnimationFrame(draw);
      };
      resume();
      motion.addEventListener("change", resume);
      document.addEventListener("visibilitychange", resume);
      return () => {
        cancelAnimationFrame(raf);
        motion.removeEventListener("change", resume);
        document.removeEventListener("visibilitychange", resume);
      };
    }, [state.animation, state.expression, paused]);
    const dots = frame.dots.map((dot, index) =>
      dot.d ? (
        <path
          key={index}
          d={dot.d}
          transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(100)`}
          opacity={dot.opacity}
          fill={dot.color ?? "currentColor"}
        />
      ) : (
        <circle
          key={index}
          cx={dot.x}
          cy={dot.y}
          r={dot.r}
          opacity={dot.opacity}
          fill={dot.color ?? "currentColor"}
        />
      ),
    );
    return (
      <svg
        className="companion-avatar"
        viewBox="-165 -165 330 330"
        aria-hidden="true"
        data-animation={state.animation}
        onPointerMove={(event) => {
          if (paused || matchMedia("(prefers-reduced-motion: reduce)").matches)
            return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (!bounds.width || !bounds.height) return;
          engine.current!.setLook(
            {
              yaw: ((event.clientX - bounds.left) / bounds.width - 0.5) * 50,
              pitch: (0.5 - (event.clientY - bounds.top) / bounds.height) * 35,
              mix: 1,
              spin: 0,
              wander: 0,
            },
            clock.current,
          );
        }}
        onPointerLeave={() => engine.current!.setLook(null, clock.current)}
      >
        <defs>
          <mask
            id={id}
            maskUnits="userSpaceOnUse"
            x={-165}
            y={-165}
            width={330}
            height={330}
          >
            <path d={frame.bodyPath} fill="white" />
            {frame.eyes.map((eye, index) => (
              <path
                key={index}
                d={eye.d}
                transform={eye.matrix}
                fill="black"
                opacity={eye.alpha}
              />
            ))}
            {frame.notch && (
              <circle
                cx={frame.notch.x}
                cy={frame.notch.y}
                r={frame.notch.r}
                fill="black"
              />
            )}
          </mask>
        </defs>
        {frame.arcs.map((arc) => (
          <path
            key={arc.id}
            d={arc.back}
            stroke="currentColor"
            fill="none"
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
        {frame.dotsBehind && dots}
        <g opacity={frame.bodyAlpha}>
          <path d={frame.bodyPath} fill="var(--companion-eye)" />
          <rect
            x={-165}
            y={-165}
            width={330}
            height={330}
            fill="currentColor"
            mask={`url(#${id})`}
          />
        </g>
        {!frame.dotsBehind && dots}
        {frame.notif && (
          <circle
            cx={frame.notif.x}
            cy={frame.notif.y}
            r={frame.notif.r}
            fill="var(--companion-notice)"
          />
        )}
        {frame.arcs.map((arc) => (
          <path
            key={arc.id}
            d={arc.front}
            stroke="currentColor"
            fill="none"
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </svg>
    );
  },
  (previous, next) =>
    previous.paused === next.paused &&
    previous.state.animation === next.state.animation &&
    previous.state.expression === next.state.expression,
);
