import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EMPTY_F, useApp } from "../store.jsx";
import { LANGN, LEVELS, MODES, PERIODS, SAL_STEPS, countryKey, jobSite, lastMode } from "../meta.js";
import { CountrySelect, Modal, MHead, Seg } from "../ui.jsx";
import { filterCount, matchJob } from "../pages/OffersPage.jsx";

const plural = (n, s) => `${n} ${s}${n > 1 ? "s" : ""}`;

export function FiltersDrawer({ onClose }) {
  const a = useApp();
  const { f, setF, q, view, jobs, hiddenJobs } = a;
  const ctx = { f, q, view, home: a.home };
  const countBy = (skip, fn) => {
    const m = {};
    jobs.filter((j) => matchJob(j, ctx, skip)).forEach((j) => [].concat(fn(j)).forEach((k) => { if (k != null && k !== "") m[k] = (m[k] || 0) + 1; }));
    return m;
  };
  const cl = countBy("level", (j) => j.level), cg = countBy("lang", (j) => j.langs), cs = countBy("source", (j) => j.sources), cv = countBy("visa", (j) => j.visa || "unknown"), cc = countBy("country", (j) => j.country), cy = countBy("city", (j) => (!f.country || countryKey(j.country) === countryKey(f.country) ? j.city : ""));
  const hiddenN = a.meta.hidden ?? hiddenJobs.length;
  const n = jobs.filter((j) => matchJob(j, ctx)).length;
  const set = (k, v) => setF({ ...f, [k]: v });
  const List = ({ k, items }) => items.length ? (
    <ul className="fl">{items.map(([v, label, c]) => (
      <li key={v}><button type="button" aria-pressed={f[k] === v} onClick={() => set(k, f[k] === v ? "" : v)}><span>{label}</span><span className="n">{c}</span></button></li>))}</ul>
  ) : <p className="small muted">Aucune donnée dans la sélection.</p>;
  const byCount = (m) => Object.keys(m).sort((x, y) => m[y] - m[x]);
  return (
    <Modal onClose={onClose} label="Filtres" kind="drawer" scrim="right">
      <MHead title="Filtres" onClose={onClose} />
      <div className="mbody">
        <div className="fg"><h4>Pays</h4>
          <CountrySelect label="Pays" value={f.country} placeholder="Tous les pays" onChange={(v) => setF({ ...f, country: v, city: "" })}
            options={byCount(cc).map((k) => ({ value: k, label: `${k} (${cc[k]})` }))} /></div>
        <div className="fg"><h4>Ville</h4>
          <select className="select" aria-label="Ville" value={f.city} onChange={(e) => set("city", e.target.value)}>
            <option value="">Toutes les villes</option>
            {byCount(cy).slice(0, 300).map((k) => <option key={k} value={k}>{k} ({cy[k]})</option>)}
          </select></div>
        <div className="fg"><h4>Date de publication</h4>
          <select className="select" aria-label="Date de publication" value={f.period} onChange={(e) => set("period", +e.target.value)}>
            {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div className="fg"><h4>Niveau</h4><List k="level" items={Object.keys(LEVELS).filter((k) => cl[k]).map((k) => [k, LEVELS[k], cl[k]])} /></div>
        <div className="fg"><h4>Langue de l’offre</h4><List k="lang" items={byCount(cg).map((k) => [k, LANGN[k] || k, cg[k]])} /></div>
        <div className="fg"><h4>Visa ou relocation <span>détecté dans l’annonce</span></h4>
          <Seg label="Visa" value={f.visa} onChange={(v) => set("visa", v)} options={[["", "Peu importe"], ["yes", "Possible", cv.yes || 0], ["no", "Non", cv.no || 0]]} /></div>
        <div className="fg"><h4>Salaire annuel minimum <span>en dollars</span></h4><Seg label="Salaire" value={f.salary} onChange={(v) => set("salary", v)} options={SAL_STEPS} /></div>
        <div className="fg"><h4>Compatibilité minimale</h4><Seg label="Compatibilité" value={f.minScore} onChange={(v) => set("minScore", v)} options={[[0, "Toutes"], [65, "Bonne"], [80, "Excellente"]]} /></div>
        <div className="fg"><h4>Site d’origine</h4><List k="source" items={byCount(cs).map((k) => [k, jobSite(k), cs[k]])} /></div>
        {(hiddenN > 0 || f.hidden) && <button type="button" className="btn" onClick={() => { set("hidden", !f.hidden); onClose(); }}>{f.hidden ? "Revenir aux offres" : `Voir les offres masquées${hiddenN ? ` (${hiddenN})` : ""}`}</button>}
      </div>
      <div className="mfoot">
        <button type="button" className="btn quiet" onClick={() => setF({ ...EMPTY_F })} disabled={!filterCount(f)}>Tout effacer</button>
        <span className="sp" /><button type="button" className="btn primary" onClick={onClose}>Voir {plural(n, "offre")}</button>
      </div>
    </Modal>
  );
}

export function SearchesSheet({ onClose }) {
  const a = useApp();
  const busy = !!a.run || a.refresh.running;
  const meta = (x) => [x.total != null && `${x.total} offres`, x.new != null && `${x.new} nouvelles`, (x.last_run || x.last) && new Date(x.last_run || x.last).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })].filter(Boolean).join(" · ");
  return (
    <Modal onClose={onClose} label="Mes recherches">
      <MHead title="Mes recherches" onClose={onClose} />
      <div className="mbody">
        {a.searches.length ? (
          <ul className="rows">{a.searches.map((x) => (
            <li key={x.id}><div className="line"><span className="main"><strong>{x.label || "Recherche"}</strong>{meta(x) && <span>{meta(x)}</span>}</span>
              <button type="button" className="btn sm" disabled={busy} onClick={() => a.askRefresh([x.id])}>Lancer</button>
              <button type="button" className="btn quiet sm" aria-label={`Supprimer ${x.label}`} onClick={() => a.deleteSearch(x.id)}>×</button></div></li>))}</ul>
        ) : <div className="empty"><p>Aucune recherche enregistrée.</p></div>}
      </div>
      <div className="mfoot">
        <button type="button" className="btn" disabled={busy || !a.searches.length} onClick={() => a.askRefresh()}>Tout actualiser</button>
        <span className="sp" /><button type="button" className="btn primary" onClick={() => a.setModal({ type: "wizard" })}>Nouvelle recherche</button>
      </div>
    </Modal>
  );
}

const STEPS = [
  ["1. Cherche", "Dis à Cairn où tu veux travailler. Il interroge LinkedIn, Indeed et les autres sites disponibles, puis garde les offres en mémoire, sans doublons."],
  ["2. Trie", "Chaque offre reçoit une compatibilité avec ton profil, et une phrase qui explique pourquoi. Commence par celles qui te correspondent le mieux."],
  ["3. Postule", "« Préparer ma candidature » compare ton profil à l’offre et écrit une lettre, un CV adapté et un e-mail. Tu relis, tu envoies toi-même."],
  ["4. Suis", "Touche « Suivre cette offre ». Cairn te rappelle de relancer au bon moment."],
];
export function HelpDrawer({ onClose }) {
  return (
    <Modal onClose={onClose} label="Aide" kind="drawer" scrim="right">
      <MHead title="Comment ça marche" onClose={onClose} />
      <div className="mbody">
        {STEPS.map(([t, p]) => <div key={t}><h3>{t}</h3><p className="muted" style={{ marginTop: 4 }}>{p}</p></div>)}
        <div><h3>Petit lexique</h3><p className="muted small" style={{ marginTop: 6 }}>
          <b>Compatibilité</b> : à quel point une offre ressemble à ce que tu cherches.<br />
          <b>Relance</b> : un message de rappel envoyé après ta candidature.<br />
          <b>Site d’origine</b> : le site où l’offre a été publiée.</p></div>
        <p className="small muted">Astuce : appuie sur Ctrl K pour tout faire au clavier.</p>
      </div>
    </Modal>
  );
}

export function Palette({ onClose }) {
  const a = useApp();
  const nav = useNavigate();
  const [t, setT] = useState("");
  const [i, setI] = useState(0);
  const items = useMemo(() => {
    const ql = t.trim().toLowerCase();
    const go = (path) => () => nav(path);
    const acts = [
      ["Nouvelle recherche", () => a.setModal({ type: "wizard" }), true],
      ["Actualiser mes offres", () => a.askRefresh(), true],
      ["Voir mes candidatures", go("/candidatures"), false],
      ["Compléter mon profil", go("/profil?tab=cv"), false],
      ["Régler mes alertes", go("/profil?tab=alerts"), false],
      ["Changer de thème", () => a.toggleTheme(), false],
      ["Ouvrir l’aide", () => a.setModal({ type: "help" }), true],
    ].filter(([l]) => !ql || l.toLowerCase().includes(ql)).map(([l, run, keep]) => ({ t: l, k: "Action", run, keep }));
    const js = ql ? a.jobs.filter((j) => `${j.title} ${j.company}`.toLowerCase().includes(ql)).slice(0, 5).map((j) => ({ t: j.title, s: j.company, k: "Offre", run: () => nav("/offres?open=" + encodeURIComponent(j.url)) })) : [];
    return [...js, ...acts];
  }, [t, a.jobs]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = Math.min(i, Math.max(0, items.length - 1));
  const run = (x) => { if (!x) return; if (!x.keep) onClose(); x.run(); };
  let last = "";
  return (
    <Modal onClose={onClose} label="Rechercher ou agir" cls="pal" scrim="top">
      <input className="palin" autoFocus autoComplete="off" placeholder="Que veux-tu faire ? Une offre, une action…" aria-label="Rechercher ou agir" value={t}
        onChange={(e) => { setT(e.target.value); setI(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setI(Math.min(cur + 1, items.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setI(Math.max(cur - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); run(items[cur]); }
        }} />
      <div className="palres" role="listbox">
        {items.length ? items.map((x, n) => {
          const h = x.k !== last ? <h5>{x.k === "Offre" ? "Offres" : "Actions"}</h5> : null; last = x.k;
          return <div key={n}>{h}<button type="button" role="option" aria-selected={n === cur} onClick={() => run(x)}><span>{x.t}</span>{x.s && <small>{x.s}</small>}</button></div>;
        }) : <p className="muted" style={{ padding: 16 }}>Aucun résultat.</p>}
      </div>
    </Modal>
  );
}

/** Demande, avant chaque actualisation : rapide ou approfondie ? */
export function RefreshChoice({ ids, atOpen, onClose }) {
  const a = useApp();
  const def = lastMode();
  const n = ids ? ids.length : a.searches.length;
  const busy = a.refresh.running || !!a.run;
  const go = (mode) => { onClose(); a.refreshAll(ids || undefined, mode); };
  return (
    <Modal onClose={onClose} label="Actualiser mes offres">
      <MHead title={atOpen ? "Actualiser tes offres ?" : "Actualiser mes offres"} sub={`${n} recherche${n > 1 ? "s" : ""} enregistrée${n > 1 ? "s" : ""}`} onClose={onClose} />
      <div className="mbody">
        {atOpen && <p className="muted">Ta liste est gardée sur ton ordinateur. Veux-tu la mettre à jour maintenant ?</p>}
        {busy && <div className="notice">Une actualisation est déjà en cours. Attends qu’elle se termine.</div>}
        <div className="stack" style={{ gap: 12 }}>
          {Object.values(MODES).map((m) => (
            <button key={m.id} type="button" className={`tile${def === m.id ? " rec" : ""}`} style={{ textAlign: "left", padding: 18, display: "flex", flexDirection: "column", gap: 6, height: "auto" }} disabled={busy} onClick={() => go(m.id)}>
              <strong style={{ fontSize: 18, fontFamily: "var(--font-d)" }}>{m.label}</strong>
              <span className="small muted" style={{ fontWeight: 400 }}>{m.sub}</span>
              <span className="small" style={{ color: "var(--spruce)", fontWeight: 600 }}>{m.time}</span>
            </button>))}
        </div>
        <p className="muted small">Actualiser met ta liste à jour et ajoute les nouvelles offres, sans doublons ; il ne supprime rien. Pour repartir d’une liste propre, lance une nouvelle recherche.</p>
      </div>
      <div className="mfoot"><span className="sp" /><button type="button" className="btn quiet" onClick={onClose}>{atOpen ? "Plus tard" : "Annuler"}</button></div>
    </Modal>
  );
}