import type { VercelRequest, VercelResponse } from "@vercel/node";

// Public sign-up for the CA-019 widget. Runs server side with the service role key, because
// anon holds no privileges on subscribers (and, since CA-024 001, none on the people functions).
// 1. inserts the subscriber; a repeat email answers { status: "already" }
// 2. registers the person in CA-024 (upsert_person_with_relationship, subscriber); non-fatal
// The browser never sees the key and can only send the fields below, checked here.
// Self-contained on purpose: a Vercel function here must not import from src/.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;      // as artyst-website's signup
const PHONE_RE = /^\+?[0-9 ()-]{6,32}$/;
const TAG_RE = /^[a-z0-9_-]{1,40}$/;
const SOURCES = ["artyst", "ic", "porter", "tours", "ambulance", "direct"];
const CHANNELS = ["email", "whatsapp"];

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[subscribe] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
    return res.status(500).json({ error: "Sign-up is not configured" });
  }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const channels = Array.isArray(b.channels) ? b.channels.filter((c): c is string => CHANNELS.includes(c as string)) : [];
  const email = str(b.email).toLowerCase();
  const whatsapp = str(b.whatsapp);
  const name = str(b.name).slice(0, 100);
  const source = SOURCES.includes(str(b.source)) ? str(b.source) : "direct";
  const tags = Array.isArray(b.interests)
    ? [...new Set(b.interests.filter((t): t is string => typeof t === "string" && TAG_RE.test(t)))].slice(0, 20)
    : [];

  if (!channels.length) return res.status(400).json({ error: "Choose at least one channel." });
  if (channels.includes("email") && !(email.length <= 254 && EMAIL_RE.test(email)))
    return res.status(400).json({ error: "Please enter a valid email address." });
  if (channels.includes("whatsapp") && !PHONE_RE.test(whatsapp))
    return res.status(400).json({ error: "Please enter a valid WhatsApp number." });

  const headers = { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` };
  const emailVal = channels.includes("email") ? email : "";
  const waVal = channels.includes("whatsapp") ? whatsapp : "";

  // 1. the subscriber
  const ins = await fetch(`${url}/rest/v1/subscribers`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({
      name: name || null,
      email: emailVal || null,
      whatsapp: waVal || null,
      notify_email: !!emailVal,
      notify_whatsapp: !!waVal,
      source,
      tags,
      active: true,
    }),
  });
  if (!ins.ok) {
    const err = await ins.json().catch(() => ({} as { code?: string; message?: string }));
    if (err.code === "23505") return res.status(200).json({ status: "already" });
    console.error("[subscribe] subscribers insert failed:", ins.status, err.code, err.message);
    return res.status(502).json({ error: "Something went wrong — please try again." });
  }

  // 2. the person, in CA-024 (non-fatal: the subscription is already stored)
  if (emailVal) {
    const rpc = await fetch(`${url}/rest/v1/rpc/upsert_person_with_relationship`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_email: emailVal,
        p_name: name,
        p_phone: waVal || null,
        p_source: "ic_enrolment",
        p_source_ca: "CA-019",
        p_relationship_type: "subscriber",
        p_property: "artyst",
      }),
    });
    if (!rpc.ok) console.error("[subscribe] upsert_person_with_relationship failed:", rpc.status, (await rpc.text()).slice(0, 300));
  }

  return res.status(200).json({ status: "subscribed" });
}
