import { loadMe, meFromRequest, type Me } from "@/lib/auth/session";
import { canUseAgent } from "./turn";

/** The signed-in salesperson or desk head, or null (callers answer 403). */
export async function agentMe(req: Request): Promise<Me | null> {
  const id = meFromRequest(req);
  const me = id ? await loadMe(id) : null;
  return canUseAgent(me) ? me : null;
}

export const forbidden = () => Response.json({ error: "not allowed" }, { status: 403 });
export const notFound = () => Response.json({ error: "not found" }, { status: 404 });
