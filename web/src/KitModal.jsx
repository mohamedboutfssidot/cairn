import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { buildKit, saveKitDraft, improveKit, fetchKitSettings, saveKitSettings } from "./api";

const TABS = [
  { id: "gap", label: "Écart" },
  { id: "letter", label: "Lettre" },
  { id: "cv", label: "CV" },
  { id: "email", label: "E-mail" },
  { id: "follow", label: "Relance" },
];
const LANGS = [{ id: "fr", label: "FR" }, { id: "en", label: "EN" }];

function slug(s) { return (s || "candidature").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40); }

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// CV Markdown léger -> page imprimable (Enregistrer en PDF depuis la boîte d'impression).
function printCv(md) {
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  let html = "", list = false;
  for (const line of md.split("\n")) {
    const close = () => { if (list) { html += "</ul>"; list = false; } };
    if (line.startsWith("### ")) { close(); html += `<h3>${inline(line.slice(4))}</h3>`; }
    else if (line.startsWith("## ")) { close(); html += `<h2>${inline(line.slice(3))}</h2>`; }
    else if (line.startsWith("# ")) { close(); html += `<h1>${inline(line.slice(2))}</h1>`; }
    else if (line.startsWith("- ")) { if (!list) { html += "<ul>"; list = true; } html += `<li>${inline(line.slice(2))}</li>`; }
    else if (line.trim()) { close(); html += `<p>${inline(line)}</p>`; }
    else close();
  }
  if (list) html += "</ul>";
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><meta charset="utf-8"><title>CV</title><style>
    body{font:13px/1.45 Arial,sans-serif;color:#111;max-width:760px;margin:30px auto;padding:0 24px}
    h1{font-size:24px;margin:0 0 4px}h2{font-size:14px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #999;margin:18px 0 6px;padding-bottom:3px}
    h3{font-size:13px;margin:10px 0 3px}p{margin:3px 0}ul{margin:3px 0 6px;padding-left:18px}li{margin:2px 0}
    </style>${html}<script>setTimeout(()=>window.print(),300)<\/script>`);
  w.document.close();
  return true;
}

// Fenêtre « Préparer ma candidature » pour l'offre choisie.
export default function KitModal({ job, onClose }) {
  const [kit, setKit] = useState(null);
  const [tab, setTab] = useState("letter");
  const [lang, setLang] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({ has_key: false, model: "" });
  const [showKey, setShowKey] = useState(false);
  const [keyText, setKeyText] = useState("");
  const [instruction, setInstruction] = useState("");
  const [copied, setCopied] = useState(false);
  const saveTimer = useRef(null);

  const load = useCallback(async (l, fresh = false) => {
    setError(null);
    try {
      const k = await buildKit(job.url, l, fresh);
      setKit(k); setLang(k.lang);
    } catch (e) { setError(e.message); }
  }, [job.url]);

  useEffect(() => { load(null); fetchKitSettings().then(setSettings).catch(() => {}); }, [load]);
  useEffect(() => () => clearTimeout(saveTimer.current), []);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Texte courant de l'onglet (l'e-mail regroupe objet + corps).
  const field = { letter: "letter", cv: "cv", email: "email", follow: "follow" }[tab];
  const subjectField = { email: "email_subject", follow: "follow_subject" }[tab];

  function edit(key, value) {
    const next = { ...kit, [key]: value };
    setKit(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveKitDraft(job.url, {
        lang: next.lang, letter: next.letter, cv: next.cv, email_subject: next.email_subject,
        email: next.email, follow_subject: next.follow_subject, follow: next.follow,
      }).catch(() => {});
    }, 700);
  }

  async function changeLang(l) {
    if (l === lang) return;
    if (window.confirm("Changer de langue régénère les brouillons (tes modifications sur cette offre seront remplacées). Continuer ?")) {
      setLang(l); await load(l, true);
    }
  }

  async function regenerate() {
    if (window.confirm("Remplacer les brouillons de cette offre par de nouveaux gabarits ?")) await load(lang, true);
  }

  async function copy() {
    const text = (subjectField ? `${kit[subjectField]}\n\n` : "") + kit[field];
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* presse-papiers refusé */ }
  }

  async function improve() {
    setBusy(true); setError(null);
    try {
      const { text } = await improveKit(job.url, tab, kit[field], lang, instruction);
      edit(field, text);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function saveKey() {
    try { setSettings(await saveKitSettings({ key: keyText })); setKeyText(""); setShowKey(false); } catch (e) { setError(e.message); }
  }
  async function clearKey() {
    try { setSettings(await saveKitSettings({ clear_key: true })); } catch (e) { setError(e.message); }
  }

  const g = kit?.gap;
  const coverage = g && g.offer.length ? Math.round((g.have.length / g.offer.length) * 100) : null;

  return (
    <div className="kit-backdrop" onClick={onClose}>
      <div className="kit" role="dialog" aria-modal="true" aria-label="Préparer ma candidature" onClick={(e) => e.stopPropagation()}>
        <header className="kit__head">
          <div className="kit__title">
            <strong>Préparer ma candidature</strong>
            <span>{job.title} · {job.company}</span>
          </div>
          <div className="kit__langs" role="group" aria-label="Langue des documents">
            {LANGS.map((l) => (
              <button key={l.id} type="button" className={lang === l.id ? "on" : ""} onClick={() => changeLang(l.id)}>{l.label}</button>
            ))}
          </div>
          <button type="button" className="kit__close" onClick={onClose} aria-label="Fermer">×</button>
        </header>

        {!kit ? (
          <div className="kit__body">{error ? <div className="page__error">{error}</div> : "Préparation…"}</div>
        ) : (
          <>
            {kit.empty && (
              <div className="kit__nudge">
                Ta fiche CV est vide : les textes contiennent des [champs à compléter]. <Link to="/profile" onClick={onClose}>Remplir mon CV →</Link>
              </div>
            )}
            <nav className="kit__tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>
              ))}
            </nav>

            <div className="kit__body">
              {error && <div className="page__error">{error}</div>}

              {tab === "gap" ? (
                <div className="kit__gap">
                  {coverage === null ? (
                    <p className="sx-note">Aucune technologie reconnue dans cette offre : rien à comparer.</p>
                  ) : (
                    <>
                      <p className="kit__cover"><strong>{coverage}%</strong> des technologies de l'offre sont dans ton profil ({g.have.length}/{g.offer.length}).</p>
                      <h3>Tu les as — à mettre en avant</h3>
                      <div className="kit__chips">{g.have.length ? g.have.map((x) => <span key={x} className="fact fact--ok">{x}</span>) : <span className="sx-note">Aucune pour l'instant.</span>}</div>
                      <h3>Il te manque</h3>
                      <div className="kit__chips">{g.missing.length ? g.missing.map((x) => <span key={x} className="fact fact--bad">{x}</span>) : <span className="sx-note">Rien : bonne couverture.</span>}</div>
                      <p className="sx-note">Ajoute à ta fiche CV les compétences que tu maîtrises vraiment mais qui sont listées ici comme manquantes. Ne déclare pas ce que tu ne sais pas faire.</p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  {subjectField && (
                    <input className="sx-input kit__subject" value={kit[subjectField]} onChange={(e) => edit(subjectField, e.target.value)} aria-label="Objet" />
                  )}
                  <textarea className="kit__text" value={kit[field]} spellCheck onChange={(e) => edit(field, e.target.value)} aria-label={tab} />
                </>
              )}
            </div>

            {tab !== "gap" && (
              <footer className="kit__foot">
                <div className="kit__actions">
                  <button type="button" className="sx-mini sx-mini--accent" onClick={copy}>{copied ? "Copié ✓" : "Copier"}</button>
                  <button type="button" className="sx-mini" onClick={() => download(`${tab === "cv" ? "cv" : tab === "letter" ? "lettre" : tab}-${slug(job.company)}.${tab === "cv" ? "md" : "txt"}`, (subjectField ? `${kit[subjectField]}\n\n` : "") + kit[field])}>Télécharger</button>
                  {tab === "cv" && <button type="button" className="sx-mini" onClick={() => printCv(kit.cv) || setError("Autorise les fenêtres pop-up pour imprimer.")}>Imprimer / PDF</button>}
                  <button type="button" className="sx-mini" onClick={regenerate}>Régénérer</button>
                </div>
                <div className="kit__ai">
                  {settings.has_key ? (
                    <>
                      <input className="sx-input" placeholder="Consigne (ex. plus court, ton plus direct)" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
                      <button type="button" className="sx-mini sx-mini--accent" disabled={busy} onClick={improve}>{busy ? "Claude écrit…" : "✦ Améliorer avec Claude"}</button>
                      <button type="button" className="kit__link" onClick={clearKey}>Retirer la clé</button>
                    </>
                  ) : showKey ? (
                    <>
                      <input className="sx-input" type="password" autoComplete="off" placeholder="Clé API Anthropic (sk-ant-…)" value={keyText} onChange={(e) => setKeyText(e.target.value)} />
                      <button type="button" className="sx-mini sx-mini--accent" disabled={!keyText.trim()} onClick={saveKey}>Enregistrer</button>
                    </>
                  ) : (
                    <button type="button" className="kit__link" onClick={() => setShowKey(true)}>✦ Activer « Améliorer avec Claude » (clé API)</button>
                  )}
                </div>
                <p className="kit__hint">Relis toujours avant d'envoyer. La clé reste dans ta base locale ; seul le texte de l'offre et ta fiche CV sont envoyés à Claude, à ta demande.</p>
              </footer>
            )}
          </>
        )}
      </div>
    </div>
  );
}