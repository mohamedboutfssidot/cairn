import { useState } from "react";
import { LANGN, defaultTitles, wizCalc } from "../meta.js";

/** Choix des postes : liste déroulante de suggestions pendant la frappe + familles à cocher (IA, Data…). */
export default function TitleChooser({ wiz, setWiz }) {
  const k = wizCalc(wiz);
  const picked = wiz.edited ? wiz.picked : defaultTitles(wiz, k.fams);
  const [hi, setHi] = useState(0);
  const low = (x) => x.toLowerCase();
  const pk = picked.map(low);
  const q = (wiz.q || "").trim(), ql = low(q);
  const sug = ql ? k.all.filter((x) => !pk.includes(low(x.t)) && low(x.t).includes(ql)).slice(0, 6) : [];
  const exact = ql && (k.all.some((x) => low(x.t) === ql) || pk.includes(ql));
  const options = [...sug.map((x) => ({ t: x.t, tag: x.l.toUpperCase() })), ...(ql && !exact ? [{ t: q, tag: "perso", custom: true }] : [])];

  const lq = low((wiz.lq || "").trim());
  const fams = k.fams
    .map((f) => ({ ...f, all: f.titles, titles: lq ? f.titles.filter((x) => low(x.t).includes(lq)) : f.titles }))
    .filter((f) => !lq || f.titles.length)
    .sort((a, b) => (wiz.cats.includes(b.id) ? 1 : 0) - (wiz.cats.includes(a.id) ? 1 : 0));
  const commit = (list, custom) => setWiz((w) => ({ ...w, edited: true, picked: list, custom: custom ?? w.custom }));
  const toggle = (t) => commit(picked.includes(t) ? picked.filter((x) => x !== t) : [...picked, t]);
  const add = (o) => {
    if (!o.t || pk.includes(low(o.t))) return setWiz((w) => ({ ...w, q: "" }));
    setWiz((w) => ({ ...w, edited: true, picked: [...picked, o.t], custom: o.custom ? [...w.custom, o.t] : w.custom, q: "" }));
    setHi(0);
  };
  const famToggle = (f, on) => {
    const ts = f.titles.map((x) => x.t);
    commit(on ? [...picked, ...ts.filter((t) => !picked.includes(t))] : picked.filter((t) => !ts.includes(t)));
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="chips" aria-label="Postes sélectionnés">
        {picked.length
          ? picked.map((t) => <span key={t} className="chip ok">{t} <button type="button" aria-label={`Retirer ${t}`} onClick={() => toggle(t)}>×</button></span>)
          : <span className="muted small">Aucun poste choisi. Écris un titre ou ouvre une liste ci-dessous.</span>}
      </div>
      <div>
        <input className="input" role="combobox" aria-expanded={options.length > 0} aria-controls="wz-list" autoComplete="off"
          placeholder="Écris un poste, ex. Data analyst, Ingénieur IA…" aria-label="Ajouter un poste" value={wiz.q || ""}
          onChange={(e) => { setWiz((w) => ({ ...w, q: e.target.value })); setHi(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, options.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); if (options[hi]) add(options[hi]); }
          }} />
        {options.length > 0 && (
          <div className="combo" id="wz-list" role="listbox">
            {options.map((o, i) => (
              <button key={o.t + i} type="button" role="option" aria-selected={i === hi} onClick={() => add(o)}>
                <span>{o.custom ? `Ajouter « ${o.t} »` : o.t}</span><small>{o.tag}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="small muted" style={{ marginBottom: 8 }}>Ou choisis dans les listes par domaine ({k.fams.length} domaines), coche ceux qui t’intéressent :</p>
        <input className="input" type="search" autoComplete="off" placeholder="Filtrer les listes, ex. comptable, marketing, infirmier…" aria-label="Filtrer les listes de postes" value={wiz.lq || ""}
          onChange={(e) => setWiz((w) => ({ ...w, lq: e.target.value }))} style={{ marginBottom: 10 }} />
        {fams.length === 0 && <p className="small muted">Aucun poste ne correspond. Écris-le dans la case du haut pour l’ajouter tel quel.</p>}
        {fams.map((f) => {
          const open = lq ? true : !!wiz.fam[f.id], ns = f.titles.filter((x) => picked.includes(x.t)).length;
          return (
            <div className="acc" key={f.id}>
              <button type="button" aria-expanded={open} onClick={() => setWiz((w) => ({ ...w, fam: { ...w.fam, [f.id]: !open } }))}>
                <span><strong>{f.label}</strong><span className="small muted">{f.hint}</span></span>
                <span className={`chip${ns ? " ok" : ""}`}>{ns} / {f.all.length}</span>
              </button>
              {open && (
                <div className="body">
                  <ul className="ach">
                    {f.titles.map((x) => (
                      <li key={x.t}><label>
                        <input type="checkbox" checked={picked.includes(x.t)} onChange={() => toggle(x.t)} />
                        <span>{x.t}<small>{LANGN[x.l]}</small></span>
                      </label></li>
                    ))}
                  </ul>
                  <div className="row">
                    <button type="button" className="btn quiet sm" onClick={() => famToggle(f, true)}>Tout cocher</button>
                    <button type="button" className="btn quiet sm" onClick={() => famToggle(f, false)}>Tout décocher</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
export function pickedOf(wiz) {
  return wiz.edited ? wiz.picked : defaultTitles(wiz, wizCalc(wiz).fams);
}