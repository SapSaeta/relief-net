"use client";

import { useEffect, useState } from "react";

import { recallAccessCode, rememberAccessCode } from "@/app/coordinator/access-code";

export type BaselineRequest = { id: string; label: string; receivedAt: string; source: string; location: string; words: string };

type Phase = { name: "ready" } | { name: "running"; startedAt: number } | { name: "saved"; durationMs: number } | { name: "error"; message: string; startedAt: number };

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

/** Timed manual triage: order every request and mark duplicates, with only what the people sent. */
export function ManualTriage({ requests }: { requests: BaselineRequest[] }) {
  const [phase, setPhase] = useState<Phase>({ name: "ready" });
  const [order, setOrder] = useState(requests.map((r) => r.id));
  const [duplicateOf, setDuplicateOf] = useState<Record<string, string>>({});
  const [triager, setTriager] = useState("");
  const [now, setNow] = useState(0);
  const byId = new Map(requests.map((r) => [r.id, r]));

  const running = phase.name === "running" || phase.name === "error";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  /** Moves a request to a 0-based position (clamped). */
  function moveTo(id: string, position: number) {
    setOrder((o) => {
      const j = Math.min(o.length - 1, Math.max(0, position));
      const next = o.filter((x) => x !== id);
      next.splice(j, 0, id);
      return next;
    });
  }
  const move = (id: string, by: number) => moveTo(id, order.indexOf(id) + by);

  /** "B is a duplicate of A" links, joined into groups. */
  function groups(): string[][] {
    const parent = new Map<string, string>();
    const root = (x: string): string => (parent.has(x) && parent.get(x) !== x ? root(parent.get(x)!) : x);
    for (const [id, of] of Object.entries(duplicateOf)) if (of) parent.set(root(id), root(of));
    const byRoot = new Map<string, string[]>();
    for (const id of order) byRoot.set(root(id), [...(byRoot.get(root(id)) ?? []), id]);
    return [...byRoot.values()].filter((g) => g.length > 1);
  }

  async function finish(startedAt: number) {
    const durationMs = Date.now() - startedAt;
    const code = (recallAccessCode() || window.prompt("Demo access code") || "").trim();
    try {
      const res = await fetch("/api/baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-code": code },
        body: JSON.stringify({ triager, startedAt: new Date(startedAt).toISOString(), durationMs, order, duplicates: groups() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `Failed (${res.status})`);
      rememberAccessCode(code);
      setPhase({ name: "saved", durationMs });
    } catch (e) {
      setPhase({ name: "error", message: e instanceof Error ? e.message : "Failed", startedAt });
    }
  }

  if (phase.name === "ready") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-5 text-sm">
        <p>
          You will see {requests.length} requests as they arrived (words, location, time), with no AI output. Put them in the order
          you would send help, most urgent first, and mark which ones are the same household or incident. The timer runs from
          Start to Done; reading counts.
        </p>
        <input
          value={triager}
          onChange={(e) => setTriager(e.target.value)}
          placeholder="Who is triaging (e.g. developer, volunteer)"
          className="rounded-md border border-foreground/15 bg-transparent px-3 py-2 sm:w-80"
        />
        <button type="button" onClick={() => setPhase({ name: "running", startedAt: Date.now() })} className="w-fit rounded-md bg-foreground px-4 py-2 font-medium text-background">
          Start the timer
        </button>
      </div>
    );
  }

  if (phase.name === "saved") {
    return (
      <p className="rounded-xl border border-green-600/40 bg-green-600/10 p-5 text-sm">
        Saved: {requests.length} requests triaged by hand in <strong>{clock(phase.durationMs)}</strong>. It is scored with the same checks as
        the model by <code>scripts/eval-triage.mjs</code>.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-foreground/15 bg-background p-3 text-sm">
        <span className="text-2xl font-semibold tabular-nums">{clock(Math.max(0, now - phase.startedAt))}</span>
        <span className="text-foreground/60">
          Most urgent at the top: type a position and press Enter, or use ⤒ ↑ ↓. {groups().length} duplicate group(s) marked.
        </span>
        <button type="button" onClick={() => finish(phase.startedAt)} className="ml-auto rounded-md bg-foreground px-4 py-2 font-medium text-background">
          Done
        </button>
        {phase.name === "error" && <span className="w-full text-red-600">{phase.message}</span>}
      </div>
      <ol className="flex flex-col gap-2">
        {order.map((id, i) => {
          const r = byId.get(id)!;
          return (
            <li key={id} className="flex gap-3 rounded-xl border border-foreground/15 p-3 text-sm">
              <div className="flex w-12 shrink-0 flex-col items-center gap-1">
                <input
                  key={`${id}-${i}`}
                  aria-label="Position"
                  inputMode="numeric"
                  defaultValue={i + 1}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    if (Number.isFinite(n) && n !== i + 1) moveTo(id, n - 1);
                    else e.target.value = String(i + 1);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className="w-11 rounded border border-foreground/20 bg-transparent text-center text-lg font-semibold tabular-nums"
                />
                <button type="button" aria-label="Move to the top" onClick={() => moveTo(id, 0)} className="rounded border border-foreground/20 px-2">
                  ⤒
                </button>
                <button type="button" aria-label="Move up" onClick={() => move(id, -1)} className="rounded border border-foreground/20 px-2">
                  ↑
                </button>
                <button type="button" aria-label="Move down" onClick={() => move(id, 1)} className="rounded border border-foreground/20 px-2">
                  ↓
                </button>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
                  <span className="rounded bg-foreground/10 px-1.5 py-0.5 font-semibold text-foreground">{r.label}</span>
                  <span className="font-medium text-foreground">{r.location}</span>
                  <span>
                    {r.source} · {r.receivedAt}
                  </span>
                  <label className="ml-auto flex items-center gap-1">
                    Same as
                    <select
                      value={duplicateOf[id] ?? ""}
                      onChange={(e) => setDuplicateOf((d) => ({ ...d, [id]: e.target.value }))}
                      className="rounded border border-foreground/20 bg-background px-1 py-0.5"
                    >
                      <option value="">—</option>
                      {requests
                        .filter((x) => x.id !== id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.label}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <p>{r.words}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
