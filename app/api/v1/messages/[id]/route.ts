import { route } from "@/lib/api";
import { getMessage, updateMessage } from "@/lib/mail";
export const dynamic = "force-dynamic";
export const GET = route(async (_r, { params }) => getMessage(params.id));
export const PATCH = route(async (_r, { params }, b) => updateMessage(params.id, b));
