import { useEffect, useRef, useState } from "react";
import { fetchCandidate, saveCandidate } from "./api";
import { ChipInput } from "./ui";

const EMPTY = { name: "", email: "", phone: "", location: "", linkedin: "", github: "", website: "", headline: "", summary: "",
  skills: [], experiences: [], education: [], languages: [] };

// Fiche candidat : la SEULE source de faits pour les lettres et CV générés
// (rien n'est inventé). Enregistrement automatique, comme le profil de recherche.
export default function CandidateForm() {
  const [c, setC] = useState(EMPTY);
  const [state, setState] = useState("idle");
  const loaded = useRef(false);
  const timer = useRef(null);

  useEffect(() => {
    fetchCandidate().then((d) => { loaded.current = true; setC({ ...EMPTY, ...d }); }).catch(() => setState("error"));
    return () => clearTimeout(timer.current);
  }, []);

  function change(patch) {
    if (!loaded.current) return;
    const next = { ...c, ...patch };
    setC(next);
    setState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { await saveCandidate(next); setState("saved"); } catch { setState("error"); }
    }, 700);
  }

  const setExp = (i, patch) => change({ experiences: c.experiences.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const setEdu = (i, patch) => change({ education: c.education.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const field = (key, label, placeholder, type = "text") => (
    <label className="cv-field">
      <span>{label}</span>
      <input className="sx-input" type={type} placeholder={placeholder} value={c[key]} onChange={(e) => change({ [key]: e.target.value })} />
    </label>
  );

  return (
    <section className="sx-card sx-card--wide cv-form">
      <h2 className="sx-card__title">
        Mon CV (base de tes candidatures)
        <span className={`savestate savestate--${state}`}>
          {state === "saving" ? "Enregistrement…" : state === "saved" ? "Enregistré ✓" : state === "error" ? "Échec" : ""}
        </span>
      </h2>
      <p className="sx-note">
        Les lettres et CV proposés pour chaque offre s'appuient uniquement sur cette fiche : rien n'est inventé.
        Plus elle est précise (réalisations chiffrées, technologies), plus le résultat est pertinent.
      </p>

      <div className="cv-grid">
        {field("name", "Nom complet", "Prénom Nom")}
        {field("headline", "Titre", "ex. Ingénieur IA / Machine Learning")}
        {field("email", "E-mail", "toi@exemple.com", "email")}
        {field("phone", "Téléphone", "+212 …")}
        {field("location", "Ville, pays", "ex. Casablanca, Maroc")}
        {field("linkedin", "LinkedIn", "linkedin.com/in/…")}
        {field("github", "GitHub", "github.com/…")}
        {field("website", "Site / portfolio", "https://…")}
      </div>

      <label className="cv-field cv-field--block">
        <span>Résumé (3 à 4 lignes)</span>
        <textarea className="trk__note" rows={3} placeholder="Qui tu es, ton expertise, ce que tu cherches." value={c.summary} onChange={(e) => change({ summary: e.target.value })} />
      </label>

      <div className="cv-field cv-field--block">
        <span>Compétences</span>
        <ChipInput values={c.skills} onChange={(skills) => change({ skills })} placeholder="ex. Python, PyTorch, RAG…" suggestions={["Python", "PyTorch", "SQL", "Docker", "LLM", "RAG", "AWS"]} />
      </div>

      <div className="cv-field cv-field--block">
        <span>Expériences</span>
        {c.experiences.map((e, i) => (
          <div key={i} className="cv-card">
            <div className="cv-grid">
              <input className="sx-input" placeholder="Poste" value={e.role} onChange={(ev) => setExp(i, { role: ev.target.value })} />
              <input className="sx-input" placeholder="Entreprise" value={e.company} onChange={(ev) => setExp(i, { company: ev.target.value })} />
              <input className="sx-input" placeholder="Période (ex. 2023 – 2025)" value={e.period} onChange={(ev) => setExp(i, { period: ev.target.value })} />
            </div>
            <textarea className="trk__note" rows={4} placeholder={"Une réalisation par ligne, avec des chiffres si possible.\nex. Déployé un pipeline RAG pour 10 000 documents (PyTorch, FastAPI)"}
              value={(e.bullets || []).join("\n")} onChange={(ev) => setExp(i, { bullets: ev.target.value.split("\n") })} />
            <button type="button" className="sx-mini" onClick={() => change({ experiences: c.experiences.filter((_, k) => k !== i) })}>Supprimer</button>
          </div>
        ))}
        <button type="button" className="sx-mini sx-mini--accent" onClick={() => change({ experiences: [...c.experiences, { role: "", company: "", period: "", bullets: [] }] })}>
          ＋ Ajouter une expérience
        </button>
      </div>

      <div className="cv-field cv-field--block">
        <span>Formation</span>
        {c.education.map((e, i) => (
          <div key={i} className="cv-card">
            <div className="cv-grid">
              <input className="sx-input" placeholder="Diplôme" value={e.degree} onChange={(ev) => setEdu(i, { degree: ev.target.value })} />
              <input className="sx-input" placeholder="École / université" value={e.school} onChange={(ev) => setEdu(i, { school: ev.target.value })} />
              <input className="sx-input" placeholder="Année" value={e.period} onChange={(ev) => setEdu(i, { period: ev.target.value })} />
            </div>
            <button type="button" className="sx-mini" onClick={() => change({ education: c.education.filter((_, k) => k !== i) })}>Supprimer</button>
          </div>
        ))}
        <button type="button" className="sx-mini sx-mini--accent" onClick={() => change({ education: [...c.education, { degree: "", school: "", period: "" }] })}>
          ＋ Ajouter une formation
        </button>
      </div>

      <div className="cv-field cv-field--block">
        <span>Langues</span>
        <ChipInput values={c.languages} onChange={(languages) => change({ languages })} placeholder="ex. Français (natif), Anglais (C1)" tone="blue" />
      </div>
    </section>
  );
}