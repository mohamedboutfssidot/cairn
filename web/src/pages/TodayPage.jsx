import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../store.jsx";
import { CATS, COUNTRIES, LANGN, compat, jobSite, lateText, wizCalc } from "../meta.js";
import { CairnChart, CountrySelect, Cp, Disc, Foot, ProgressBody } from "../ui.jsx";
import TitleChooser, { pickedOf } from "../modals/TitleChooser.jsx";

export function profileChecklist(c) {
  const bullets = (c.experiences || []).reduce((n, e) => n + (e.bullets || []).filter((x) => x.trim()).length, 0);
  return [
    { ok: !!c.name?.trim(), l: "Ton nom", sec: "identity" },
    { ok: !!c.email?.trim(), l: "Ton e-mail", sec: "identity" },
    { ok: !!c.headline?.trim(), l: "Ton titre professionnel", sec: "identity" },
    { ok: (c.summary || "").trim().length >= 80, l: "Un résumé de 80 caractères ou plus", sec: "identity" },
    { ok: (c.skills || []).length >= 5, l: "Au moins 5 compétences", sec: "skills" },
    { ok: (c.experiences || []).length > 0 && bullets >= 2, l: "Une expérience avec 2 réalisations", sec: "experience" },
    { ok: (c.experiences || []).some((e) => (e.bullets || []).some((x) => /\d/.test(x))), l: "Une réalisation chiffrée", sec: "experience" },
    { ok: (c.education || []).length > 0, l: "Une formation", sec: "education" },
    { ok: (c.languages || []).length > 0, l: "Une langue parlée", sec: "skills" },
  ];
}
export function completeness(c) {
  const l = profileChecklist(c), d = l.filter((x) => x.ok).length;
  return { p: Math.round((d / l.length) * 100), d, n: l.length, todo: l.filter((x) => !x.ok) };
}

const BLOCKS = [
  { id: "quick", label: "Actions rapides", span: 2 },
  { id: "stats", label: "Tableau de bord", span: 2 },
  { id: "todo", label: "À faire maintenant", span: 1 },
  { id: "fresh", label: "Nouveautés pour toi", span: 1 },
  { id: "track", label: "Ton suivi", span: 1 },
  { id: "match", label: "Compatibilité des offres", span: 1 },
  { id: "profile", label: "Ton profil", span: 1 },
];
const LS_KEY = "cairn-today";
const DEFAULT_LAYOUT = { order: BLOCKS.map((b) => b.id), hidden: [] };
function readLayout() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (!v) return DEFAULT_LAYOUT;
    const ids = BLOCKS.map((b) => b.id);
    const order = [...(v.order || []).filter((x) => ids.includes(x)), ...ids.filter((x) => !(v.order || []).includes(x))];
    return { order, hidden: (v.hidden || []).filter((x) => ids.includes(x)) };
  } catch { return DEFAULT_LAYOUT; }
}
/** Choix et ordre des blocs de la page, gardés dans le navigateur. */
function useTodayLayout() {
  const [lay, setLay] = useState(readLayout);
  const save = (n) => { setLay(n); try { localStorage.setItem(LS_KEY, JSON.stringify(n)); } catch { /* stockage bloqué : le choix reste valable jusqu'au rechargement */ } };
  return {
    lay,
    toggle: (id) => save({ ...lay, hidden: lay.hidden.includes(id) ? lay.hidden.filter((x) => x !== id) : [...lay.hidden, id] }),
    move: (id, d) => { const o = [...lay.order], i = o.indexOf(id), j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; save({ ...lay, order: o }); },
    reset: () => save(DEFAULT_LAYOUT),
  };
}
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
function useCountUp(n, ms = 900) {
  const [v, setV] = useState(reduced() ? n : 0);
  useEffect(() => {
    if (reduced()) { setV(n); return undefined; }
    let raf, t0;
    const step = (t) => { t0 ??= t; const k = Math.min(1, (t - t0) / ms); setV(Math.round(n * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n, ms]);
  return v;
}
const Ico = ({ d }) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const QI = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14-4l-2 2" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14 4l2-2" /><path d="M20 20v-5h-5" /></>,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></>,
  letter: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  board: <><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="10" rx="1.5" /><rect x="17" y="4" width="4" height="13" rx="1.5" /></>,
};
function Stat({ label, value, sub, tone, onClick }) {
  const v = useCountUp(value);
  return (
    <button type="button" className={`stat${tone ? " " + tone : ""}`} onClick={onClick}>
      <span className="sv">{v.toLocaleString("fr-FR")}</span><span className="sl">{label}</span><span className="ss">{sub}</span>
    </button>
  );
}
function MatchBars({ jobs }) {
  const rows = [4, 3, 2, 1].map((n) => ({ n, label: compat(n === 4 ? 90 : n === 3 ? 72 : n === 2 ? 55 : 20).label, c: 0 }));
  let withScore = 0;
  jobs.forEach((j) => { if (j.score == null) return; withScore++; const r = rows.find((x) => x.n === compat(j.score).n); if (r) r.c++; });
  const max = Math.max(1, ...rows.map((r) => r.c));
  return withScore ? (
    <ul className="mbars">{rows.map((r, i) => (
      <li key={r.n} style={{ "--i": i }}><span className="ml">{r.label}</span><span className="mt"><i className={`c${r.n}`} style={{ "--w": `${(r.c / max) * 100}%` }} /></span><b>{r.c.toLocaleString("fr-FR")}</b></li>))}</ul>
  ) : <p className="small muted">Les offres seront notées dès ta première recherche.</p>;
}

export default function TodayPage() {
  const a = useApp();
  const nav = useNavigate();
  const { lay, toggle, move, reset } = useTodayLayout();
  const [edit, setEdit] = useState(false);
  if (!a.loaded) return <div className="page"><p className="muted">Chargement…</p></div>;
  if ((a.isNewcomer || a.run?.kind === "onboard") && !a.ob.skip) return <Onboarding />;
  const { cand, due, fresh, counts, run } = a;
  const first = (cand.name || "").split(" ")[0];
  const m = completeness(cand);
  const hour = new Date().getHours();
  const hello = hour < 6 || hour >= 18 ? "Bonsoir" : "Bonjour";
  const lead = fresh.length || due.length
    ? (fresh.length ? `${fresh.length} nouvelle${fresh.length > 1 ? "s" : ""} offre${fresh.length > 1 ? "s" : ""} te correspond${fresh.length > 1 ? "ent" : ""}` : "") + (fresh.length && due.length ? ", et " : "") + (due.length ? `${due.length} relance${due.length > 1 ? "s" : ""} à faire` : "") + "."
    : "Tout est à jour. Reviens demain ou lance une recherche.";
  const busy = !!run || a.refresh.running;
  const bestUrl = (fresh[0] || due[0])?.url;
  const todo = [];
  due.slice(0, 2).forEach((j) => todo.push(
    <div className="tcard late" key={"d" + j.url}><div className="main"><small>À relancer</small><b>{j.title}</b><span className="meta">{j.company} · {lateText(j.follow_up)}</span></div>
      <button type="button" className="btn primary sm" onClick={() => a.setModal({ type: "kit", url: j.url, start: 3 })}>Préparer la relance</button></div>));
  fresh.slice(0, 2).forEach((j) => todo.push(
    <div className="tcard" key={"f" + j.url}><div className="main"><small>À examiner</small><b>{j.title}</b><span className="meta">{j.company} · compatibilité {compat(j.score).label.toLowerCase()}</span></div>
      <button type="button" className="btn sm" onClick={() => nav("/offres?open=" + encodeURIComponent(j.url))}>Voir l’offre</button></div>));
  if (m.p < 100 && todo.length < 4) todo.push(
    <div className="tcard" key="p"><div className="main"><small>Ton profil</small><b>Complète ton CV pour de meilleures candidatures</b><span className="meta">{m.d} sur {m.n} éléments</span></div>
      <button type="button" className="btn sm" onClick={() => nav("/profil?tab=cv&open=" + (m.todo[0]?.sec || "identity"))}>Compléter</button></div>);

  const view = (v) => { a.setView(v); nav("/offres"); };
  const body = {
    quick: (
      <div className="qa" role="group" aria-label="Actions rapides">
        <button type="button" className="qbtn primary" onClick={() => a.setModal({ type: "wizard" })}><Ico d={QI.search} /><b>Nouvelle recherche</b><span>Choisis un pays et des postes</span></button>
        <button type="button" className="qbtn" disabled={busy || !a.searches.length} onClick={() => a.askRefresh()}><Ico d={QI.refresh} /><b>Actualiser</b><span>Relance tes recherches</span></button>
        <button type="button" className="qbtn" onClick={() => view("map")}><Ico d={QI.map} /><b>Voir la carte</b><span>Les offres près de toi</span></button>
        <button type="button" className="qbtn" disabled={!bestUrl} onClick={() => a.setModal({ type: "kit", url: bestUrl })}><Ico d={QI.letter} /><b>Préparer une lettre</b><span>Pour ta meilleure offre</span></button>
        <button type="button" className="qbtn" onClick={() => nav("/candidatures")}><Ico d={QI.board} /><b>Mes candidatures</b><span>Où tu en es</span></button>
      </div>),
    stats: (
      <div className="stats">
        <Stat label="Nouvelles offres" value={fresh.length} sub="pour toi" onClick={() => view("new")} />
        <Stat label="Offres au total" value={a.jobs.length} sub="dans ta liste" onClick={() => view("all")} />
        <Stat label="Candidatures en cours" value={(counts.applied || 0) + (counts.interview || 0)} sub={`${counts.interview || 0} entretien${(counts.interview || 0) > 1 ? "s" : ""}`} onClick={() => nav("/candidatures")} />
        <Stat label="Relances à faire" value={due.length} sub={due.length ? "à envoyer" : "rien en retard"} tone={due.length ? "warn" : ""} onClick={() => nav("/candidatures")} />
      </div>),
    todo: <div className="todo">{todo.length ? todo : <div className="empty"><h3>Rien d’urgent</h3><p>Ta recherche est à jour.</p></div>}</div>,
    fresh: fresh.length ? (
      <ul className="rows">{fresh.slice(0, 4).map((j) => (
        <li key={j.url}><button type="button" className="line" onClick={() => nav("/offres?open=" + encodeURIComponent(j.url))}>
          <span className="main"><strong>{j.title}</strong><span>{j.company} · {j.city} · {jobSite(j.sources[0])}</span></span><Cp score={j.score} />
        </button></li>))}</ul>
    ) : (
      <div className="empty"><p>Rien de nouveau pour l’instant.</p>
        <button type="button" className="btn" disabled={busy || !a.searches.length} onClick={() => a.askRefresh()}>Actualiser mes offres</button>
        {!a.searches.length && <button type="button" className="btn primary" onClick={() => a.setModal({ type: "wizard" })}>Nouvelle recherche</button>}
      </div>),
    track: <><p className="small muted" style={{ marginBottom: 10 }}>Chaque étape franchie ajoute une pierre.</p><CairnChart counts={counts} /></>,
    match: <MatchBars jobs={a.jobs} />,
    profile: (
      <div className="prof">
        <div className="ring in" style={{ "--p": m.p }}><span>{m.p}%</span></div>
        <div><b>{m.d} sur {m.n}</b><p className="small muted">{m.p >= 100 ? "Ta fiche est complète." : `Il manque : ${m.todo[0]?.l.toLowerCase()}.`}</p>
          {m.p < 100 && <button type="button" className="btn sm" style={{ marginTop: 10 }} onClick={() => nav("/profil?tab=cv&open=" + (m.todo[0]?.sec || "identity"))}>Compléter</button>}</div>
      </div>),
  };
  const link = { todo: null, fresh: ["/offres", "Toutes les offres"], track: ["/candidatures", "Ouvrir"], profile: ["/profil", "Mon profil"] };
  const shown = lay.order.filter((id) => !lay.hidden.includes(id));
  return (
    <div className="page today">
      <header className="thead">
        <div><h1>{hello}{first ? " " + first : ""}</h1><p className="lede" style={{ marginTop: 10 }}>{lead}</p></div>
        <button type="button" className="btn sm" aria-expanded={edit} onClick={() => setEdit(!edit)}>{edit ? "Terminer" : "Personnaliser la page"}</button>
      </header>
      {edit && (
        <div className="card custom" role="group" aria-label="Blocs de la page">
          <p className="small muted">Choisis les blocs à afficher et change leur ordre. Ton choix est gardé sur cet ordinateur.</p>
          <ul>{lay.order.map((id, i) => {
            const b = BLOCKS.find((x) => x.id === id);
            return (
              <li key={id}>
                <label className="switch"><input type="checkbox" checked={!lay.hidden.includes(id)} onChange={() => toggle(id)} /><i /><span>{b.label}</span></label>
                <span className="mv"><button type="button" className="iconbtn" aria-label={`Monter ${b.label}`} disabled={i === 0} onClick={() => move(id, -1)}>↑</button>
                  <button type="button" className="iconbtn" aria-label={`Descendre ${b.label}`} disabled={i === lay.order.length - 1} onClick={() => move(id, 1)}>↓</button></span>
              </li>);
          })}</ul>
          <div><button type="button" className="btn quiet sm" onClick={reset}>Revenir à l’affichage par défaut</button></div>
        </div>)}
      <div className="bgrid">
        {shown.map((id, i) => {
          const b = BLOCKS.find((x) => x.id === id), l = link[id];
          return (
            <section key={id} className={`blk${b.span === 2 ? " w2" : ""}${id === "quick" || id === "stats" ? " bare" : ""}`} style={{ "--i": i }} aria-label={b.label}>
              {id !== "quick" && id !== "stats" && <div className="sech"><h2>{b.label}</h2><span className="sp" />{l && <Link className="btn quiet sm" to={l[0]}>{l[1]}</Link>}</div>}
              {body[id]}
            </section>);
        })}
        {!shown.length && <div className="empty w2"><p>Tous les blocs sont masqués.</p><button type="button" className="btn" onClick={reset}>Tout afficher</button></div>}
      </div>
      <Foot />
    </div>
  );
}

/** Parcours guidé du nouvel arrivant : pays, CV, première recherche. */
function Onboarding() {
  const a = useApp();
  const nav = useNavigate();
  const { wiz, setWiz, ob, setOb, run } = a;
  const k = wizCalc(wiz);
  const picked = pickedOf(wiz);
  const st = (n) => (n < ob.step ? "done" : n === ob.step ? "cur" : "todo-s");
  const Head = ({ n, t, sub }) => (
    <header><span className="num">{n < ob.step ? "✓" : n}</span><div style={{ flex: 1 }}><h3>{t}</h3><p>{sub}</p></div>
      {n < ob.step && !run && <button type="button" className="btn quiet sm" onClick={() => setOb({ ...ob, step: n })}>Modifier</button>}</header>
  );
  const cats = CATS.map((c) => [c.id, c.label]);
  const [nm, setNm] = useState(a.cand.name || "");
  const goStep2 = () => { const n = nm.trim(); if (n && n !== (a.cand.name || "")) a.saveCand({ ...a.cand, name: n }); setOb({ ...ob, step: 2 }); };
  return (
    <div className="page">
      <div className="two">
        <div className="stack" style={{ gap: 28 }}>
          <header><h1>Bienvenue sur Cairn</h1><p className="lede" style={{ marginTop: 10 }}>Cairn parcourt les sites d’emploi pour toi et garde tout au même endroit. Trois étapes, deux minutes.</p></header>
          <section className={`ostep ${st(1)}`}>
            <Head n={1} t="Où veux-tu travailler ?" sub={k.co ? `${k.co.label} · ${wiz.cats.map((c) => CATS.find((x) => x.id === c)?.label).join(", ")}` : "Choisis un pays"} />
            {ob.step === 1 && (
              <div className="bd">
                <label className="f">Comment dois-tu t’appeler ? <span className="muted">(facultatif)</span>
                  <input className="input" value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Ton prénom ou ton nom complet" autoComplete="given-name" maxLength={80} /></label>
                <CountrySelect value={wiz.country} onChange={(id) => setWiz({ ...wiz, country: id || null, edited: false, picked: [] })} />
                <div><p className="small muted" style={{ marginBottom: 8 }}>Dans quel domaine ?</p>
                  <div className="tiles" role="group" aria-label="Domaines">{cats.map(([id, l]) => (
                    <button key={id} type="button" className="tile" aria-pressed={wiz.cats.includes(id)} onClick={() => setWiz({ ...wiz, edited: false, cats: wiz.cats.includes(id) ? (wiz.cats.length > 1 ? wiz.cats.filter((x) => x !== id) : wiz.cats) : [...wiz.cats, id] })}>{l}</button>))}</div></div>
                <div><button type="button" className="btn primary" disabled={!k.co} onClick={goStep2}>Continuer</button></div>
              </div>)}
          </section>
          <section className={`ostep ${st(2)}`}>
            <Head n={2} t="Ajoute ton CV" sub={a.cand.name ? "Fiche remplie" : ob.cvSkipped ? "Plus tard" : "Facultatif, mais utile"} />
            {ob.step === 2 && (
              <div className="bd">
                <p className="muted">Ton CV sert à noter les offres selon ton profil et à rédiger tes lettres. Il reste sur ton ordinateur, rien n’est envoyé.</p>
                <div className="row">
                  <button type="button" className="btn primary" onClick={() => nav("/profil?tab=cv&open=identity")}>Remplir ma fiche maintenant</button>
                  <button type="button" className="btn quiet" onClick={() => setOb({ ...ob, step: 3, cvSkipped: true })}>Plus tard</button>
                </div>
              </div>)}
          </section>
          <section className={`ostep ${st(3)}`}>
            <Head n={3} t="Lance ta première recherche" sub="Quelques secondes" />
            {ob.step === 3 && (
              <div className="bd">
                <p>Cairn va chercher {picked.length} poste{picked.length > 1 ? "s" : ""} en {k.co?.label} ({k.langs.map((l) => LANGN[l].toLowerCase()).join(", ")}) sur les sites disponibles, et garder les offres en mémoire.</p>
                {run ? <ProgressBody progress={a.progress} refresh={a.refresh} run={run} onSeeOffers={() => nav("/offres")} onStop={a.stopAll} stopping={a.stopping} /> : (
                  <>
                    <Disc label={`Choisir ou écrire mes postes (${picked.length})`}><TitleChooser wiz={wiz} setWiz={setWiz} /></Disc>
                    <div className="row"><button type="button" className="btn primary big" disabled={!picked.length} onClick={() => a.launchSearch({ ...wiz, picked, edited: true, save: true }, "onboard")}>Lancer la recherche</button></div>
                  </>)}
              </div>)}
          </section>
        </div>
        <aside className="aside"><div className="card">
          <h3 style={{ marginBottom: 6 }}>Ton suivi</h3><p className="small muted" style={{ marginBottom: 12 }}>Quand tu auras trouvé des offres, chaque étape de ta candidature ajoutera une pierre ici.</p>
          <CairnChart counts={{}} />
        </div></aside>
      </div>
      <Foot />
    </div>
  );
}