import { useEffect, useId, useRef, useState } from "react";
import { COUNTRIES, compat, fmtDur, siteGroup } from "./meta.js";

export function Icon({ d, size = 22, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d ? <path d={d} /> : children}
    </svg>
  );
}
export const ICONS = {
  today: <><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></>,
  offers: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></>,
  apps: <><rect x="3" y="15" width="18" height="5" rx="2.5" /><rect x="6" y="9.5" width="12" height="5" rx="2.5" /><rect x="9" y="4" width="6" height="4.5" rx="2.25" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  sync: <><path d="M20 11A8 8 0 0 0 5.6 6.3L4 8M4 4v4h4M4 13a8 8 0 0 0 14.4 4.7L20 16M20 20v-4h-4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></>,
};

export function Cp({ score }) {
  const c = compat(score);
  return <span className={`cp t${c.n}`}>{score == null ? "Compatibilité non évaluée" : `Compatibilité ${c.label.toLowerCase()}`}</span>;
}

export function Seg({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, text, n]) => (
        <button key={String(v)} type="button" aria-pressed={String(value) === String(v)} onClick={() => onChange(v)}>
          {text}{n != null && <span className="n">{n}</span>}
        </button>
      ))}
    </div>
  );
}

/** Divulgation progressive : le détail avancé reste caché derrière un libellé. */
export function Disc({ label, children, open: initial = false }) {
  const [open, setOpen] = useState(initial);
  return (
    <div>
      <button type="button" className="disc" aria-expanded={open} onClick={() => setOpen(!open)}>{label}</button>
      {open && <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>}
    </div>
  );
}

export function Switch({ checked, onChange, children }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /><i /><span>{children}</span>
    </label>
  );
}

export function Field({ label, value, onChange, type = "text", placeholder = "", area, rows = 4 }) {
  const id = useId();
  return (
    <label className="f" htmlFor={id}>
      {label}
      {area
        ? <textarea id={id} className="input" rows={rows} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        : <input id={id} className="input" type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}
    </label>
  );
}

/** Saisie de puces : Entrée ou virgule ajoute, × retire, suggestions cliquables. */
export function ChipBox({ values, onChange, placeholder, suggestions = [] }) {
  const [t, setT] = useState("");
  const add = (v) => {
    const s = v.trim();
    if (s && !values.some((x) => x.toLowerCase() === s.toLowerCase())) onChange([...values, s]);
    setT("");
  };
  const sugg = suggestions.filter((x) => !values.some((v) => v.toLowerCase() === x.toLowerCase())).slice(0, 6);
  return (
    <>
      <div className="chipbox">
        {values.map((v, i) => (
          <span key={v + i} className="chip ok">{v} <button type="button" aria-label={`Retirer ${v}`} onClick={() => onChange(values.filter((_, k) => k !== i))}>×</button></span>
        ))}
        <input value={t} placeholder={placeholder} aria-label={placeholder}
          onChange={(e) => setT(e.target.value)} onBlur={() => t.trim() && add(t)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(t); } else if (e.key === "Backspace" && !t && values.length) onChange(values.slice(0, -1)); }} />
      </div>
      {sugg.length > 0 && <div className="sugg">{sugg.map((x) => <button key={x} type="button" onClick={() => add(x)}>+ {x}</button>)}</div>}
    </>
  );
}

export function Foot() {
  return (
    <div className="foot">
      <span>Cairn garde tout sur ton ordinateur.</span>
      <span>Cairn respecte les règles de chaque site : un site qui bloque l’accès est ignoré, jamais contourné.</span>
    </div>
  );
}

export function Empty({ title, children, action }) {
  return <div className="empty">{title && <h3>{title}</h3>}{children && <p>{children}</p>}{action}</div>;
}

export function Ring({ pct, size, label }) {
  return <div className="ring in" style={{ "--p": pct, ...(size ? { width: size, height: size } : {}) }} role="img" aria-label={label || `${pct}%`}><span>{pct}%</span></div>;
}

/** Le cairn : une pierre par étape franchie. */
export function CairnChart({ counts }) {
  const stages = [["saved", "À voir", "--st1"], ["applied", "Postulé", "--st2"], ["interview", "Entretien", "--st3"], ["offer", "Offre", "--st4"]];
  const H = 36, gap = 3, cx = 120, off = [-5, 6, -4, 3];
  let y = 206;
  const rj = counts.rejected || 0;
  return (
    <svg className="cairn" viewBox="0 0 370 240" width="100%" role="img"
      aria-label={`Candidatures : ${stages.map((s) => `${counts[s[0]] || 0} ${s[1]}`).join(", ")}, ${rj} refusé`}>
      {stages.map((s, i) => {
        const n = counts[s[0]] || 0, w = n ? Math.min(180, 84 + n * 24) : 64, x = cx - w / 2 + off[i];
        y -= H + gap;
        const cy = y;
        return (
          <g key={s[0]}>
            {n
              ? <rect className="stone" style={{ "--d": `${i * 130}ms`, fill: `var(${s[2]})` }} x={x} y={cy} width={w} height={H} rx="17" />
              : <rect x={x} y={cy} width={w} height={H} rx="17" fill="none" stroke="var(--line2)" strokeWidth="1.5" strokeDasharray="4 4" />}
            <line x1={x + w + 8} y1={cy + H / 2} x2="250" y2={cy + H / 2} stroke="var(--line2)" />
            <text x="258" y={cy + H / 2 + 5}>{s[1]}</text>
            <text className="cnt" x="356" y={cy + H / 2 + 5} textAnchor="end">{n}</text>
          </g>
        );
      })}
      <line x1="10" y1="209" x2="232" y2="209" stroke="var(--line2)" strokeWidth="2" strokeLinecap="round" />
      {Array.from({ length: Math.min(rj, 5) }, (_, k) => <rect key={k} className="stone" style={{ "--d": `${600 + k * 80}ms`, fill: "var(--st5)" }} x={30 + k * 46} y="216" width="42" height="14" rx="7" />)}
      <text x="258" y="228">Refusé</text><text className="cnt" x="356" y="228" textAnchor="end">{rj}</text>
    </svg>
  );
}

export function CairnMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <rect x="3" y="20" width="24" height="8" rx="4" fill="var(--st1)" />
      <rect x="7" y="11.5" width="16" height="8" rx="4" fill="var(--st2)" />
      <rect x="10.5" y="3" width="10" height="7.5" rx="3.75" fill="var(--st4)" />
    </svg>
  );
}

/** Fenêtre modale : piège le focus, Échap ferme, restitue le focus. */
export function Modal({ onClose, label, kind = "sheet", cls = "", scrim = "", children }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    document.documentElement.classList.add("lock");
    const el = ref.current;
    el?.focus();
    const key = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab" && el) {
        const f = [...el.querySelectorAll("button:not([disabled]),input,select,textarea,a[href],[tabindex]:not([tabindex='-1'])")].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const a = f[0], b = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); document.documentElement.classList.remove("lock"); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className={`scrim ${scrim}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`${kind} ${cls}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div>
    </div>
  );
}
export const MHead = ({ title, sub, onClose }) => (
  <div className="mhead">
    <div style={{ flex: 1, minWidth: 0 }}><h2>{title}</h2>{sub && <div className="small muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}</div>
    <button type="button" className="iconbtn" onClick={onClose} aria-label="Fermer">×</button>
  </div>
);
export const Stepper = ({ names, step, onGo }) => (
  <div className="stepper">
    {names.map((x, i) => (
      <button key={x} type="button" className={i + 1 < step ? "done" : ""} aria-current={i + 1 === step ? "step" : undefined} onClick={() => onGo(i + 1)}>
        <i>{i + 1 < step ? "✓" : i + 1}</i>{x}
      </button>
    ))}
  </div>
);

// --- Progression d'une recherche / actualisation ------------------------------------
export function progressView(progress, refresh, run) {
  // Regroupe les sources techniques en lignes compréhensibles (ex. LinkedIn, Indeed… = une ligne).
  const groups = new Map();
  Object.entries(progress?.sources || {}).forEach(([id, s]) => {
    const g = siteGroup(id, s.label);
    const cur = groups.get(g.key) || { label: g.name, status: "done", count: 0, error: null, parts: 0, errs: 0 };
    cur.parts++; cur.count += s.count || 0;
    if (s.status === "running") cur.status = "running";
    if (s.status === "error") cur.errs++;
    groups.set(g.key, cur);
  });
  const srcs = [...groups.values()].map((g) => (g.status !== "running" && g.errs === g.parts ? { ...g, status: "error" } : g));
  const n = srcs.length, done = srcs.filter((s) => s.status !== "running").length;
  const frac = n ? done / n : 0;
  const isRef = !!refresh?.running;
  const idx = Math.max(1, refresh?.index || 1), tot = Math.max(1, refresh?.total || 1);
  const pct = Math.min(99, Math.round((isRef ? (idx - 1 + frac) / tot : frac) * 100));
  const mode = progress?.mode || run?.mode || refresh?.mode;
  const kind = mode === "deep" ? " approfondie" : mode === "fast" ? " rapide" : "";
  const title = isRef ? `Actualisation${kind}${tot > 1 ? ` · recherche ${idx} sur ${tot}` : ""}` : `Recherche${kind}`;
  const found = progress?.found || 0;
  const summary = n
    ? `${done} source${done > 1 ? "s" : ""} sur ${n} · ${found} offre${found > 1 ? "s" : ""} trouvée${found > 1 ? "s" : ""}`
    : "Démarrage…";
  return { srcs, n, done, pct, title, found, summary, indeterminate: !n, label: isRef ? refresh?.label : run?.label, elapsed: Math.round(progress?.elapsed || 0) };
}

const STATUS_TXT = { running: "Recherche…", done: "Terminé", error: "Indisponible" };
export function SourceList({ srcs }) {
  if (!srcs.length) return <p className="muted small">Les sources apparaissent ici dès qu’elles sont consultées.</p>;
  return (
    <ul className="plist">
      {srcs.map((s) => (
        <li key={s.label} className={s.status}>
          <i aria-hidden="true" />
          <span className="nm">{s.label}</span>
          <span className="ct">{s.count ? `${s.count} offre${s.count > 1 ? "s" : ""}` : ""}</span>
          <span className="stt" title={s.status === "error" ? "Ce site n’a pas répondu. Cairn passe au suivant." : ""}>{STATUS_TXT[s.status] || s.status}</span>
        </li>
      ))}
    </ul>
  );
}
function Bar({ v }) {
  return <div className={`pbar${v.indeterminate ? " ind" : ""}`} role="progressbar" aria-label={v.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v.indeterminate ? undefined : v.pct}><i style={{ width: v.indeterminate ? undefined : `${v.pct}%` }} /></div>;
}

/** Bandeau global : où en est la recherche, avec le détail site par site. */
export function ProgressStrip({ progress, refresh, run, onSeeOffers }) {
  const [open, setOpen] = useState(false);
  const on = !!run || !!refresh?.running || !!progress?.running;
  if (!on) return null;
  const v = progressView(progress, refresh, run);
  return (
    <div className="pstrip" role="status" aria-live="polite">
      <div className="pline">
        <b>{v.title}</b>
        <span className="muted">{v.summary}</span>
        {v.label && <span className="muted small pl-label">{v.label}</span>}
        <span className="sp" />
        {v.found > 0 && <button type="button" className="btn quiet sm" onClick={onSeeOffers}>Voir les offres</button>}
        <button type="button" className="btn quiet sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Masquer" : "Détails"}</button>
      </div>
      <Bar v={v} />
      {open && (
        <div className="pdet card">
          <SourceList srcs={v.srcs} />
          <p className="muted small" style={{ marginTop: 10 }}>Durée : {fmtDur(v.elapsed)}. Si un site refuse l’accès, Cairn passe au suivant sans jamais contourner ses règles.</p>
        </div>
      )}
    </div>
  );
}

/** Même information, intégrée dans une page (parcours guidé). */
export function ProgressBody({ progress, refresh, run, onSeeOffers }) {
  const v = progressView(progress, refresh, run);
  return (
    <div className="runbox" aria-live="polite">
      <div className="row"><b>{v.title}</b><span className="muted">{v.summary}</span><span className="sp" />{v.found > 0 && <button type="button" className="btn sm" onClick={onSeeOffers}>Voir les offres trouvées</button>}</div>
      <Bar v={v} />
      <SourceList srcs={v.srcs} />
    </div>
  );
}

/** Liste déroulante de pays (partout où l'on choisit un pays). */
export function CountrySelect({ value, onChange, label = "Pays", placeholder = "Choisis un pays", options }) {
  const fr = (x, y) => x.label.localeCompare(y.label, "fr");
  let body;
  if (options) body = options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>);
  else {
    const all = COUNTRIES.map((c, i) => ({ value: c.id, label: c.label, top: i < 17 || c.id === "worldwide" }));
    const opt = (o) => <option key={o.value} value={o.value}>{o.label}</option>;
    body = [
      <optgroup key="top" label="Les plus courants">{all.filter((o) => o.top).sort(fr).map(opt)}</optgroup>,
      <optgroup key="all" label="Tous les pays">{all.filter((o) => !o.top).sort(fr).map(opt)}</optgroup>,
    ];
  }
  return (
    <select className="select" aria-label={label} value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {body}
    </select>
  );
}