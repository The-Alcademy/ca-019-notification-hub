import type { VercelRequest, VercelResponse } from '@vercel/node';

async function supabase(path: string, method: string, body?: object, prefer?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: process.env.SUPABASE_ANON_KEY!,
    Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY!}`,
  };
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    const e: any = new Error(err);
    try { const j = JSON.parse(err); e.code = j.code; } catch {}
    throw e;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { name, email, whatsapp, notify_email, notify_whatsapp, source, tags } = req.body;

  // Write to subscribers table (existing behaviour)
  try {
    await supabase('subscribers', 'POST', {
      name: name || null,
      email: email || null,
      whatsapp: whatsapp || null,
      notify_email: notify_email || false,
      notify_whatsapp: notify_whatsapp || false,
      source: source || 'direct',
      tags: tags || [],
      active: true,
    }, 'return=minimal');
  } catch (err: any) {
    // Pass duplicate error back to client so widget can handle it
    if (err.code === '23505') return res.status(409).json({ code: '23505' });
    console.error('[subscribe] subscribers error:', err.message);
    return res.status(500).json({ error: err.message });
  }

  // Also upsert to CA-024 people table — non-fatal
  if (email || whatsapp) {
    try {
      const contactEmail = email?.trim().toLowerCase();
      if (contactEmail) {
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/upsert_person`, {
          method: 'POST',
          headers: {
            apikey: process.env.SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY!}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            p_email:     contactEmail,
            p_name:      name || '',
            p_phone:     whatsapp || null,
            p_source:    'ic_enrolment',
            p_source_ca: 'CA-019',
          }),
        });
      }
    } catch (personErr: any) {
      console.error('[subscribe] upsert_person error:', personErr.message);
    }
  }

  return res.status(200).json({ ok: true });
}
