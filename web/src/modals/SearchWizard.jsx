import { useState } from "react";
import { useApp, newWiz } from "../store.jsx";
import { COUNTRIES, LANGN, MODES, lastMode, siteGroup, wizCalc } from "../meta.js";
import { CountrySelect, Disc, Modal, MHead, Seg, Stepper, Switch } from "../ui.jsx";
import TitleChooser, { pickedOf } from "./TitleChooser.jsx";

/** Nouvelle recherche en 3 étapes : où, quoi (postes à choisir ou écrire), lancer. */
export default function SearchWizard({ onClose }) {
  const a = useApp();
  const [wiz, setWiz] = useState(() => ({ ...newWiz(a.wiz.country), cats: a.wiz.cats, step: a.wiz.country ? 2 : 1 }));
  const [sites, setSites] = useState(null);
  const [mode, setMode] = useState(lastMode());
  const kept = a.jobs.filter((j) => j.status).length;
  const untracked = a.total - kept;
  const k = wizCalc(wiz);
  const picked = pickedOf(wiz);
  const n = picked.length, step = wiz.step;
  const busy = !!a.run || a.refresh.running;
  const go = (s) => setWiz((w) => ({ ...w, step: s }));
  const loadSites = () => { if (!sites) a.api.fetchAvailableSources().then((r) => setSites([...new Set((r.sources || []).map((s) => siteGroup(s.id, s.label).name))])).catch(() => setSites([])); };
  const launch = async () => {
    const ok = await a.launchSearch({ ...wiz, picked, edited: true }, "search", mode, true);
    if (ok) { a.setWiz({ ...a.wiz, country: wiz.country, cats: wiz.cats }); onClose(); }
  };
  const sentence = `Cairn va chercher ${n} poste${n > 1 ? "s" : ""} en ${k.co ? k.co.label : "…"} (${k.langs.map((l) => (LANGN[l] || l).toLowerCase()).join(", ")}) sur les sites d’emploi, et garder les offres pour toi.`;
  return (
    <Modal onClose={onClose} label="Nouvelle recherche">
      <MHead title="Nouvelle recherche" onClose={onClose} />
      <Stepper names={["Où", "Quoi", "Lancer"]} step={step} onGo={(s) => { if (s === 1 || k.co) go(s); }} />
      <div className="mbody">
        {step === 1 && (
          <>
            <h3>Dans quel pays ?</h3>
            <CountrySelect value={wiz.country} onChange={(id) => setWiz({ ...wiz, country: id || null, edited: false, picked: [] })} />
            <p className="muted small">Offres locales et remote du pays choisi. Les langues des annonces sont déduites du pays.</p>
          </>)}
        {step === 2 && (
          <>
            <div><h3>Quels postes ?</h3><p className="muted small" style={{ marginTop: 4 }}>Écris un titre ou coche dans les listes. Tu peux en choisir autant que tu veux.</p></div>
            <TitleChooser wiz={wiz} setWiz={setWiz} />
            <Disc label="Chercher aussi dans d’autres langues">
              <div className="sugg" style={{ margin: 0 }}>{Object.keys(LANGN).filter((l) => ["fr", "en", "de", "es"].includes(l) && !k.langs.includes(l)).map((l) => (
                <button key={l} type="button" onClick={() => setWiz({ ...wiz, extra: [...wiz.extra, l], edited: false })}>+ {LANGN[l]}</button>))}</div>
            </Disc>
          </>)}
        {step === 3 && (
          <>
            <p style={{ fontSize: 18, lineHeight: 1.5 }}>{sentence}</p>
            <div><h4 style={{ font: "700 15px var(--font-b)", marginBottom: 8 }}>Type de recherche</h4>
              <Seg label="Type de recherche" options={[["fast", "Rapide"], ["deep", "Approfondie"], ["all", "Les deux"]]} value={mode} onChange={setMode} />
              <p className="muted small" style={{ marginTop: 8, maxWidth: "56ch" }}>{mode === "fast" ? `${MODES.fast.time}. ${MODES.fast.sub}` : mode === "deep" ? `${MODES.deep.time}. ${MODES.deep.sub}` : "Tout d’un coup : la durée est celle de l’approfondie."}</p></div>
            {untracked > 0 && (
              <div className="notice">Ta liste actuelle sera remplacée : {untracked.toLocaleString("fr-FR")} offre{untracked > 1 ? "s" : ""} non suivie{untracked > 1 ? "s" : ""} seront retirées. Tes {kept} offre{kept > 1 ? "s" : ""} suivie{kept > 1 ? "s" : ""} (à voir, postulé, entretien, offre, refusé) restent.</div>)}
            <Switch checked={wiz.save} onChange={(v) => setWiz({ ...wiz, save: v })}>Enregistrer cette recherche pour pouvoir l’actualiser en un clic</Switch>
            <div onClick={loadSites}><Disc label="Voir où Cairn cherche">
              <div className="chips">{(sites || ["…"]).map((x) => <span key={x} className="chip">{x}</span>)}</div>
              <p className="muted small">Cairn respecte les règles de chaque site : si un site refuse l’accès, il passe au suivant sans jamais le contourner.</p>
            </Disc></div>
          </>)}
      </div>
      <div className="mfoot">
        {step > 1 && <button type="button" className="btn" onClick={() => go(step - 1)}>Retour</button>}
        <span className="sp" />
        {step < 3
          ? <button type="button" className="btn primary" disabled={!k.co || (step === 2 && !n)} onClick={() => go(step + 1)}>Continuer</button>
          : <button type="button" className="btn primary big" disabled={!n || busy} onClick={launch}>Lancer la recherche</button>}
      </div>
    </Modal>
  );
}