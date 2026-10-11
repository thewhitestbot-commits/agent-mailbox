import "./globals.css";
export const metadata = { title: "Agent Mailbox", description: "Email inboxes for AI agents" };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
