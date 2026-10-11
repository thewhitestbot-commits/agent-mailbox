import { route } from "@/lib/api";
import { deleteInbox, getInbox, updateInbox } from "@/lib/mail";
export const dynamic = "force-dynamic";
export const GET = route(async (_r, { params }) => getInbox(params.id));
export const PATCH = route(async (_r, { params }, b) => updateInbox(params.id, b));
export const DELETE = route(async (_r, { params }) => deleteInbox(params.id));
