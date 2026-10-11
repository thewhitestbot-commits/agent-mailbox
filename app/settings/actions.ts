"use server";
import { needAdmin } from "@/lib/admin";
import { createKey } from "@/lib/keys";
import { createHook } from "@/lib/webhooks";
import { revalidatePath } from "next/cache";

export type Shown = { value?: string; error?: string } | null;
export async function newKey(_p: Shown, f: FormData): Promise<Shown> {
  needAdmin();
  const { key } = await createKey(String(f.get("name") || "key"));
  revalidatePath("/settings"); return { value: key };
}
export async function newHook(_p: Shown, f: FormData): Promise<Shown> {
  needAdmin();
  try {
    const h = await createHook({ url: String(f.get("url") || ""), events: f.getAll("events").map(String), inbox_id: String(f.get("inbox") || "") || null });
    revalidatePath("/settings"); return { value: h.secret };
  } catch (e) { return { error: (e as Error).message }; }
}
