import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../store.jsx";
import { Switch, ChipBox, CountrySelect, Disc, Field, Foot, Ring, Seg } from "../ui.jsx";
import { COUNTRIES } from "../meta.js";
import { completeness, profileChecklist } from "./TodayPage.jsx";

/** Copie locale éditable d'une valeur du serveur ; enregistre 800 ms après la dernière modification. */
function useDraft(source, save) {
  const [v, setRaw] = useState(source);
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setRaw(source); }, [source]);
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => { save(v); dirty.current = false; }, 800);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const setV = (fn) => { dirty.current = true; setRaw(fn); };
  return [v, setV];
}

export default function ProfilePage() {
  const a = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "search";
  const m = completeness(a.cand);
  const tabs = [["search", "Ce que je cherche"], ["cv", "Mon CV"], ["alerts", "Alertes"], ["account", "Compte"]];
  return (
    <div className="page">
      <div className="row" style={{ gap: 20 }}>
        <Ring pct={m.p} label={`Profil complet à ${m.p} %`} />
        <div><h1>Mon profil</h1><p className="muted" style={{ marginTop: 4 }}>{m.todo.length ? `Prochaine étape : ${m.todo[0].l.toLowerCase()}.` : "Ton profil est complet."}</p></div>
      </div>
      <div className="tabs" role="tablist">{tabs.map(([id, l]) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setParams({ tab: id })}>{l}</button>))}</div>
      <div className="pbody">
        {tab === "search" && <SearchTab />}
        {tab === "cv" && <CvTab />}
        {tab === "alerts" && <AlertsTab />}
        {tab === "account" && <AccountTab />}
      </div>
      <Foot />
    </div>
  );
}

function SearchTab() {
  const a = useApp();
  const [p, setP] = useDraft(a.profile, a.saveProf);
  const [countries, setCountries] = useState([]);
  useEffect(() => { a.api.fetchFilters().then((r) => setCountries((r.countries || []).map((c) => (typeof c === "string" ? c : c.value || c.name || c.country || "")).filter(Boolean))).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  return (
    <>
      <div><h3>Postes visés</h3><p className="muted small" style={{ margin: "4px 0 10px" }}>Les offres proches de ces titres obtiennent la meilleure compatibilité. « Machine Learning » suffit.</p>
        <ChipBox values={p.titles || []} onChange={(v) => set("titles", v)} placeholder="ex. AI Engineer" suggestions={["AI Engineer", "Data Scientist", "LLM Engineer", "Data Analyst"]} /></div>
      <div><h3>Pays</h3>
        <div style={{ marginTop: 10, display: "grid", gap: 10, maxWidth: 420 }}>
          <CountrySelect label="Ajouter un pays" placeholder="Ajouter un pays…" value="" onChange={(v) => v && !(p.countries || []).includes(v) && set("countries", [...(p.countries || []), v])}
            options={[...new Set([...COUNTRIES.map((c) => c.label), ...countries])].filter((c) => !(p.countries || []).includes(c)).sort((x, y) => x.localeCompare(y, "fr")).map((c) => ({ value: c, label: c }))} />
          <div className="chips">{(p.countries || []).length
            ? p.countries.map((c) => <span key={c} className="chip ok">{c} <button type="button" aria-label={`Retirer ${c}`} onClick={() => set("countries", p.countries.filter((x) => x !== c))}>×</button></span>)
            : <span className="muted small">Aucun pays choisi : toutes les offres comptent.</span>}</div>
        </div>
      </div>
      <div><h3>Télétravail</h3><div style={{ marginTop: 10 }}><Seg label="Télétravail" options={[["any", "Peu importe"], ["remote", "Remote"], ["onsite", "Sur site"]]} value={p.remote || "any"} onChange={(v) => set("remote", v)} /></div></div>
      <Disc label="Réglages avancés">
        <p className="muted small">Ces réglages affinent la compatibilité. Tu peux les ignorer.</p>
        <div><h4 style={{ font: "700 15px var(--font-b)", marginBottom: 6 }}>Compétences indispensables</h4><ChipBox values={p.must || []} onChange={(v) => set("must", v)} placeholder="ex. Python" suggestions={["Python", "LLM", "RAG", "SQL"]} /></div>
        <div><h4 style={{ font: "700 15px var(--font-b)", marginBottom: 6 }}>Compétences appréciées</h4><ChipBox values={p.nice || []} onChange={(v) => set("nice", v)} placeholder="ex. AWS" suggestions={["AWS", "Docker", "Kubernetes"]} /></div>
        <div><h4 style={{ font: "700 15px var(--font-b)", marginBottom: 6 }}>Mots à éviter</h4><ChipBox values={p.exclude || []} onChange={(v) => set("exclude", v)} placeholder="ex. stage" suggestions={["stage", "senior director", "unpaid"]} /></div>
        <Switch checked={p.visa} onChange={(v) => set("visa", v)}>Favoriser les offres qui parlent de visa ou de relocation</Switch>
      </Disc>
      <p className="small muted">Modifications enregistrées automatiquement.</p>
    </>
  );
}

function CvTab() {
  const a = useApp();
  const [params, setParams] = useSearchParams();
  const [c, setC] = useDraft(a.cand, a.saveCand);
  const [expOpen, setExpOpen] = useState(0);
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const open = params.get("open") || "";
  const toggle = (id) => setParams({ tab: "cv", ...(open === id ? {} : { open: id }) });
  const done = (sec) => profileChecklist(c).filter((x) => x.sec === sec).every((x) => x.ok);
  const setExp = (i, k, v) => set("experiences", c.experiences.map((e, n) => (n === i ? { ...e, [k]: v } : e)));
  const setEdu = (i, k, v) => set("education", c.education.map((e, n) => (n === i ? { ...e, [k]: v } : e)));
  const secs = [
    ["identity", "Identité et résumé", c.name ? c.name + (c.email ? " · " + c.email : "") : "À compléter"],
    ["skills", "Compétences et langues", `${c.skills.length} compétence${c.skills.length > 1 ? "s" : ""} · ${c.languages.length} langue${c.languages.length > 1 ? "s" : ""}`],
    ["experience", "Expériences", `${c.experiences.length} expérience${c.experiences.length > 1 ? "s" : ""}`],
    ["education", "Formation", `${c.education.length} formation${c.education.length > 1 ? "s" : ""}`],
  ];
  const bodies = {
    identity: <>
      <div className="grid2">
        <Field label="Nom complet" value={c.name} onChange={(v) => set("name", v)} placeholder="Prénom Nom" />
        <Field label="Titre professionnel" value={c.headline} onChange={(v) => set("headline", v)} placeholder="ex. Ingénieure IA" />
        <Field label="E-mail" type="email" value={c.email} onChange={(v) => set("email", v)} />
        <Field label="Téléphone" value={c.phone} onChange={(v) => set("phone", v)} />
        <Field label="Ville, pays" value={c.location} onChange={(v) => set("location", v)} />
        <Field label="LinkedIn" value={c.linkedin} onChange={(v) => set("linkedin", v)} />
        <Field label="GitHub" value={c.github} onChange={(v) => set("github", v)} />
        <Field label="Site web" value={c.website} onChange={(v) => set("website", v)} />
      </div>
      <Field label="Résumé, 3 à 4 lignes" area value={c.summary} onChange={(v) => set("summary", v)} /></>,
    skills: <>
      <div><h4 style={{ font: "700 15px var(--font-b)", marginBottom: 6 }}>Compétences</h4><ChipBox values={c.skills} onChange={(v) => set("skills", v)} placeholder="ex. Python, PyTorch" suggestions={["Kubernetes", "TypeScript", "Terraform", "Airflow"]} /></div>
      <div><h4 style={{ font: "700 15px var(--font-b)", marginBottom: 6 }}>Langues</h4><ChipBox values={c.languages} onChange={(v) => set("languages", v)} placeholder="ex. Anglais (C1)" suggestions={["Français (natif)", "Anglais (C1)", "Espagnol (B1)"]} /></div></>,
    experience: <>
      <p className="muted small">Une bonne réalisation commence par un verbe, contient un chiffre et cite les outils ou méthodes utilisés.</p>
      {c.experiences.map((e, i) => (
        <div className="acc" key={i}>
          <button type="button" aria-expanded={expOpen === i} onClick={() => setExpOpen(expOpen === i ? -1 : i)}>
            <span><strong>{e.role || "Nouveau poste"}{e.company ? " · " + e.company : ""}</strong><span className="small muted">{e.period || "période ?"}</span></span></button>
          {expOpen === i && (
            <div className="body">
              <div className="grid2"><Field label="Poste" value={e.role} onChange={(v) => setExp(i, "role", v)} /><Field label="Entreprise" value={e.company} onChange={(v) => setExp(i, "company", v)} /><Field label="Période" value={e.period} onChange={(v) => setExp(i, "period", v)} /></div>
              <Field label="Réalisations, une par ligne" area rows={6} value={(e.bullets || []).join("\n")} onChange={(v) => setExp(i, "bullets", v.split("\n"))} />
              <button type="button" className="btn sm danger" style={{ alignSelf: "flex-start" }} onClick={() => set("experiences", c.experiences.filter((_, n) => n !== i))}>Supprimer</button>
            </div>)}
        </div>))}
      <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => { set("experiences", [...c.experiences, { role: "", company: "", period: "", bullets: [] }]); setExpOpen(c.experiences.length); }}>Ajouter une expérience</button></>,
    education: <>
      {c.education.map((e, i) => (
        <div key={i} className="stack" style={{ gap: 10 }}>
          <div className="grid2"><Field label="Diplôme" value={e.degree} onChange={(v) => setEdu(i, "degree", v)} /><Field label="École" value={e.school} onChange={(v) => setEdu(i, "school", v)} /><Field label="Année" value={e.period} onChange={(v) => setEdu(i, "period", v)} /></div>
          <button type="button" className="btn sm danger" style={{ alignSelf: "flex-start" }} onClick={() => set("education", c.education.filter((_, n) => n !== i))}>Supprimer</button>
        </div>))}
      <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => set("education", [...c.education, { degree: "", school: "", period: "" }])}>Ajouter une formation</button></>,
  };
  return (
    <>
      <p className="muted">Ton CV sert à écrire tes lettres et à noter les offres. Il reste sur ton ordinateur et rien n’est envoyé sans ton accord.</p>
      {secs.map(([id, title, sub]) => (
        <div className="acc" key={id}>
          <button type="button" aria-expanded={open === id} onClick={() => toggle(id)}>
            <span><strong><span className={`tick${done(id) ? " ok" : ""}`}>{done(id) ? "✓" : ""}</span>{title}</strong><span className="small muted" style={{ marginLeft: 30 }}>{sub}</span></span></button>
          {open === id && <div className="body">{bodies[id]}</div>}
        </div>))}
      <p className="small muted">Modifications enregistrées automatiquement.</p>
    </>
  );
}

const FREQ = [[6, "6 h"], [12, "12 h"], [24, "24 h"], [72, "3 jours"]];
function AlertsTab() {
  const a = useApp();
  const [cfg, setCfg] = useState(a.alerts);
  const [tok, setTok] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => { if (a.alerts && !cfg) setCfg(a.alerts); }, [a.alerts]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cfg) return <p className="muted">Chargement des alertes…</p>;
  const tg = cfg.telegram || {};
  const has = (ch) => (cfg.channels || []).includes(ch);
  const save = async (next = cfg) => {
    const body = { ...next, telegram: { ...(next.telegram || {}), ...(tok ? { token: tok } : {}) } };
    const r = await a.saveAl(body);
    if (r) { setCfg(r); setTok(""); }
    return r;
  };
  const change = (patch) => { const next = { ...cfg, ...patch }; setCfg(next); save(next); };
  const test = async () => {
    setMsg("Envoi…");
    await save();
    try { await a.api.testAlerts(); setMsg("Message de test envoyé."); } catch (e) { setMsg(e.message); }
  };
  const st = cfg.state || {};
  return (
    <>
      <p className="muted">Cairn actualise tes recherches enregistrées et te prévient quand une bonne offre apparaît.</p>
      <Switch checked={cfg.enabled} onChange={(v) => change({ enabled: v })}>Actualiser automatiquement</Switch>
      {cfg.enabled ? (
        <>
          <div><h4 style={{ font: "700 15px var(--font-b)", marginBottom: 8 }}>Toutes les</h4><Seg label="Fréquence" options={FREQ} value={cfg.every_hours} onChange={(v) => change({ every_hours: v })} /></div>
          <div><h4 style={{ font: "700 15px var(--font-b)", marginBottom: 8 }}>Me prévenir pour</h4><Seg label="Seuil" options={[[0, "Toutes les offres"], [65, "Les bonnes offres"], [80, "Les excellentes seulement"]]} value={cfg.min_score} onChange={(v) => change({ min_score: v })} /></div>
          <div className="stack" style={{ gap: 14 }}>
            <div className="stack" style={{ gap: 8 }}>
              <h4 style={{ font: "700 15px var(--font-b)" }}>Telegram {has("telegram") && <span className="chip ok" style={{ marginLeft: 8 }}>Configuré</span>}</h4>
              <input className="input" type="password" autoComplete="off" aria-label="Jeton du bot" placeholder={tg.token_set ? "Jeton enregistré (laisse vide pour le garder)" : "Jeton du bot"} value={tok} onChange={(e) => setTok(e.target.value)} />
              <input className="input" aria-label="Identifiant du chat" placeholder="Identifiant du chat" value={tg.chat_id || ""} onChange={(e) => setCfg({ ...cfg, telegram: { ...tg, chat_id: e.target.value } })} />
              <p className="muted small">Crée un bot avec @BotFather, écris-lui un message, puis récupère ton identifiant avec @userinfobot.</p>
              <div className="row"><button type="button" className="btn sm" onClick={() => save()}>Enregistrer Telegram</button></div>
            </div>
            <p className="muted small">L’envoi par e-mail se règle dans la configuration du serveur (fichier alerts), il n’est pas modifiable ici.</p>
          </div>
          <div className="row"><button type="button" className="btn" onClick={test}>Envoyer un message de test</button>
            <button type="button" className="btn" onClick={() => a.api.runAlertsNow().then(() => setMsg("Actualisation lancée.")).catch((e) => setMsg(e.message))}>Lancer maintenant</button>
            {msg && <span className="small muted" role="status">{msg}</span>}</div>
          {st.next_run && <p className="muted small">Prochaine actualisation : {new Date(st.next_run).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.</p>}
        </>
      ) : <p className="muted small">Activée, l’actualisation se fait seule tant que le serveur tourne.</p>}
    </>
  );
}

function AccountTab() {
  const a = useApp();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const ks = a.kitSettings;
  const saveKey = async (clear) => {
    setBusy(true);
    try { a.setKitSettings(await a.api.saveKitSettings(clear ? { clear_key: true } : { key })); setKey(""); a.say(clear ? "Clé supprimée." : "Clé enregistrée."); } catch (e) { a.say(e.message); }
    setBusy(false);
  };
  const trackedN = a.jobs.filter((j) => j.status).length;
  const untracked = a.total - trackedN;
  const wipe = async () => {
    if (!window.confirm(`Retirer ${untracked} offre${untracked > 1 ? "s" : ""} non suivie${untracked > 1 ? "s" : ""} ? Tes offres suivies sont conservées.`)) return;
    await a.cleanList();
  };
  return (
    <>
      <div><h3>Assistant Claude, facultatif</h3>
        <p className="muted small" style={{ margin: "4px 0 12px", maxWidth: "60ch" }}>Sans clé, les lettres et CV sont assemblés à partir de ta fiche. Avec une clé API Anthropic, « Améliorer avec Claude » réécrit chaque document en s’appuyant uniquement sur ta fiche : rien n’est inventé.</p>
        <div className="row">
          <input className="input" style={{ maxWidth: 340 }} type="password" autoComplete="off" placeholder={ks.has_key ? "Clé enregistrée" : "sk-ant-…"} aria-label="Clé API Anthropic" value={key} onChange={(e) => setKey(e.target.value)} />
          <button type="button" className="btn" disabled={!key || busy} onClick={() => saveKey(false)}>Enregistrer</button>
          {ks.has_key && <button type="button" className="btn quiet" disabled={busy} onClick={() => saveKey(true)}>Supprimer la clé</button>}
        </div></div>
      <div><h3>Tes données</h3>
        <p className="muted small" style={{ margin: "4px 0 12px", maxWidth: "60ch" }}>Tout reste sur ton ordinateur. Cairn n’envoie jamais une candidature à ta place et ne partage aucune donnée.</p>
        <p className="small" style={{ marginBottom: 10 }}><b>{a.total.toLocaleString("fr-FR")}</b> offres enregistrées, dont <b>{trackedN}</b> suivies.</p>
        <button type="button" className="btn danger" disabled={!untracked} onClick={wipe}>Nettoyer ma liste (garder les offres suivies)</button></div>
    </>
  );
}