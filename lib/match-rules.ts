// Deterministic checks on the matching agent's proposals. Pure: no I/O, no framework imports.
// The model searches volunteers and supplies with tools and proposes assignments; code decides
// whether each one is acceptable and keeps capacity and stock across all accepted proposals:
//   - 112 cases get no volunteers: emergency services handle them;
//   - work inside the property (mud, drying, debris, repairs, power) needs a structural engineer on the
//     team when there is structural risk, and an electrician when there is an electrical hazard; help
//     away from the property (shelter, food, transport, medication pickup) does not. That professional
//     may join as safety lead without a matching skill, but someone on the team must have one;
//   - every volunteer has a skill for a need the case states, is available and has capacity left;
//   - transport and medication pickup need someone with a vehicle;
//   - supplies cover one of the assignment's needs and stay within stock.
// Nothing is dispatched here: an accepted proposal waits for the coordinator's approval.

export type Volunteer = {
  id: string;
  name: string;
  area: string;
  skills: string[];
  available: "today" | "tomorrow";
  capacity: number;
  vehicle: boolean;
  professional: "electrician" | "structural_engineer" | null;
};

export type Supply = { item: string; label: string; stock: number; covers: string[] };

export type Roster = { volunteers: Volunteer[]; supplies: Supply[] };

export type MatchCase = {
  ref: string;
  caseId: string;
  location?: string;
  /** Need categories stated in the help request. */
  needs: string[];
  safetyFlags: string[];
};

export type ProposedAssignment = {
  ref: string;
  needs: string[];
  volunteerIds: string[];
  supplies: { item: string; quantity: number }[];
  reason: string;
};

export type Assignment = ProposedAssignment & { caseId: string; checks: string[] };

export type Verdict = { accepted: true; assignment: Assignment } | { accepted: false; problems: string[] };

const VEHICLE_NEEDS = ["transport", "medication_pickup"];
/** Needs met inside the damaged property, where structural and electrical hazards apply. */
export const ON_SITE_NEEDS = ["mud_removal", "drying", "debris_removal", "temporary_repair", "power"];

/** Capacity and stock left after the accepted assignments. */
export function remaining(roster: Roster, accepted: Pick<ProposedAssignment, "volunteerIds" | "supplies">[]) {
  const load = new Map<string, number>();
  const used = new Map<string, number>();
  for (const a of accepted) {
    for (const id of a.volunteerIds) load.set(id, (load.get(id) ?? 0) + 1);
    for (const s of a.supplies) used.set(s.item, (used.get(s.item) ?? 0) + s.quantity);
  }
  return {
    capacity: (v: Volunteer) => v.capacity - (load.get(v.id) ?? 0),
    stock: (s: Supply) => s.stock - (used.get(s.item) ?? 0),
  };
}

export function checkAssignment(roster: Roster, cases: MatchCase[], accepted: Assignment[], proposal: ProposedAssignment): Verdict {
  const target = cases.find((c) => c.ref === proposal.ref);
  if (!target) return { accepted: false, problems: [`${proposal.ref} is not an open request in the queue`] };
  if (accepted.some((a) => a.ref === proposal.ref)) return { accepted: false, problems: [`${proposal.ref} already has an accepted assignment`] };
  if (target.safetyFlags.includes("call_112_now")) {
    return { accepted: false, problems: [`${proposal.ref} is a 112 case: emergency services respond, not volunteers. Flag it for the coordinator instead`] };
  }

  const problems: string[] = [];
  const checks: string[] = [];
  const left = remaining(roster, accepted);
  const needs = [...new Set(proposal.needs)];
  const unstated = needs.filter((n) => !target.needs.includes(n));
  if (!needs.length) problems.push("name at least one need the assignment covers");
  if (unstated.length) problems.push(`${proposal.ref} did not ask for: ${unstated.join(", ")} (its needs: ${target.needs.join(", ") || "none"})`);

  const onSite = needs.filter((n) => ON_SITE_NEEDS.includes(n));
  // The professional a safety rule asks for may join as the team's safety lead without a matching skill.
  const safetyLead = new Set<string>();
  if (onSite.length && target.safetyFlags.includes("structural_risk_professional")) safetyLead.add("structural_engineer");
  if (onSite.length && target.safetyFlags.includes("electrical_hazard")) safetyLead.add("electrician");

  const ids = [...new Set(proposal.volunteerIds)];
  if (!ids.length) problems.push("assign at least one volunteer");
  const team: Volunteer[] = [];
  for (const id of ids) {
    const v = roster.volunteers.find((x) => x.id === id);
    if (!v) {
      problems.push(`no volunteer ${id}`);
      continue;
    }
    team.push(v);
    if (left.capacity(v) < 1) problems.push(`${id} ${v.name} has no capacity left`);
    const skills = v.skills.filter((s) => needs.includes(s));
    if (skills.length) checks.push(`${id} ${v.name}: ${skills.join(", ")} · available ${v.available}`);
    else if (v.professional && safetyLead.has(v.professional)) checks.push(`${id} ${v.name}: safety lead (${v.professional.replace("_", " ")}) · available ${v.available}`);
    else problems.push(`${id} ${v.name} has none of the skills needed (${needs.join(", ")})`);
  }
  if (team.length && team.every((v) => !v.skills.some((s) => needs.includes(s)))) problems.push("no one on the team has a skill for these needs");

  if (target.safetyFlags.includes("structural_risk_professional") && onSite.length) {
    if (team.some((v) => v.professional === "structural_engineer")) checks.push("structural risk: structural engineer on the team");
    else problems.push(`structural risk: ${onSite.join(", ")} happens inside the property, so a structural engineer must be on the team`);
  }
  if (target.safetyFlags.includes("electrical_hazard") && onSite.length) {
    if (team.some((v) => v.professional === "electrician")) checks.push("electrical hazard: electrician on the team");
    else problems.push(`electrical hazard: ${onSite.join(", ")} happens inside the property, so an electrician must be on the team`);
  }
  if (needs.some((n) => VEHICLE_NEEDS.includes(n))) {
    if (team.some((v) => v.vehicle)) checks.push("vehicle on the team");
    else problems.push(`${needs.filter((n) => VEHICLE_NEEDS.includes(n)).join(", ")} needs a volunteer with a vehicle`);
  }

  for (const { item, quantity } of proposal.supplies) {
    const s = roster.supplies.find((x) => x.item === item);
    if (!s) {
      problems.push(`no supply ${item}`);
      continue;
    }
    if (!Number.isInteger(quantity) || quantity < 1) problems.push(`${item}: quantity must be a whole number of at least 1`);
    else if (quantity > left.stock(s)) problems.push(`${item}: ${quantity} requested, ${left.stock(s)} left`);
    else if (!s.covers.some((n) => needs.includes(n))) problems.push(`${item} does not cover ${needs.join(", ")}`);
    else checks.push(`${quantity} × ${s.label} (${left.stock(s) - quantity} left)`);
  }

  if (problems.length) return { accepted: false, problems };
  return { accepted: true, assignment: { ...proposal, needs, volunteerIds: ids, caseId: target.caseId, checks } };
}
