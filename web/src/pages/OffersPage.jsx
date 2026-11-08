import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../store.jsx";
import { LANGN, LEVELS, STATUSES, STLABEL, ago, countryKey, fmtD, isLocal, jobSite, stripHtml } from "../meta.js";
import { Cp, Disc, Icon, ICONS, Seg } from "../ui.jsx";
import ByPost from "./ByPost.jsx";
import { buildPostes, groupJobs } from "../groups.js";

export function matchJob(j, { f, q, view, home }, skip = "") {
  if (q && !`${j.title} ${j.company}`.toLowerCase().includes(q.toLowerCase())) return false;
  if (view === "foryou" && !(j.score != null && j.score >= 70)) return false;
  if (view === "new" && !j.is_new) return false;
  if (view === "local" && !isLocal(j, home)) return false;
  if (view === "remote" && !(j.remote === true && !isLocal(j, home))) return false;
  if (skip !== "country" && f.country && countryKey(j.country) !== countryKey(f.country)) return false;
  if (skip !== "city" && f.city && (j.city || "") !== f.city) return false;
  if (skip !== "period" && f.period && !(j.days != null && j.days <= f.period)) return false;
  if (skip !== "source" && f.source && !j.sources.includes(f.source)) return false;
  if (skip !== "level" && f.level && j.level !== f.level) return false;
  if (skip !== "lang" && f.lang && !j.langs.includes(f.lang)) return false;
  if (skip !== "visa" && f.visa && (j.visa || "unknown") !== f.visa) return false;
  if (skip !== "salary" && f.salary && !((j.sal_usd_max || 0) >= f.salary)) return false;
  if (f.minScore && !(j.score != null && j.score >= f.minScore)) return false;
  return true;
}
export const filterCount = (f) => ["source", "level", "lang", "visa", "country", "city"].filter((k) => f[k] !== "").length + (f.period ? 1 : 0) + (f.salary ? 1 : 0) + (f.minScore ? 1 : 0) + (f.hidden ? 1 : 0);

export default function OffersPage() {
  const a = useApp();
  const { jobs, hiddenJobs, f, q, view, sort, setView, setQ, setF, setSort, run, searches, meta, home } = a;
  const [params, setParams] = useSearchParams();
  const [sel, setSel] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    const o = params.get("open");
    if (o) { setSel(o); setDetailOpen(true); setView("all"); setQ(""); setParams({}, { replace: true }); }
  }, [params, setParams, setView, setQ]);

  const [gmode, setGmode] = useState(() => { try { return localStorage.getItem("cairn-gmode") || "poste"; } catch { return "poste"; } });
  const [group, setGroup] = useState(null);
  const changeGmode = (m) => { setGmode(m); setGroup(null); try { localStorage.setItem("cairn-gmode", m); } catch { /* ignore */ } };
  const keywords = useMemo(() => {
    const out = [...(a.profile?.titles || [])];
    searches.forEach((s) => {
      const kw = s.params?.keywords ?? s.keywords ?? [];
      out.push(...(Array.isArray(kw) ? kw : String(kw).split(/[,;]/)));
    });
    return out.map((x) => String(x).trim()).filter(Boolean);
  }, [a.profile, searches]);
  const base = f.hidden ? hiddenJobs : jobs;
  const groups = useMemo(() => {
    if (view !== "poste") return [];
    return groupJobs(base.filter((j) => matchJob(j, { f, q, view: "all", home })), gmode, keywords);
  }, [view, base, f, q, gmode, keywords, home]);
  const activeGroup = view === "poste" && group ? groups.find((g) => g.id === group) || null : null;
  const list = useMemo(() => {
    if (view === "poste" && !activeGroup) return [];
    const arr = (activeGroup ? activeGroup.jobs : base).filter((j) => matchJob(j, { f, q, view: view === "poste" ? "all" : view, home }));
    const age = (j) => (j.days == null ? 9999 : j.days);
    return arr.sort((x, y) => (sort === "score" ? ((y.score ?? -1) - (x.score ?? -1)) || (age(x) - age(y)) : (age(x) - age(y)) || ((y.score ?? -1) - (x.score ?? -1))));
  }, [base, f, q, view, sort, activeGroup, home]);
  const cur = list.find((j) => j.url === sel) || list[0] || null;
  const fc = filterCount(f);
  const hasProfile = jobs.some((j) => j.score != null);
  const tracked = jobs.filter((j) => j.status).length;
  const untracked = a.total - tracked;

  if (!a.loaded) return <div className="page"><p className="muted">Chargement…</p></div>;
  if (!jobs.length && !f.hidden) {
    return (
      <div className="page"><header><h1>Offres</h1></header>
        <div className="empty"><h3>{a.busy ? "Recherche en cours" : "Aucune offre pour l’instant"}</h3><p>{a.busy ? "Les offres apparaissent ici dès qu’un site les renvoie." : a.isNewcomer ? "Termine la première étape pour que Cairn cherche des offres pour toi." : "Lance une recherche pour remplir ta liste."}</p>
          <button type="button" className="btn primary" onClick={() => a.setModal({ type: "wizard" })}>Nouvelle recherche</button></div></div>
    );
  }
  const all = jobs;
  const views = [["foryou", "Pour toi", all.filter((j) => j.score != null && j.score >= 70).length], ["new", "Nouvelles", all.filter((j) => j.is_new).length], ["local", home ? `Local · ${home}` : "Local", all.filter((j) => isLocal(j, home)).length], ["remote", "Remote", all.filter((j) => j.remote === true && !isLocal(j, home)).length], ["all", "Toutes", all.length], ["poste", "Par poste", null]];
  const upd = meta.last_updated ? new Date(meta.last_updated).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "jamais";

  return (
    <div className="page wide">
      <div className="phead">
        <div><h1>Offres</h1><p className="muted">{a.total.toLocaleString("fr-FR")} offres enregistrées{tracked ? `, dont ${tracked} suivies` : ""} · mises à jour {upd}</p></div>
        <span className="sp" />
        <button type="button" className="btn" onClick={() => a.setModal({ type: "searches" })}>Mes recherches{searches.length ? ` (${searches.length})` : ""}</button>
        <button type="button" className="btn" disabled={!!run || a.refresh.running || !searches.length} onClick={() => a.askRefresh()}><Icon size={16}>{ICONS.sync}</Icon> Actualiser</button>
        <button type="button" className="btn primary" onClick={() => a.setModal({ type: "wizard" })}>Nouvelle recherche</button>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <div className="search"><Icon size={18}>{ICONS.search}</Icon>
          <input className="input big" type="search" placeholder="Poste, entreprise ou mot-clé" aria-label="Chercher dans mes offres" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button type="button" className={`btn filterbtn${fc ? " on" : ""}`} onClick={() => a.setModal({ type: "filters" })}>Filtres{fc ? ` (${fc})` : ""}</button>
      </div>
      <div className="row">
        <Seg label="Vue" options={views} value={view} onChange={(v) => { setView(v); setGroup(null); }} />
        {f.hidden && <span className="chip warn">Offres masquées <button type="button" aria-label="Retour aux offres" onClick={() => setF({ ...f, hidden: false })}>×</button></span>}
        <span className="sp" />
        <label className="small muted" htmlFor="sortSel">Trier par</label>
        <select className="select" id="sortSel" style={{ width: "auto" }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="score">Compatibilité</option><option value="date">Plus récentes</option></select>
      </div>
      {untracked > 1000 && !f.hidden && (
        <div className="notice" role="status">Ta liste est très grande ({untracked.toLocaleString("fr-FR")} offres non suivies) : les offres qui t’intéressent sont difficiles à retrouver. Les offres que tu suis sont conservées.
          <button type="button" className="btn sm" onClick={() => window.confirm(`Retirer ${untracked.toLocaleString("fr-FR")} offres non suivies ? Tes ${tracked} offres suivies sont conservées.`) && a.cleanList()}>Nettoyer ma liste</button></div>)}
      {!hasProfile && <div className="notice">Pour voir la compatibilité de chaque offre, indique les postes que tu vises dans <a href="#/profil?tab=search">ton profil</a>.</div>}
      {view === "poste" && !activeGroup && (
        <ByPost groups={groups} mode={gmode} setMode={changeGmode} onOpen={setGroup} hasPostes={buildPostes(keywords).length > 0} />)}
      {activeGroup && (
        <div className="row"><button type="button" className="btn sm" onClick={() => setGroup(null)}>← Tous les postes</button>
          <span className="chip">{activeGroup.label} <button type="button" aria-label="Retirer ce poste" onClick={() => setGroup(null)}>×</button></span></div>)}
      {(view !== "poste" || activeGroup) && <div className={`omain${detailOpen ? " detail-open" : ""}`}>
        <div className="listcol">
          <div className="small muted" style={{ marginBottom: 8 }}>{list.length} offre{list.length > 1 ? "s" : ""}</div>
          {list.length ? (
            <div className="joblist">{list.map((j) => (
              <button key={j.url} type="button" className="job" aria-current={cur && cur.url === j.url ? "true" : undefined} onClick={() => { setSel(j.url); setDetailOpen(true); }}>
                <div className="t">{j.title}</div><div className="c">{j.company} · {j.city}</div>
                <div className="m"><Cp score={j.score} />{j.is_new && <span className="new">Nouveau</span>}{j.status && <span className={`st ${j.status}`}>{STLABEL[j.status]}</span>}<span>{ago(j.days)}</span></div>
                {j.reasons[0] && <div className="why">{j.reasons[0]}</div>}
              </button>))}</div>
          ) : (
            <div className="empty"><h3>Aucune offre ici</h3><p>Essaie une autre vue ou retire un filtre.</p>
              <button type="button" className="btn" onClick={() => { setView("all"); setQ(""); setF({ ...f, source: "", level: "", lang: "", visa: "", salary: 0, minScore: 0, hidden: false, country: "", city: "", period: 0 }); }}>Tout afficher</button></div>)}
        </div>
        <div className="detail">{cur && <Detail key={cur.url} job={cur} onBack={() => setDetailOpen(false)} />}</div>
      </div>}
    </div>
  );
}

function Detail({ job, onBack }) {
  const a = useApp();
  const nav = useNavigate();
  const [full, setFull] = useState(null);
  const [note, setNote] = useState(job.note || "");
  useEffect(() => { let on = true; a.api.fetchJob(job.url).then((r) => on && setFull(r)).catch(() => {}); return () => { on = false; }; }, [job.url]); // eslint-disable-line react-hooks/exhaustive-deps
  const desc = stripHtml(full?.description || job.description || "");
  const others = job.sources.slice(1);
  const sal = job.sal_usd_min || job.sal_usd_max;
  return (
    <>
      <button type="button" className="btn quiet sm back" onClick={onBack}>← Retour à la liste</button>
      <div className="card">
        <h2>{job.title}</h2>
        <p className="muted" style={{ marginTop: 4 }}>{job.company} · {job.city} · {ago(job.days)}</p>
        <div className="row" style={{ marginTop: 14 }}><Cp score={job.score} />{job.score != null && <span className="small muted">Score {job.score} sur 100</span>}</div>
        {job.reasons.length > 0 && <ul className="why-l">{job.reasons.map((r) => <li key={r} className={/^À éviter|Pas de/.test(r) ? "x" : ""}>{r}</li>)}</ul>}
        <div className="facts">
          {job.level && <span>Niveau <b>{LEVELS[job.level] || job.level}</b></span>}
          {job.langs.length > 0 && <span>Langue <b>{job.langs.map((l) => LANGN[l] || l).join(", ")}</b></span>}
          {sal && <span>Salaire <b>{Math.round((job.sal_usd_min || job.sal_usd_max) / 1000)}k{job.sal_usd_max && job.sal_usd_max !== job.sal_usd_min ? ` à ${Math.round(job.sal_usd_max / 1000)}k` : ""} $ par an</b></span>}
          {job.visa === "yes" && <span><b>Visa possible</b></span>}{job.visa === "no" && <span><b>Pas de visa</b></span>}
          {job.remote === true && <span><b>Remote</b></span>}
        </div>
        <p className="small muted">Source : <b>{jobSite(job.sources[0])}</b>{others.length ? `, aussi trouvée sur ${others.map(jobSite).join(", ")}` : ""}.</p>
        <div className="cta">
          <button type="button" className="btn primary big" onClick={() => a.setModal({ type: "kit", url: job.url })}>Préparer ma candidature</button>
          {!job.status && <button type="button" className="btn big" onClick={() => a.setStatus(job, "saved")}>Suivre cette offre</button>}
        </div>
        {job.hidden && <div className="notice" style={{ marginBottom: 14 }}>Cette offre est masquée. <button type="button" className="btn sm" onClick={() => a.unhide(job)}>Rétablir</button></div>}
        {job.status && (
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 18, marginTop: 6 }}>
            <div className="row" style={{ marginBottom: 10 }}><b>Où en es-tu ?</b><span className="sp" /><button type="button" className="btn quiet sm" onClick={() => a.untrack(job)}>Ne plus suivre</button></div>
            <div className="sbtns" role="radiogroup" aria-label="Étape">{STATUSES.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={job.status === s.id} aria-pressed={job.status === s.id} onClick={() => a.setStatus(job, s.id)}>{s.label}</button>))}</div>
            <div style={{ marginTop: 12 }}>
              <Disc label={`Notes et rappel${job.follow_up ? " · relance le " + fmtD(job.follow_up) : ""}`}>
                <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== job.note && a.saveNote(job, note)} placeholder="Contact, salaire évoqué, prochaine étape" aria-label="Notes" />
                <label className="f">Me rappeler de relancer le<input className="input" type="date" value={job.follow_up || ""} onChange={(e) => a.setFollow(job, e.target.value)} style={{ maxWidth: 200 }} /></label>
              </Disc>
            </div>
          </div>)}
        <div style={{ marginTop: 14 }}><Disc label="Lire l’annonce"><p className="desc" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{desc || "Pas de description enregistrée pour cette offre."}</p></Disc></div>
        <div style={{ marginTop: 10 }}>
          <Disc label="Plus d’actions">
            <div className="row">
              <a className="btn sm" href={job.url} target="_blank" rel="noreferrer noopener">Ouvrir l’annonce d’origine ↗</a>
              {!job.status && !job.hidden && <button type="button" className="btn sm danger" onClick={() => a.hide(job, "job")}>Pas intéressé</button>}
              {!job.hidden && job.company && <button type="button" className="btn sm" onClick={() => a.hide(job, "company")}>Masquer {job.company}</button>}
              {job.status && <button type="button" className="btn sm" onClick={() => nav("/candidatures")}>Voir dans mes candidatures</button>}
            </div>
          </Disc>
        </div>
      </div>
    </>
  );
}