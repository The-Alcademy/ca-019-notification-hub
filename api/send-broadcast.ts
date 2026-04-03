import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { subject, body, recipients, password } = req.body as {
    subject: string;
    body: string;
    recipients: string[];
    password: string;
  };

  // Auth check
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  if (!recipients || recipients.length === 0) {
    return res.status(400).json({ error: "No recipients" });
  }

  if (!subject?.trim() || !body?.trim()) {
    return res.status(400).json({ error: "Subject and body required" });
  }

  // Resend batch — max 100 per call; chunk if needed
  const FROM = "Invysible College <hello@invysiblecollege.net>";
  const CHUNK = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < recipients.length; i += CHUNK) {
    chunks.push(recipients.slice(i, i + CHUNK));
  }

  try {
    for (const chunk of chunks) {
      const emails = chunk.map(to => ({
        from: FROM,
        to,
        subject,
        html: body,
      }));

      const response = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify(emails),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error("Resend error:", err);
        return res.status(500).json({ error: "Resend API error", detail: err });
      }
    }

    return res.status(200).json({ ok: true, sent: recipients.length });
  } catch (err) {
    console.error("Broadcast error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
