import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store.jsx";
import { addDaysIso, fmtD } from "../meta.js";
import { Disc, MHead, Modal, Ring, Seg, Stepper } from "../ui.jsx";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
/** Aperçu du CV : Markdown limité (titres, puces, gras), tout est échappé. */
function cvHtml(md) {
  let out = "", ul = false;
  const close = () => { if (ul) { out += "</ul>"; ul = false; } };
  String(md || "").split("\n").forEach((l) => {
    if (/^- /.test(l)) { if (!ul) { out += "<ul>"; ul = true; } out += `<li>${inline(l.slice(2))}</li>`; return; }
    close();
    if (/^### /.test(l)) out += `<h4>${inline(l.slice(4))}</h4>`;
    else if (/^## /.test(l)) out += `<h3>${inline(l.slice(3))}</h3>`;
    else if (/^# /.test(l)) out += `<h2>${inline(l.slice(2))}</h2>`;
    else if (l.trim()) out += `<p>${inline(l)}</p>`;
  });
  close();
  return out;
}
const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export default function KitModal({ url, start = 1, onClose }) {
  const a = useApp();
  const job = a.findJob(url);
  const [step, setStep] = useState(start);
  const [d, setD] = useState(null);           // brouillons {letter, cv, email, email_subject, follow, follow_subject, lang, gap, achievements}
  const [opts, setOpts] = useState(() => { let p = {}; try { p = JSON.parse(localStorage.getItem("cairn-kit") || "{}"); } catch { /* ignore */ } return { lang: "", tone: ["formal", "direct", "warm"].includes(p.tone) ? p.tone : "formal", length: ["short", "standard", "long"].includes(p.length) ? p.length : "standard", picks: null }; });
  const [tab, setTab] = useState("letter");
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const dirty = useRef({});
  const saveT = useRef(null);

  const fetchKit = (o, fresh) => a.api.buildKit({ url, lang: o.lang || undefined, tone: o.tone, length: o.length, picks: o.picks || undefined, fresh: fresh || undefined });
  useEffect(() => {
    let on = true;
    fetchKit(opts, false).then((r) => { if (on) { setD(r); setOpts((o) => ({ ...o, lang: r.lang })); } }).catch((e) => on && setErr(e.message));
    return () => { on = false; };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = (next) => {
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => a.api.saveKitDraft(url, { lang: next.lang, letter: next.letter, cv: next.cv, email: next.email, email_subject: next.email_subject, follow: next.follow, follow_subject: next.follow_subject }).catch(() => {}), 700);
  };
  const edit = (key, value) => { dirty.current[key] = true; const next = { ...d, [key]: value }; setD(next); persist(next); };
  useEffect(() => () => clearTimeout(saveT.current), []);

  const regen = async (o, only) => {
    setBusy("regen");
    try {
      const r = await fetchKit(o, true);
      const next = only === "letter" ? { ...d, letter: r.letter, achievements: r.achievements, gap: r.gap } : { ...r };
      if (only !== "letter") dirty.current = {};
      else dirty.current.letter = false;
      setD(next); setOpts({ ...o, lang: r.lang }); persist(next);
    } catch (e) { a.say(e.message); }
    setBusy(""); setPending(null);
  };
  const change = (patch) => {
    const o = { ...opts, ...patch };
    if (patch.tone || patch.length) { try { localStorage.setItem("cairn-kit", JSON.stringify({ tone: o.tone, length: o.length })); } catch { /* ignore */ } }
    if (patch.lang && patch.lang !== opts.lang) return (dirty.current.letter || dirty.current.cv || dirty.current.email) ? setPending({ o, only: null }) : regen(o, null);
    if (dirty.current.letter) return setPending({ o, only: "letter" });
    regen(o, "letter");
  };
  const picked = useMemo(() => (d?.achievements || []).filter((x) => x.picked).map((x) => x.text), [d]);
  const togglePick = (text) => change({ picks: picked.includes(text) ? picked.filter((t) => t !== text) : [...picked, text] });

  const copy = async (text) => { try { await navigator.clipboard.writeText(text); a.say("Copié."); } catch { a.say("Copie impossible : sélectionne le texte à la main."); } };
  const improve = async (kind, text) => {
    if (!a.kitSettings.has_key) return a.say("Ajoute une clé API Claude dans Profil, onglet Compte.");
    setBusy("claude");
    try {
      const r = await a.api.improveKit({ url, kind, text, lang: d.lang });
      edit(kind === "letter" ? "letter" : kind === "cv" ? "cv" : kind === "email" ? "email" : "follow", r.text);
      a.say("Version améliorée par Claude.");
    } catch (e) { a.say(e.message); }
    setBusy("");
  };

  if (!job) return <Modal onClose={onClose} label="Préparer ma candidature"><MHead title="Préparer ma candidature" onClose={onClose} /><div className="mbody"><p className="muted">Offre introuvable.</p></div></Modal>;
  const g = d?.gap || { offer: [], have: [], missing: [] };
  const cov = g.coverage != null ? g.coverage : g.offer.length ? Math.round((g.have.length / g.offer.length) * 100) : null;
  const key = tab === "cv" ? "cv" : tab === "email" ? "email" : "letter";
  const text = d ? d[key] || "" : "";
  const goal = tab === "letter" ? [180, 320] : tab === "email" ? [40, 140] : null;
  const applied = job.status && job.status !== "saved";
  const kind = tab === "follow" ? "follow" : key;

  let body = null, foot = null;
  if (err) body = <div className="notice" role="alert">{err}</div>;
  else if (!d) body = <p className="muted">Préparation des documents…</p>;
  else if (step === 1) {
    body = (
      <>
        {d.empty && <div className="notice">Ta fiche CV est vide : les documents seront incomplets. <button type="button" className="btn sm" onClick={() => { onClose(); location.hash = "#/profil?tab=cv&open=identity"; }}>Remplir ma fiche</button></div>}
        {cov === null
          ? <p className="muted">Aucune compétence reconnue dans cette offre : passe directement aux documents.</p>
          : <div className="row" style={{ gap: 18 }}><Ring pct={cov} size={76} /><p style={{ fontSize: 18, maxWidth: "34ch", lineHeight: 1.4 }}>Ton profil couvre {g.have.length} des {g.offer.length} compétences demandées (les plus importantes comptent plus).</p></div>}
        <div><h4 style={{ font: "700 15px var(--font-b)", marginBottom: 8 }}>Tu les as : mets-les en avant</h4>
          <div className="chips">{g.have.length ? g.have.map((x) => <span key={x} className="chip ok">{x}</span>) : <span className="muted small">Aucune pour l’instant.</span>}</div></div>
        <div><h4 style={{ font: "700 15px var(--font-b)", marginBottom: 8 }}>Il te manque</h4>
          <div className="chips">{g.missing.length ? g.missing.map((x) => <span key={x} className="chip bad">{x}</span>) : <span className="muted small">Rien, bonne couverture.</span>}</div></div>
        {(d.tips || []).length > 0 && <div className="notice"><b>Pour de meilleurs documents</b><ul className="why-l" style={{ margin: "6px 0 0" }}>{d.tips.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        <p className="muted small" style={{ maxWidth: "56ch" }}>Si tu maîtrises vraiment une compétence manquante, ajoute-la à ton profil. Ne déclare pas ce que tu ne sais pas faire.</p>
      </>);
    foot = <><span className="sp" /><button type="button" className="btn primary" onClick={() => setStep(2)}>Continuer vers les documents</button></>;
  } else if (step === 2) {
    const t = tab === "follow" ? "letter" : tab;
    body = (
      <>
        <div className="row">
          <Seg label="Document" options={[["letter", "Lettre"], ["cv", "CV adapté"], ["email", "E-mail"]]} value={t} onChange={setTab} />
          {t === "cv" && <Seg label="Mode" options={[["0", "Modifier"], ["1", "Aperçu"]]} value={preview ? "1" : "0"} onChange={(v) => setPreview(v === "1")} />}
        </div>
        {pending && <div className="notice">Ta lettre a été modifiée. La régénérer remplacera tes changements.
          <button type="button" className="btn sm" onClick={() => regen(pending.o, pending.only)}>Régénérer</button>
          <button type="button" className="btn sm quiet" onClick={() => setPending(null)}>Garder ma version</button></div>}
        {t === "email" && <input className="input" aria-label="Objet" value={d.email_subject || ""} onChange={(e) => edit("email_subject", e.target.value)} />}
        {t === "cv" && preview
          ? <div className="cvprev" dangerouslySetInnerHTML={{ __html: cvHtml(d.cv) }} />
          : <textarea className="input kit-text" aria-label="Texte" value={d[t] || ""} onChange={(e) => edit(t, e.target.value)} />}
        <div className="small muted"><span>{words(d[t] || "")} mots</span>{goal && ` · idéal : ${goal[0]} à ${goal[1]}`}</div>
        <Disc label="Personnaliser">
          <div className="row"><b>Langue</b><Seg label="Langue" options={[["fr", "Français"], ["en", "Anglais"]]} value={opts.lang} onChange={(v) => change({ lang: v })} /></div>
          {t === "letter" && (
            <>
              <div className="row"><b>Ton</b><Seg label="Ton" options={[["formal", "Formel"], ["direct", "Direct"], ["warm", "Chaleureux"]]} value={opts.tone} onChange={(v) => change({ tone: v, picks: null })} /></div>
              <div className="row"><b>Longueur</b><Seg label="Longueur" options={[["short", "Court"], ["standard", "Standard"], ["long", "Long"]]} value={opts.length} onChange={(v) => change({ length: v, picks: null })} /></div>
              <div><b>Réalisations citées</b>
                {(d.achievements || []).length ? (
                  <ul className="ach" style={{ marginTop: 8 }}>{d.achievements.map((x) => (
                    <li key={x.text}><label><input type="checkbox" checked={x.picked} onChange={() => togglePick(x.text)} /><span>{x.text}<small>{x.company}</small></span></label></li>))}</ul>
                ) : <p className="muted small" style={{ marginTop: 6 }}>Ajoute des réalisations dans ton CV pour les citer ici.</p>}
              </div>
            </>)}
        </Disc>
      </>);
    foot = (
      <>
        <button type="button" className="btn" onClick={() => copy(t === "email" ? `${d.email_subject}\n\n${d.email}` : d[t] || "")}>Copier</button>
        <button type="button" className="btn quiet" disabled={!!busy} onClick={() => regen(opts, null)}>Tout régénérer</button>
        <button type="button" className="btn quiet" disabled={!!busy} onClick={() => improve(t, d[t] || "")}>{busy === "claude" ? "Claude réécrit…" : "Améliorer avec Claude"}</button>
        <span className="sp" /><button type="button" className="btn primary" onClick={() => { setTab("follow"); setStep(3); }}>Continuer</button>
      </>);
  } else {
    body = (
      <>
        <div>
          <div className="todo-step"><span className={`tick${applied ? " ok" : ""}`}>{applied ? "✓" : ""}</span><div style={{ flex: 1 }}><b>Envoie ta candidature</b>
            <p className="muted small" style={{ margin: "2px 0 10px" }}>Sur le site de l’offre, avec ta lettre et ton CV. Cairn n’envoie jamais rien à ta place.</p>
            <div className="row"><a className="btn sm" href={job.url} target="_blank" rel="noreferrer noopener">Ouvrir l’offre ↗</a>
              {applied ? <span className="chip ok">Marquée comme postulée</span> : <button type="button" className="btn sm primary" onClick={() => a.setStatus(job, "applied")}>C’est fait, marquer comme postulé</button>}</div></div></div>
          <div className="todo-step"><span className={`tick${job.follow_up ? " ok" : ""}`}>{job.follow_up ? "✓" : ""}</span><div style={{ flex: 1 }}><b>Prévois une relance</b>
            <p className="muted small" style={{ margin: "2px 0 10px" }}>{job.follow_up ? `Rappel prévu le ${fmtD(job.follow_up)}.` : "Cairn te rappellera de relancer si tu n’as pas de nouvelles."}</p>
            <Seg label="Relance" options={[[3, "Dans 3 jours"], [7, "Dans 7 jours"], [14, "Dans 14 jours"]]} value="__none__" onChange={(n) => { (job.status ? Promise.resolve() : a.setStatus(job, "saved")).then(() => a.setFollow(job, addDaysIso(n))); }} /></div></div>
        </div>
        <div><b>Message de relance</b><p className="muted small" style={{ margin: "2px 0 10px" }}>Prêt à envoyer le moment venu.</p>
          <input className="input" aria-label="Objet" style={{ marginBottom: 8 }} value={d.follow_subject || ""} onChange={(e) => edit("follow_subject", e.target.value)} />
          <textarea className="input" rows={7} aria-label="Message de relance" value={d.follow || ""} onChange={(e) => edit("follow", e.target.value)} /></div>
      </>);
    foot = (
      <>
        <button type="button" className="btn" onClick={() => copy(`${d.follow_subject}\n\n${d.follow}`)}>Copier la relance</button>
        <button type="button" className="btn quiet" disabled={!!busy} onClick={() => improve("follow", d.follow || "")}>Améliorer avec Claude</button>
        <span className="sp" /><button type="button" className="btn primary" onClick={onClose}>Terminé</button>
      </>);
  }
  void kind;
  return (
    <Modal onClose={onClose} label="Préparer ma candidature" cls="kit">
      <MHead title="Préparer ma candidature" sub={`${job.title} · ${job.company}`} onClose={onClose} />
      <Stepper names={["Compatibilité", "Documents", "Envoi et suivi"]} step={step} onGo={(s) => d && setStep(s)} />
      <div className="mbody">{body}</div>
      {foot && <div className="mfoot">{foot}</div>}
    </Modal>
  );
}