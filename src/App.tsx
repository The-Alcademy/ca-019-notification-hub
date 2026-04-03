
import { useState, useEffect, useCallback } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
   CA-019 — NOTIFICATION HUB  v0.2
   Invysible College / The Alcademy

   SUPABASE TABLE — run once in SQL editor:

   CREATE TABLE subscribers (
     id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
     name            text,
     email           text,
     whatsapp        text,
     notify_email    boolean     DEFAULT false,
     notify_whatsapp boolean     DEFAULT false,
     source          text        DEFAULT 'direct',
     tags            text[]      DEFAULT '{}',
     active          boolean     DEFAULT true,
     created_at      timestamptz DEFAULT now()
   );

   CREATE UNIQUE INDEX subscribers_email_unique
     ON subscribers (email) WHERE email IS NOT NULL;

   If the table already exists without the tags column:
   ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

   ENV VARS (all server-side, no VITE_ prefix):
     SUPABASE_URL        SUPABASE_ANON_KEY
     ADMIN_PASSWORD      RESEND_API_KEY

   ROUTING:
     /         → public signup widget (themed per ?source=)
     /#admin   → password-gated admin panel

   SOURCE PARAMETER — controls theme + interest options shown:
     ?source=artyst      The Artyst (burgundy/crimson)
     ?source=ic          Invysible College (gold on near-black)
     ?source=porter      alias for ic
     ?source=tours       Cambridge Tours / Alcademy (forest green)
     ?source=ambulance   Tarot Ambulance (deep crimson)
     ?source=direct      default (same as ic)

   EMBED ON OTHER SITES:
     <iframe src="https://[ca-019-url]/?source=artyst"
             width="100%" height="680" frameborder="0" />
────────────────────────────────────────────────────────────────────────────── */

// ── Types ──────────────────────────────────────────────────────────────────────────────

interface Subscriber {
  id: string;
  name: string | null;
  email: string | null;
  whatsapp: string | null;
  notify_email: boolean;
  notify_whatsapp: boolean;
  source: string;
  tags: string[];
  active: boolean;
  created_at: string;
}

interface Theme {
  pageBg: string; cardBg: string; cardBorder: string;
  inputBg: string; inputBorder: string;
  text: string; muted: string; subtle: string;
  accent: string; accentDim: string; accentFaint: string;
}

interface Interest { id: string; label: string; }

interface SourceConfig {
  theme: Theme;
  orgName: string;
  headline: string;
  subhead: string;
  interests: Interest[];
}

type Step    = "interests" | "channels" | "form" | "success";
type Channel = "email" | "whatsapp";

// ── DB Proxy ───────────────────────────────────────────────────────────────────────────

async function db(path: string, method: string, body?: object, prefer?: string) {
  const res = await fetch("/api/supabase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, method, body, prefer }),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = text ? JSON.parse(text) : {};
    const e: any = new Error(err.message || "DB error");
    e.code = err.code; e.status = res.status;
    throw e;
  }
  return text ? JSON.parse(text) : null;
}

// ── Fonts ──────────────────────────────────────────────────────────────────────────────

const serif = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const sans  = "'Gill Sans', Optima, Calibri, 'Trebuchet MS', sans-serif";
const mono  = "'Courier New', 'Lucida Console', monospace";

// ── Admin colour palette (IC defaults — admin is always IC-themed) ─────────────────────

const C = {
  pageBg:      "#06040a",
  cardBg:      "#0c0910",
  cardBorder:  "#2a1f38",
  inputBg:     "#100d16",
  inputBorder: "#332747",
  text:        "#e5ddd0",
  muted:       "#7a7068",
  subtle:      "#3a3430",
  gold:        "#c49a3c",
  goldDim:     "#7a5e24",
};

// ── Shared styles (sh.label used by admin broadcast section) ───────────────────────────

const sh = {
  label: {
    display: "block",
    color: C.muted,
    fontFamily: sans,
    fontSize: "0.68rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    marginBottom: "0.4rem",
  },
};

// ── Source configs ─────────────────────────────────────────────────────────────────────

const CONFIGS: Record<string, SourceConfig> = {

  artyst: {
    theme: {
      pageBg: "#080406", cardBg: "#110809", cardBorder: "#3f1a24",
      inputBg: "#180c11", inputBorder: "#502234",
      text: "#e8d8d0", muted: "#8a6860", subtle: "#3a2028",
      accent: "#b84a3c", accentDim: "#7a2820", accentFaint: "#2a0e14",
    },
    orgName: "The Artyst",
    headline: "Stay in the Loop",
    subhead: "Events, music, tastings, and nights worth knowing — at 54 Chesterton Road.",
    interests: [
      { id: "events", label: "Events & nights" },
      { id: "wine",   label: "Wine tastings" },
      { id: "music",  label: "Live music" },
      { id: "tarot",  label: "Tarot readings" },
      { id: "ic",     label: "Invysible College talks" },
    ],
  },

  ic: {
    theme: {
      pageBg: "#06040a", cardBg: "#0c0910", cardBorder: "#2a1f38",
      inputBg: "#100d16", inputBorder: "#332747",
      text: "#e5ddd0", muted: "#7a7068", subtle: "#3a3430",
      accent: "#c49a3c", accentDim: "#7a5e24", accentFaint: "#1e1608",
    },
    orgName: "Invysible College",
    headline: "Stay in the Loop",
    subhead: "Faculty talks, courses, new openings, and what's happening at the College.",
    interests: [
      { id: "talks",   label: "Faculty talks" },
      { id: "courses", label: "Courses & programmes" },
      { id: "news",    label: "College news" },
      { id: "events",  label: "Events at The Artyst" },
      { id: "tarot",   label: "Tarot readings" },
    ],
  },

  tours: {
    theme: {
      pageBg: "#040806", cardBg: "#080f0b", cardBorder: "#1c3222",
      inputBg: "#0d1710", inputBorder: "#2a4a38",
      text: "#dce8d5", muted: "#608060", subtle: "#203028",
      accent: "#6aab5c", accentDim: "#3a6032", accentFaint: "#0e2014",
    },
    orgName: "The Alcademy",
    headline: "Stay in the Loop",
    subhead: "New tours, special dates, and what's walking in Cambridge.",
    interests: [
      { id: "wittgenstein", label: "Wittgenstein & Friends" },
      { id: "syd",          label: "Syd Barrett's Cambridge" },
      { id: "new_tours",    label: "New tours" },
      { id: "private",      label: "Private & group walks" },
    ],
  },

  ambulance: {
    theme: {
      pageBg: "#060408", cardBg: "#0d080f", cardBorder: "#3c1022",
      inputBg: "#130912", inputBorder: "#4c1a2a",
      text: "#e8d8da", muted: "#80686a", subtle: "#301820",
      accent: "#c83040", accentDim: "#7a1820", accentFaint: "#240810",
    },
    orgName: "Tarot Ambulance",
    headline: "Seek a Reading",
    subhead: "When the Ambulance is out. Where to find us. What's happening.",
    interests: [
      { id: "readings",  label: "Tarot readings" },
      { id: "schedule",  label: "Ambulance schedule" },
      { id: "ic",        label: "IC events & talks" },
    ],
  },

};

CONFIGS.porter = CONFIGS.ic;
CONFIGS.direct  = CONFIGS.ic;

// ── WIDGET ─────────────────────────────────────────────────────────────────────────────

function Widget() {
  const source = typeof window !== "undefined"
    ? (new URLSearchParams(window.location.search).get("source") ?? "direct")
    : "direct";
  const cfg = CONFIGS[source] ?? CONFIGS.direct;
  const T   = cfg.theme;

  const [step,         setStep]         = useState<Step>("interests");
  const [selInterests, setSelInterests] = useState<string[]>([]);
  const [selChannels,  setSelChannels]  = useState<Channel[]>([]);
  const [name,         setName]         = useState("");
  const [email,        setEmail]        = useState("");
  const [whatsapp,     setWhatsapp]     = useState("");
  const [subStatus,    setSubStatus]    = useState<"idle" | "loading" | "success" | "already" | "error">("idle");
  const [errorMsg,     setErrorMsg]     = useState("");

  const toggleInterest = (id: string) =>
    setSelInterests(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleChannel = (ch: Channel) =>
    setSelChannels(prev => prev.includes(ch) ? prev.filter(x => x !== ch) : [...prev, ch]);

  const submit = async () => {
    const emailVal = email.trim();
    const waVal    = whatsapp.trim();
    if (selChannels.includes("email") && !emailVal) {
      setErrorMsg("Please enter your email address.");
      return;
    }
    if (selChannels.includes("whatsapp") && !waVal) {
      setErrorMsg("Please enter your WhatsApp number.");
      return;
    }
    setSubStatus("loading");
    setErrorMsg("");
    try {
      await db("subscribers", "POST", {
        name:             name.trim() || null,
        email:            emailVal    || null,
        whatsapp:         waVal       || null,
        notify_email:     selChannels.includes("email")    && !!emailVal,
        notify_whatsapp:  selChannels.includes("whatsapp") && !!waVal,
        source,
        tags:             selInterests,
        active:           true,
      }, "return=minimal");
      setSubStatus("success");
      setStep("success");
    } catch (err: any) {
      if (err.code === "23505") { setSubStatus("already"); setStep("success"); }
      else { setSubStatus("error"); setErrorMsg("Something went wrong — please try again."); }
    }
  };

  // ── Shared widget element styles ──────────────────────────────────────────

  const page: React.CSSProperties = {
    minHeight: "100vh", background: T.pageBg,
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "2rem 1rem", fontFamily: serif,
  };
  const card: React.CSSProperties = {
    background: T.cardBg, border: `1px solid ${T.cardBorder}`,
    borderRadius: "2px", padding: "2.5rem 2.5rem 2rem",
    maxWidth: "420px", width: "100%",
  };
  const emblem: React.CSSProperties = {
    color: T.accent, fontSize: "1rem", textAlign: "center",
    marginBottom: "1.5rem", letterSpacing: "0.4em", opacity: 0.8,
  };
  const title: React.CSSProperties = {
    color: T.text, fontFamily: serif, fontSize: "1.9rem", fontWeight: 300,
    textAlign: "center", margin: "0 0 0.6rem", letterSpacing: "0.04em", lineHeight: 1.2,
  };
  const sub: React.CSSProperties = {
    color: T.muted, fontFamily: sans, fontSize: "0.82rem",
    textAlign: "center", lineHeight: 1.65, margin: "0 0 1.75rem", fontWeight: 300,
  };
  const sectionLabel: React.CSSProperties = {
    color: T.muted, fontFamily: sans, fontSize: "0.68rem",
    letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 0.7rem",
  };
  const finePrint: React.CSSProperties = {
    color: T.subtle, fontFamily: sans, fontSize: "0.68rem",
    textAlign: "center", marginTop: "1.5rem", lineHeight: 1.5,
  };
  const backBtn: React.CSSProperties = {
    background: "none", border: "none", color: T.muted, fontFamily: sans,
    fontSize: "0.7rem", letterSpacing: "0.06em", cursor: "pointer",
    padding: 0, marginBottom: "1.4rem", display: "block",
  };
  const primaryBtn = (disabled = false): React.CSSProperties => ({
    width: "100%", background: "transparent", border: `1px solid ${T.accent}`,
    color: T.accent, fontFamily: serif, fontSize: "1rem", letterSpacing: "0.12em",
    padding: "0.75rem", cursor: disabled ? "not-allowed" : "pointer",
    borderRadius: "1px", opacity: disabled ? 0.4 : 1, marginTop: "1.25rem",
  });
  const interestPill = (selected: boolean): React.CSSProperties => ({
    background: selected ? T.accentFaint : "transparent",
    border: `1px solid ${selected ? T.accent : T.cardBorder}`,
    color: selected ? T.text : T.muted,
    fontFamily: sans, fontSize: "0.82rem",
    padding: "0.65rem 0.75rem",
    cursor: "pointer", borderRadius: "1px",
    textAlign: "left", letterSpacing: "0.01em",
    display: "flex", alignItems: "center", gap: "0.5rem",
  });
  const channelCard = (selected: boolean): React.CSSProperties => ({
    background: selected ? T.accentFaint : "transparent",
    border: `1px solid ${selected ? T.accent : T.cardBorder}`,
    color: T.text, fontFamily: sans,
    padding: "1rem 1.1rem",
    cursor: "pointer", borderRadius: "1px", textAlign: "left",
    width: "100%",
  });
  const inputStyle: React.CSSProperties = {
    width: "100%", background: T.inputBg,
    border: `1px solid ${T.inputBorder}`, borderRadius: "1px",
    color: T.text, fontFamily: sans, fontSize: "0.88rem",
    padding: "0.6rem 0.75rem", boxSizing: "border-box", outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", color: T.muted, fontFamily: sans, fontSize: "0.68rem",
    letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.4rem",
  };

  // ── STEP 1 — Interests ────────────────────────────────────────────────────

  if (step === "interests") {
    return (
      <div style={page}>
        <div style={card}>
          <div style={emblem}>◆</div>
          <h1 style={title}>{cfg.headline}</h1>
          <p style={sub}>{cfg.subhead}</p>

          <p style={sectionLabel}>What would you like to hear about?</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem", marginBottom: "0.25rem" }}>
            {cfg.interests.map(({ id, label }) => {
              const sel = selInterests.includes(id);
              return (
                <button key={id} onClick={() => toggleInterest(id)} style={interestPill(sel)}>
                  <span style={{ color: sel ? T.accent : T.subtle, fontSize: "0.65rem", flexShrink: 0 }}>
                    {sel ? "◆" : "○"}
                  </span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {selInterests.length > 0 && (
            <button style={primaryBtn()} onClick={() => setStep("channels")}>
              Continue →
            </button>
          )}

          <p style={finePrint}>{cfg.orgName} · Cambridge</p>
        </div>
      </div>
    );
  }

  // ── STEP 2 — Channels ─────────────────────────────────────────────────────

  if (step === "channels") {
    const channelOptions: { id: Channel; title: string; desc: string }[] = [
      { id: "email",    title: "Email",    desc: "Occasional letters — when something's worth saying." },
      { id: "whatsapp", title: "WhatsApp", desc: "A direct message when things are happening." },
    ];

    return (
      <div style={page}>
        <div style={card}>
          <button style={backBtn} onClick={() => setStep("interests")}>← Back</button>

          <h1 style={title}>How would you like to hear from us?</h1>
          <p style={sub}>Pick one or both. You can unsubscribe at any time.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {channelOptions.map(({ id, title: t, desc }) => {
              const sel = selChannels.includes(id);
              return (
                <button key={id} onClick={() => toggleChannel(id)} style={channelCard(sel)}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", marginBottom: "0.3rem" }}>
                    <span style={{ color: sel ? T.accent : T.subtle, fontSize: "0.65rem", flexShrink: 0 }}>
                      {sel ? "◆" : "○"}
                    </span>
                    <span style={{ fontFamily: serif, fontSize: "1.1rem", fontWeight: 400, color: sel ? T.text : T.muted }}>
                      {t}
                    </span>
                  </div>
                  <p style={{ color: T.muted, fontSize: "0.76rem", margin: 0, paddingLeft: "1.2rem", lineHeight: 1.55 }}>
                    {desc}
                  </p>
                </button>
              );
            })}
          </div>

          {selChannels.length > 0 && (
            <button style={primaryBtn()} onClick={() => setStep("form")}>
              Continue →
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── STEP 3 — Form fields ──────────────────────────────────────────────────

  if (step === "form") {
    const wantsEmail = selChannels.includes("email");
    const wantsWA    = selChannels.includes("whatsapp");

    return (
      <div style={page}>
        <div style={card}>
          <button style={backBtn} onClick={() => setStep("channels")}>← Back</button>

          <h1 style={title}>Almost there</h1>
          <p style={sub}>Just the details we need to reach you.</p>

          <div style={{ marginBottom: "1.1rem" }}>
            <label style={labelStyle}>
              Name <span style={{ color: T.subtle, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
            </label>
            <input
              style={inputStyle}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              onFocus={e => e.target.style.borderColor = T.accentDim}
              onBlur={e  => e.target.style.borderColor = T.inputBorder}
            />
          </div>

          {wantsEmail && (
            <div style={{ marginBottom: "1.1rem" }}>
              <label style={labelStyle}>Email</label>
              <input
                style={inputStyle}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                onFocus={e => e.target.style.borderColor = T.accentDim}
                onBlur={e  => e.target.style.borderColor = T.inputBorder}
                autoFocus
              />
            </div>
          )}

          {wantsWA && (
            <div style={{ marginBottom: "1.1rem" }}>
              <label style={labelStyle}>WhatsApp number</label>
              <input
                style={inputStyle}
                type="tel"
                value={whatsapp}
                onChange={e => setWhatsapp(e.target.value)}
                placeholder="+44 7700 000000"
                onFocus={e => e.target.style.borderColor = T.accentDim}
                onBlur={e  => e.target.style.borderColor = T.inputBorder}
                autoFocus={!wantsEmail}
              />
            </div>
          )}

          {errorMsg && (
            <p style={{ color: "#c44444", fontFamily: sans, fontSize: "0.78rem", textAlign: "center", margin: "0.25rem 0" }}>
              {errorMsg}
            </p>
          )}

          <button style={primaryBtn(subStatus === "loading")} onClick={submit} disabled={subStatus === "loading"}>
            {subStatus === "loading" ? "—" : "Join"}
          </button>

          <p style={finePrint}>No spam. No algorithms. Just things worth your time.</p>
        </div>
      </div>
    );
  }

  // ── STEP 4 — Success ──────────────────────────────────────────────────────

  const already = subStatus === "already";
  const showWA  = selChannels.includes("whatsapp") && whatsapp.trim();

  return (
    <div style={page}>
      <div style={card}>
        <div style={{ ...emblem, letterSpacing: "0.5em" }}>◆ ◆ ◆</div>
        <h1 style={title}>{already ? "Already with us." : "You're in."}</h1>
        <p style={sub}>
          {already
            ? "We already have your details — we'll be in touch."
            : `We'll reach you when something worth knowing is happening at ${cfg.orgName}.`}
        </p>

        {showWA && (
          <div style={{ background: T.pageBg, border: `1px solid ${T.cardBorder}`, borderRadius: "1px", padding: "1.2rem", textAlign: "center", marginTop: "0.5rem" }}>
            <p style={{ color: T.muted, fontFamily: sans, fontSize: "0.78rem", margin: "0 0 0.8rem", lineHeight: 1.6 }}>
              To receive WhatsApp messages, open a conversation with us first — WhatsApp requires an initial message from you.
            </p>
            <a
              href={`https://wa.me/447878849720?text=${encodeURIComponent(`Hello — I just signed up for updates from ${cfg.orgName}.`)}`}
              target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-block", color: "#4caf7d", fontFamily: sans, fontSize: "0.82rem", border: "1px solid #2a5a3a", padding: "0.45rem 1.1rem", borderRadius: "1px", textDecoration: "none" }}
            >
              Open WhatsApp →
            </a>
          </div>
        )}

        <p style={finePrint}>{cfg.orgName} · Cambridge</p>
      </div>
    </div>
  );
}

// ── ADMIN ──────────────────────────────────────────────────────────────────────────────

const A: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh", background: C.pageBg, color: C.text,
    fontFamily: sans, fontSize: "0.85rem",
  },
  header: {
    background: C.cardBg, borderBottom: `1px solid ${C.cardBorder}`,
    padding: "0.9rem 2rem", display: "flex",
    alignItems: "center", justifyContent: "space-between",
  },
  headerTitle: {
    fontFamily: serif, fontSize: "1.05rem", color: C.text,
    fontWeight: 400, margin: 0, letterSpacing: "0.06em",
  },
  content: { padding: "1.75rem 2rem", maxWidth: "1100px", margin: "0 auto" },
  statsGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "0.75rem", marginBottom: "1.75rem",
  },
  statCard: {
    background: C.cardBg, border: `1px solid ${C.cardBorder}`,
    borderRadius: "1px", padding: "1rem", textAlign: "center",
  },
  statNum: { fontFamily: serif, fontSize: "2rem", color: C.gold, fontWeight: 300, lineHeight: 1 },
  statLabel: { fontFamily: sans, fontSize: "0.62rem", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "0.3rem" },
  tabs: { display: "flex", borderBottom: `1px solid ${C.cardBorder}`, marginBottom: "1.5rem" },
  filterRow: { display: "flex", gap: "0.6rem", marginBottom: "1.1rem", flexWrap: "wrap", alignItems: "center" },
  select: {
    background: C.inputBg, border: `1px solid ${C.inputBorder}`, color: C.text,
    fontFamily: sans, fontSize: "0.75rem", padding: "0.35rem 0.6rem",
    borderRadius: "1px", cursor: "pointer", outline: "none",
  },
  th: {
    textAlign: "left", color: C.muted, letterSpacing: "0.08em",
    textTransform: "uppercase", fontSize: "0.62rem",
    padding: "0.5rem 0.75rem", borderBottom: `1px solid ${C.cardBorder}`, fontWeight: 400,
  } as React.CSSProperties,
  td: {
    padding: "0.55rem 0.75rem", borderBottom: `1px solid #120f18`,
    color: C.text, verticalAlign: "middle",
  } as React.CSSProperties,
  actionBtn: {
    background: "transparent", border: `1px solid ${C.inputBorder}`, color: C.muted,
    fontFamily: sans, fontSize: "0.65rem", padding: "0.18rem 0.5rem",
    cursor: "pointer", borderRadius: "1px", marginRight: "0.3rem", letterSpacing: "0.04em",
  },
  broadcastWrap: {
    background: C.cardBg, border: `1px solid ${C.cardBorder}`,
    borderRadius: "2px", padding: "1.75rem 2rem", maxWidth: "660px",
  },
  broadcastInput: {
    width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`,
    color: C.text, fontFamily: sans, fontSize: "0.85rem",
    padding: "0.55rem 0.75rem", boxSizing: "border-box", borderRadius: "1px", outline: "none",
  } as React.CSSProperties,
  broadcastTextarea: {
    width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`,
    color: C.text, fontFamily: mono, fontSize: "0.78rem", padding: "0.75rem",
    boxSizing: "border-box", borderRadius: "1px", minHeight: "180px",
    resize: "vertical", outline: "none", lineHeight: 1.5,
  } as React.CSSProperties,
  sendBtn: {
    background: "transparent", border: `1px solid ${C.gold}`, color: C.gold,
    fontFamily: serif, fontSize: "0.95rem", letterSpacing: "0.1em",
    padding: "0.6rem 1.6rem", cursor: "pointer", borderRadius: "1px",
  },
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    background: "transparent", border: "none",
    borderBottom: active ? `2px solid ${C.gold}` : "2px solid transparent",
    color: active ? C.gold : C.muted,
    fontFamily: sans, fontSize: "0.7rem", letterSpacing: "0.1em",
    textTransform: "uppercase", padding: "0.7rem 1.2rem",
    cursor: "pointer", marginBottom: "-1px",
  };
}

function pillStyle(type: "email" | "wa" | "inactive"): React.CSSProperties {
  const configs = {
    email:    { bg: "#1a2e1a", color: "#4aaa6a", border: "#2a4a2a" },
    wa:       { bg: "#1a2230", color: "#4a8aaa", border: "#2a3a4a" },
    inactive: { bg: "#1e1620", color: "#5a4a5a", border: "#2e2030" },
  };
  const { bg, color, border } = configs[type];
  return {
    display: "inline-block", padding: "0.12rem 0.4rem", borderRadius: "1px",
    fontSize: "0.6rem", letterSpacing: "0.06em", textTransform: "uppercase",
    background: bg, color, border: `1px solid ${border}`, marginRight: "0.2rem",
  };
}

function tagChip(): React.CSSProperties {
  return {
    display: "inline-block", padding: "0.1rem 0.35rem", borderRadius: "1px",
    fontSize: "0.58rem", letterSpacing: "0.04em",
    background: "#1a1830", color: "#6a6aaa", border: "1px solid #2a2848",
    marginRight: "0.15rem", marginBottom: "0.1rem",
  };
}

function Admin() {
  const [authed,      setAuthed]      = useState(false);
  const [password,    setPassword]    = useState("");
  const [authPw,      setAuthPw]      = useState("");
  const [pwError,     setPwError]     = useState(false);
  const [tab,         setTab]         = useState<"subscribers" | "email" | "whatsapp">("subscribers");
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading,     setLoading]     = useState(false);

  const [fActive, setFActive] = useState("active");
  const [fSource, setFSource] = useState("all");
  const [fType,   setFType]   = useState("all");

  const [subject,    setSubject]    = useState("");
  const [emailBody,  setEmailBody]  = useState("");
  const [sending,    setSending]    = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [waMsg,      setWaMsg]      = useState("");

  const checkAuth = async () => {
    setPwError(false);
    const res = await fetch("/api/check-auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) { setAuthed(true); setAuthPw(password); }
    else setPwError(true);
  };

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await db("subscribers?order=created_at.desc&select=*", "GET");
      setSubscribers(data ?? []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed) fetchSubs(); }, [authed, fetchSubs]);

  const toggleActive = async (sub: Subscriber) => {
    await db(`subscribers?id=eq.${sub.id}`, "PATCH", { active: !sub.active });
    setSubscribers(prev => prev.map(s => s.id === sub.id ? { ...s, active: !s.active } : s));
  };

  const deleteSub = async (id: string) => {
    if (!confirm("Delete this subscriber permanently?")) return;
    await db(`subscribers?id=eq.${id}`, "DELETE");
    setSubscribers(prev => prev.filter(s => s.id !== id));
  };

  const allSources = Array.from(new Set(subscribers.map(s => s.source))).sort();

  const filtered = subscribers.filter(s => {
    if (fActive === "active"   && !s.active) return false;
    if (fActive === "inactive" &&  s.active) return false;
    if (fSource !== "all" && s.source !== fSource) return false;
    if (fType === "email"    && !s.notify_email)    return false;
    if (fType === "whatsapp" && !s.notify_whatsapp) return false;
    if (fType === "both"     && !(s.notify_email && s.notify_whatsapp)) return false;
    return true;
  });

  const emailRecipients = filtered.filter(s => s.notify_email && s.email && s.active);

  const sendBroadcast = async () => {
    if (!subject.trim() || !emailBody.trim()) return;
    if (emailRecipients.length === 0) {
      setSendResult({ ok: false, msg: "No email recipients match current filters." }); return;
    }
    if (!confirm(`Send to ${emailRecipients.length} subscriber${emailRecipients.length > 1 ? "s" : ""}?`)) return;
    setSending(true); setSendResult(null);
    try {
      const res = await fetch("/api/send-broadcast", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body: emailBody, recipients: emailRecipients.map(s => s.email!), password: authPw }),
      });
      setSendResult(res.ok
        ? { ok: true,  msg: `Sent to ${emailRecipients.length} subscriber${emailRecipients.length > 1 ? "s" : ""}.` }
        : { ok: false, msg: "Send failed — check Resend config and API key." });
    } catch { setSendResult({ ok: false, msg: "Network error." }); }
    finally { setSending(false); }
  };

  const waSubs = filtered.filter(s => s.notify_whatsapp && s.whatsapp && s.active);

  const waLink = (number: string, message: string) => {
    const num = number.replace(/\D/g, "").replace(/^0/, "44");
    return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
  };

  // ── Auth gate ─────────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: C.pageBg, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", fontFamily: serif }}>
        <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: "2px", padding: "2.5rem", maxWidth: "300px", width: "100%" }}>
          <div style={{ color: C.gold, fontSize: "1rem", textAlign: "center", marginBottom: "1.5rem", letterSpacing: "0.4em" }}>⚿</div>
          <h1 style={{ color: C.text, fontFamily: serif, fontSize: "1.3rem", fontWeight: 300, textAlign: "center", margin: "0 0 1.25rem" }}>Admin</h1>
          <input
            style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: "1px", color: C.text, fontFamily: sans, fontSize: "0.88rem", padding: "0.6rem 0.75rem", boxSizing: "border-box", outline: "none", marginBottom: "0.75rem" }}
            type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && checkAuth()}
            autoFocus
          />
          {pwError && <p style={{ color: "#c44444", fontFamily: sans, fontSize: "0.78rem", textAlign: "center", marginBottom: "0.75rem" }}>Incorrect password.</p>}
          <button style={{ width: "100%", background: "transparent", border: `1px solid ${C.gold}`, color: C.gold, fontFamily: serif, fontSize: "1rem", letterSpacing: "0.12em", padding: "0.75rem", cursor: "pointer", borderRadius: "1px" }} onClick={checkAuth}>
            Enter
          </button>
        </div>
      </div>
    );
  }

  // ── Admin shell ───────────────────────────────────────────────────────────

  return (
    <div style={A.page}>
      <div style={A.header}>
        <h1 style={A.headerTitle}>CA-019 · Notification Hub</h1>
        <span style={{ color: C.muted, fontSize: "0.72rem" }}>
          {subscribers.filter(s => s.active).length} active · {subscribers.length} total
        </span>
      </div>

      <div style={A.content}>
        <div style={A.statsGrid}>
          {[
            { n: subscribers.filter(s => s.active).length,                      label: "Active" },
            { n: subscribers.filter(s => s.active && s.notify_email).length,    label: "Email" },
            { n: subscribers.filter(s => s.active && s.notify_whatsapp).length, label: "WhatsApp" },
            { n: subscribers.filter(s => !s.active).length,                     label: "Inactive" },
            { n: allSources.length,                                              label: "Sources" },
          ].map(({ n, label }) => (
            <div key={label} style={A.statCard}>
              <div style={A.statNum}>{n}</div>
              <div style={A.statLabel}>{label}</div>
            </div>
          ))}
        </div>

        <div style={A.tabs}>
          {(["subscribers", "email", "whatsapp"] as const).map(t => (
            <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
              {t === "subscribers" ? "Subscribers" : t === "email" ? "Email Broadcast" : "WhatsApp"}
            </button>
          ))}
        </div>

        {/* SUBSCRIBERS */}
        {tab === "subscribers" && (
          <>
            <div style={A.filterRow}>
              <select style={A.select} value={fActive} onChange={e => setFActive(e.target.value)}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select style={A.select} value={fSource} onChange={e => setFSource(e.target.value)}>
                <option value="all">All sources</option>
                {allSources.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select style={A.select} value={fType} onChange={e => setFType(e.target.value)}>
                <option value="all">All types</option>
                <option value="email">Email only</option>
                <option value="whatsapp">WhatsApp only</option>
                <option value="both">Both</option>
              </select>
              <span style={{ color: C.muted, fontSize: "0.72rem", marginLeft: "auto" }}>{filtered.length} shown</span>
              <button style={A.actionBtn} onClick={fetchSubs}>↺ Refresh</button>
            </div>

            {loading ? <p style={{ color: C.muted }}>Loading…</p> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr>
                      {["Name", "Email", "WhatsApp", "Channels", "Interests", "Source", "Joined", ""].map(h => (
                        <th key={h} style={A.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(sub => (
                      <tr key={sub.id} style={{ opacity: sub.active ? 1 : 0.4 }}>
                        <td style={A.td}>{sub.name ?? <span style={{ color: C.subtle }}>—</span>}</td>
                        <td style={{ ...A.td, color: C.muted, fontSize: "0.75rem" }}>{sub.email ?? "—"}</td>
                        <td style={{ ...A.td, color: C.muted, fontSize: "0.75rem" }}>{sub.whatsapp ?? "—"}</td>
                        <td style={A.td}>
                          {sub.notify_email    && <span style={pillStyle("email")}>Email</span>}
                          {sub.notify_whatsapp && <span style={pillStyle("wa")}>WA</span>}
                          {!sub.active         && <span style={pillStyle("inactive")}>Off</span>}
                        </td>
                        <td style={{ ...A.td, maxWidth: "160px" }}>
                          {(sub.tags ?? []).map(t => <span key={t} style={tagChip()}>{t}</span>)}
                        </td>
                        <td style={{ ...A.td, color: C.muted, fontSize: "0.72rem" }}>{sub.source}</td>
                        <td style={{ ...A.td, color: C.muted, fontSize: "0.7rem", whiteSpace: "nowrap" }}>
                          {new Date(sub.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                        </td>
                        <td style={{ ...A.td, whiteSpace: "nowrap" }}>
                          <button style={A.actionBtn} onClick={() => toggleActive(sub)}>
                            {sub.active ? "Deactivate" : "Activate"}
                          </button>
                          <button style={{ ...A.actionBtn, color: "#8a3030", borderColor: "#3a2020" }} onClick={() => deleteSub(sub.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && !loading && (
                  <p style={{ color: C.muted, textAlign: "center", marginTop: "2rem" }}>No subscribers match current filters.</p>
                )}
              </div>
            )}
          </>
        )}

        {/* EMAIL BROADCAST */}
        {tab === "email" && (
          <div style={A.broadcastWrap}>
            <p style={{ color: C.muted, fontSize: "0.78rem", marginTop: 0, marginBottom: "1.4rem", lineHeight: 1.6 }}>
              Sends to all <strong style={{ color: C.text }}>active email subscribers</strong> matching current filters.{" "}
              <strong style={{ color: C.gold }}>{emailRecipients.length} recipient{emailRecipients.length !== 1 ? "s" : ""}</strong> selected.
            </p>
            <div style={{ marginBottom: "1.1rem" }}>
              <label style={{ ...sh.label, marginBottom: "0.4rem" }}>Subject line</label>
              <input style={A.broadcastInput} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Something happening at The Artyst…" />
            </div>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ ...sh.label, marginBottom: "0.4rem" }}>
                Body <span style={{ color: C.subtle, textTransform: "none", letterSpacing: 0 }}>(HTML or plain text)</span>
              </label>
              <textarea style={A.broadcastTextarea} value={emailBody} onChange={e => setEmailBody(e.target.value)}
                placeholder={"<p>Hello,</p>\n\n<p>Something is happening at The Artyst…</p>\n\n<p>—<br/>The Invysible College</p>"} />
            </div>
            {sendResult && (
              <p style={{ color: sendResult.ok ? "#4caf7d" : "#c44444", fontSize: "0.8rem", marginBottom: "0.75rem" }}>{sendResult.msg}</p>
            )}
            <button style={{ ...A.sendBtn, opacity: sending ? 0.55 : 1 }} onClick={sendBroadcast} disabled={sending}>
              {sending ? "Sending…" : "Send Broadcast"}
            </button>
          </div>
        )}

        {/* WHATSAPP */}
        {tab === "whatsapp" && (
          <div style={A.broadcastWrap}>
            <p style={{ color: C.muted, fontSize: "0.78rem", marginTop: 0, marginBottom: "1.4rem", lineHeight: 1.6 }}>
              <strong style={{ color: C.gold }}>{waSubs.length}</strong> active WhatsApp subscriber{waSubs.length !== 1 ? "s" : ""} in current filter.
              Write your message, then tap <em>Send →</em> for each recipient.
            </p>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ ...sh.label, marginBottom: "0.4rem" }}>Message</label>
              <textarea style={A.broadcastTextarea} value={waMsg} onChange={e => setWaMsg(e.target.value)} placeholder="Hello from the Invysible College…" />
            </div>
            {waMsg.trim() && waSubs.length > 0 && (
              <div>
                <div style={{ ...sh.label, marginBottom: "0.65rem" }}>
                  Send to {waSubs.length} subscriber{waSubs.length !== 1 ? "s" : ""}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {waSubs.map(sub => (
                    <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: "1px", padding: "0.5rem 0.75rem" }}>
                      <span style={{ flex: 1, color: C.text, fontSize: "0.8rem" }}>
                        {sub.name ?? sub.whatsapp}
                        <span style={{ color: C.muted }}> · {sub.whatsapp}</span>
                        {sub.source !== "direct" && <span style={{ color: C.subtle, fontSize: "0.68rem" }}> [{sub.source}]</span>}
                      </span>
                      <a href={waLink(sub.whatsapp!, waMsg)} target="_blank" rel="noopener noreferrer"
                        style={{ color: "#4caf7d", fontFamily: sans, fontSize: "0.7rem", letterSpacing: "0.05em", border: "1px solid #2a5a3a", padding: "0.2rem 0.65rem", borderRadius: "1px", textDecoration: "none", whiteSpace: "nowrap" }}>
                        Send →
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {waMsg.trim() && waSubs.length === 0 && (
              <p style={{ color: C.muted, fontSize: "0.8rem" }}>No active WhatsApp subscribers match current filters.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── APP — hash-based routing ───────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<"widget" | "admin">(() =>
    typeof window !== "undefined" && window.location.hash === "#admin" ? "admin" : "widget"
  );

  useEffect(() => {
    const handle = () => setView(window.location.hash === "#admin" ? "admin" : "widget");
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);

  return view === "admin" ? <Admin /> : <Widget />;
}
