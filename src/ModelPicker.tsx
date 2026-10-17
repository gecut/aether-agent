import { useEffect, useRef, useState } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import type {
  ModelCatalog,
  ModelConfig,
  ModelOption,
  ProviderId,
  ProviderInfo,
} from "../shared/types";
import { FloatingPopover } from "./FloatingPopover";
type Call = <T = unknown>(
  command: string,
  payload?: unknown,
) => Promise<T | undefined>;
const names: Record<ProviderId, string> = {
  codex: "Codex",
  claude: "Claude",
  antigravity: "Antigravity",
  compatible: "Compatible API",
};
export function ModelPicker({
  role,
  value,
  providers,
  call,
  onSelect,
  compact = false,
}: {
  role: "planner" | "coder";
  value: ModelConfig;
  providers: ProviderInfo[];
  call: Call;
  onSelect: (config: Partial<ModelConfig>) => Promise<void>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [catalogs, setCatalogs] = useState<
      Partial<Record<ProviderId, ModelCatalog>>
    >({}),
    [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<ProviderId | "all">("all");
  const anchor = useRef<HTMLButtonElement>(null);
  const load = async (refresh = false) => {
    setLoading(true);
    await Promise.allSettled(
      (Object.keys(names) as ProviderId[]).map(async (id) => {
        const result = await call<ModelCatalog>("models.list", {
          provider: id,
          refresh,
        });
        if (result) setCatalogs((previous) => ({ ...previous, [id]: result }));
      }),
    );
    setLoading(false);
  };
  useEffect(() => {
    if (open && !Object.keys(catalogs).length) void load();
  }, [open]);
  const available = (id: ProviderId) => {
    const info = providers.find((item) => item.id === id);
    return (
      !!info?.installed &&
      !!info.capabilities[role === "coder" ? "coding" : "planning"]
    );
  };
  const choose = async (option: ModelOption) => {
    if (!available(option.provider)) return;
    const valid = [
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ];
    const effort = option.reasoning.includes(value.reasoning)
      ? value.reasoning
      : option.defaultReasoning;
    await onSelect({
      provider: option.provider,
      model: option.id,
      ...(effort && valid.includes(effort)
        ? { reasoning: effort as ModelConfig["reasoning"] }
        : {}),
    });
    setOpen(false);
  };
  const options = Object.values(catalogs)
    .flatMap((catalog) => catalog?.models ?? [])
    .filter(
      (option) =>
        (provider === "all" || option.provider === provider) &&
        `${option.name} ${option.id} ${names[option.provider]}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  return (
    <div className="model-picker">
      <button
        ref={anchor}
        className="model-picker-trigger"
        aria-label={`Select ${role} model`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={`model-picker-mark ${value.provider}`}>
          {names[value.provider].slice(0, 1)}
        </span>
        <span>
          {value.model || `${names[value.provider]} · Runtime default`}
        </span>
        <CaretDown />
      </button>
      {open && (
        <FloatingPopover
          anchor={anchor.current}
          className={`model-picker-popover ${compact ? "compact" : ""}`}
          onClose={() => setOpen(false)}
        >
          <header>
            <strong>{role === "coder" ? "Coding model" : "Agent model"}</strong>
            <button
              aria-label="Refresh model catalogs"
              title="Refresh model catalogs"
              disabled={loading}
              onClick={() => void load(true)}
            >
              <ArrowsClockwise className={loading ? "spin" : ""} />
            </button>
          </header>
          <label className="model-search">
            <MagnifyingGlass />
            <input
              aria-label="Search models"
              placeholder="Search models or providers…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="model-filters">
            {(["all", ...Object.keys(names)] as const).map((id) => (
              <button
                className={provider === id ? "active" : ""}
                key={id}
                onClick={() => setProvider(id as ProviderId | "all")}
              >
                {id === "all" ? "All" : names[id as ProviderId]}
              </button>
            ))}
          </div>
          <div className="model-options">
            {!query && (provider === "all" || provider === value.provider) && (
              <button
                disabled={!available(value.provider)}
                onClick={() =>
                  void choose({
                    provider: value.provider,
                    id: "",
                    name: "Runtime default",
                    description: "",
                    source: "runtime",
                    reasoning: [],
                  })
                }
              >
                <span>
                  <strong>{names[value.provider]} runtime default</strong>
                  <small>Use the runtime’s configured model</small>
                </span>
                {!value.model && <Check />}
              </button>
            )}
            {options.map((option) => (
              <button
                key={`${option.provider}/${option.id}`}
                disabled={!available(option.provider)}
                title={
                  available(option.provider)
                    ? option.description
                    : "This runtime is not available for this role. Connect it in Settings."
                }
                onClick={() => void choose(option)}
              >
                <span>
                  <strong>{option.name}</strong>
                  <small>
                    {names[option.provider]} ·{" "}
                    {option.source === "runtime"
                      ? "Runtime catalog"
                      : "Official alias"}
                    {!available(option.provider)
                      ? " · unavailable for this role"
                      : ""}
                  </small>
                </span>
                {value.provider === option.provider &&
                  value.model === option.id && <Check />}
              </button>
            ))}
            {!options.length && (
              <p className="model-empty">
                {loading
                  ? "Loading runtime catalogs…"
                  : "No matching models. You can enter an exact model ID below."}
              </p>
            )}
          </div>
          {Object.values(catalogs)
            .filter(
              (item) =>
                item?.error &&
                (provider === "all" || provider === item.provider),
            )
            .map((item) => (
              <p className="model-catalog-note" key={item!.provider}>
                {names[item!.provider]}: {item!.error}
              </p>
            ))}
          <form
            className="model-manual"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const id = String(data.get("id") ?? "").trim();
              if (id)
                void choose({
                  provider: provider === "all" ? value.provider : provider,
                  id,
                  name: id,
                  description: "",
                  source: "runtime",
                  reasoning: [],
                });
            }}
          >
            <input
              name="id"
              aria-label="Exact model ID"
              placeholder="Exact model ID"
              maxLength={100}
            />
            <button
              type="submit"
              disabled={
                !available(provider === "all" ? value.provider : provider)
              }
            >
              Use ID
            </button>
          </form>
          <footer>
            Catalog access is separate from model entitlement. Your selected
            provider verifies access when used.
          </footer>
        </FloatingPopover>
      )}
    </div>
  );
}
