import { connection } from "next/server";

import { summarizeUsage } from "@/lib/usage";

// Running totals of every model call: calls, tokens and estimated USD cost.
export async function GET() {
  await connection();
  return Response.json(await summarizeUsage());
}
