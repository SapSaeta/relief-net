import type { CheckedEvidence } from "@/lib/evidence";
import type { HelpRequest } from "@/lib/request";

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-400 text-black",
  low: "bg-foreground/15",
};

const FLAG_TEXT: Record<string, string> = {
  call_112_now: "Immediate danger: call 112 now",
  structural_risk_professional: "Structural risk: needs a professional assessment",
  electrical_hazard: "Electrical hazard",
  health_hazard: "Health hazard",
};

const plural = (n: number | null, one: string, many = `${one}s`) => (n === null ? `? ${many}` : `${n} ${n === 1 ? one : many}`);

export function Badge({ value }: { value: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${PRIORITY_STYLES[value] ?? PRIORITY_STYLES.low}`}>
      {value}
    </span>
  );
}

function EvidenceChips({ evidence }: { evidence: CheckedEvidence[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {evidence.map((e, i) => {
        const tone = e.verified
          ? "border-green-600/40 bg-green-600/10 text-green-800 dark:text-green-300"
          : "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-300";
        const mark = e.verified ? "✓" : "✗";
        return e.kind === "frame" ? (
          <a key={i} href={`#frame-${e.frame_index}`} title={e.check} className={`rounded border px-1.5 py-0.5 text-xs ${tone}`}>
            {mark} frame {e.frame_index} · {e.damage_label}
          </a>
        ) : (
          <span key={i} title={e.check} className={`rounded border px-1.5 py-0.5 text-xs ${tone}`}>
            {mark} “{e.quote}”
          </span>
        );
      })}
    </div>
  );
}

export function HelpRequestCard({ request }: { request: HelpRequest }) {
  const { verified, total } = request.verification;
  const household = request.household;

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-foreground/15 p-5">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Help request</h2>
        <Badge value={request.priority} />
        <span className="text-xs text-foreground/60">{request.hazard}</span>
        <span
          className={`ml-auto text-xs font-medium ${verified === total ? "text-green-700 dark:text-green-400" : "text-orange-600"}`}
          title="Quotes are checked against the transcript; frame citations against SAM detections."
        >
          {verified}/{total} evidence verified
        </span>
      </header>

      {request.safety_flags.length > 0 && (
        <ul className="flex flex-col gap-2">
          {request.safety_flags.map((f) => (
            <li
              key={f.flag}
              className={`rounded-lg border px-3 py-2 text-sm ${
                f.flag === "call_112_now" ? "border-red-600 bg-red-600 text-white" : "border-orange-500/50 bg-orange-500/10"
              }`}
            >
              <strong>{FLAG_TEXT[f.flag] ?? f.flag}.</strong> {f.reason}
            </li>
          ))}
        </ul>
      )}

      <p className="leading-relaxed">{request.summary}</p>
      <p className="text-sm text-foreground/70">
        <span className="font-medium">Why {request.priority}:</span> {request.priority_rationale}
      </p>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Household</h3>
        <p className="mt-1 text-sm">
          {plural(household.adults, "adult")} · {plural(household.children, "child", "children")}
          {household.vulnerable_people ? ` · ${household.vulnerable_people}` : ""}
        </p>
        <EvidenceChips evidence={household.evidence} />
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Needs</h3>
        <ul className="mt-1 flex flex-col gap-3">
          {request.needs.map((n, i) => (
            <li key={i}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge value={n.urgency} />
                <span className="font-medium">{n.category.replaceAll("_", " ")}</span>
                <span className="text-foreground/70">{n.description}</span>
              </div>
              <EvidenceChips evidence={n.evidence} />
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Damage</h3>
        <ul className="mt-1 flex flex-col gap-3">
          {request.damage.map((d, i) => (
            <li key={i}>
              <div className="text-sm">
                <span className="font-medium">{d.label}</span> · {d.location} · <span className="text-foreground/70">{d.severity}</span>
              </div>
              <EvidenceChips evidence={d.evidence} />
            </li>
          ))}
        </ul>
      </div>

      {request.follow_up_questions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Ask next</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-foreground/80">
            {request.follow_up_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-foreground/50">
        Drafted by {request.model}. A human coordinator reviews every request before anything is dispatched.
      </p>
    </section>
  );
}
