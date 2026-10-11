// Free inbound mail with Cloudflare Email Routing: route *@your-domain to this Worker.
// Set two Worker variables: MAILBOX_URL (https://your-app.example.com) and INBOUND_SECRET (same as the server's).
export default {
  async email(message, env) {
    const raw = await new Response(message.raw).arrayBuffer();
    const r = await fetch(`${env.MAILBOX_URL}/api/inbound/raw?to=${encodeURIComponent(message.to)}`, {
      method: "POST", body: raw, headers: { Authorization: `Bearer ${env.INBOUND_SECRET}`, "content-type": "message/rfc822" },
    });
    if (!r.ok) message.setReject(`mailbox error ${r.status}`);
  },
};
