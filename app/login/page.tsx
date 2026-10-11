import { redirect } from "next/navigation";
import { checkPassword, isAdmin, signIn } from "@/lib/admin";
export const dynamic = "force-dynamic";
async function login(f: FormData) {
  "use server";
  await new Promise(r => setTimeout(r, 400));                     // slows password guessing
  if (!checkPassword(String(f.get("pw") || ""))) redirect("/login?bad=1");
  signIn(); redirect("/");
}
export default function Login({ searchParams }: { searchParams: { bad?: string } }) {
  if (isAdmin()) redirect("/");
  const setUp = !!process.env.ADMIN_PASSWORD;
  return <div className="wrap" style={{ maxWidth: 380, paddingTop: 80 }}>
    <h1>✉︎ Agent Mailbox</h1>
    {setUp ? <form action={login} className="grid">
      <input name="pw" type="password" placeholder="Admin password" autoFocus required />
      {searchParams.bad && <div className="bad small">That's not it.</div>}
      <button>Sign in</button>
    </form> : <p className="dim">Set <code>ADMIN_PASSWORD</code> on the server to turn on the dashboard.</p>}
  </div>;
}
