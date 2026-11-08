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

export default function TodayPage() {
  const a = useApp();
  const nav = useNavigate();
  if (!a.loaded) return <div className="page"><p className="muted">Chargement…</p></div>;
  if ((a.isNewcomer || a.run?.kind === "onboard") && !a.ob.skip) return <Onboarding />;
  const { cand, due, fresh, counts, run } = a;
  const first = (cand.name || "").split(" ")[0];
  const m = completeness(cand);
  const lead = fresh.length || due.length
    ? (fresh.length ? `${fresh.length} nouvelle${fresh.length > 1 ? "s" : ""} offre${fresh.length > 1 ? "s" : ""} te correspond${fresh.length > 1 ? "ent" : ""}` : "") + (fresh.length && due.length ? ", et " : "") + (due.length ? `${due.length} relance${due.length > 1 ? "s" : ""} à faire` : "") + "."
    : "Tout est à jour. Reviens demain ou lance une recherche.";
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
  return (
    <div className="page">
      <div className="two">
        <div className="stack" style={{ gap: 40 }}>
          <header><h1>Bonjour{first ? " " + first : ""}</h1><p className="lede" style={{ marginTop: 10 }}>{lead}</p></header>
          <section>
            <div className="sech"><h2>À faire maintenant</h2></div>
            <div className="todo">{todo.length ? todo : <div className="empty"><h3>Rien d’urgent</h3><p>Ta recherche est à jour.</p></div>}</div>
          </section>
          <section>
            <div className="sech"><h2>Nouveautés pour toi</h2><span className="sp" /><Link className="btn quiet sm" to="/offres">Toutes les offres</Link></div>
            {fresh.length ? (
              <ul className="rows">{fresh.slice(0, 4).map((j) => (
                <li key={j.url}><button type="button" className="line" onClick={() => nav("/offres?open=" + encodeURIComponent(j.url))}>
                  <span className="main"><strong>{j.title}</strong><span>{j.company} · {j.city} · {jobSite(j.sources[0])}</span></span><Cp score={j.score} />
                </button></li>))}</ul>
            ) : (
              <div className="empty"><p>Rien de nouveau pour l’instant.</p>
                <button type="button" className="btn" disabled={!!run || a.refresh.running || !a.searches.length} onClick={() => a.askRefresh()}>Actualiser mes offres</button>
                {!a.searches.length && <button type="button" className="btn primary" onClick={() => a.setModal({ type: "wizard" })}>Nouvelle recherche</button>}
              </div>)}
          </section>
        </div>
        <aside className="aside"><div className="card">
          <h3 style={{ marginBottom: 6 }}>Ton suivi</h3><p className="small muted" style={{ marginBottom: 12 }}>Chaque étape franchie ajoute une pierre.</p>
          <CairnChart counts={counts} />
          <div style={{ marginTop: 12 }}><Link className="btn" style={{ width: "100%" }} to="/candidatures">Ouvrir mes candidatures</Link></div>
        </div></aside>
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
  return (
    <div className="page">
      <div className="two">
        <div className="stack" style={{ gap: 28 }}>
          <header><h1>Bienvenue sur Cairn</h1><p className="lede" style={{ marginTop: 10 }}>Cairn parcourt les sites d’emploi pour toi et garde tout au même endroit. Trois étapes, deux minutes.</p></header>
          <section className={`ostep ${st(1)}`}>
            <Head n={1} t="Où veux-tu travailler ?" sub={k.co ? `${k.co.label} · ${wiz.cats.map((c) => CATS.find((x) => x.id === c)?.label).join(", ")}` : "Choisis un pays"} />
            {ob.step === 1 && (
              <div className="bd">
                <CountrySelect value={wiz.country} onChange={(id) => setWiz({ ...wiz, country: id || null, edited: false, picked: [] })} />
                <div><p className="small muted" style={{ marginBottom: 8 }}>Dans quel domaine ?</p>
                  <div className="tiles" role="group" aria-label="Domaines">{cats.map(([id, l]) => (
                    <button key={id} type="button" className="tile" aria-pressed={wiz.cats.includes(id)} onClick={() => setWiz({ ...wiz, edited: false, cats: wiz.cats.includes(id) ? (wiz.cats.length > 1 ? wiz.cats.filter((x) => x !== id) : wiz.cats) : [...wiz.cats, id] })}>{l}</button>))}</div></div>
                <div><button type="button" className="btn primary" disabled={!k.co} onClick={() => setOb({ ...ob, step: 2 })}>Continuer</button></div>
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
                {run ? <ProgressBody progress={a.progress} refresh={a.refresh} run={run} onSeeOffers={() => nav("/offres")} /> : (
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