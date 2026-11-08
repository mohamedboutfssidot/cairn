# -*- coding: utf-8 -*-
"""
Le but n'est pas de "postuler automatiquement" (trop risqué — vu la mise en
garde sur les bans LinkedIn et les candidatures génériques mal reçues) mais
d'éliminer le vrai goulot d'étranglement : écrire un message adapté à
CHAQUE offre. Toi tu restes celui qui relit et clique "Envoyer".

Deux modes :
- "template" (par défaut) : aucune dépendance, aucun réseau, marche tout de
  suite. Repère les compétences de ton profil qui apparaissent explicitement
  dans l'offre et construit un texte structuré autour de ça.
- "ollama" (optionnel) : passe par un modèle local via Ollama pour un texte
  plus naturel. Si Ollama n'est pas installé/lancé, on retombe
  automatiquement sur le template — jamais de plantage sec.
"""
import json
import re
from pathlib import Path
from datetime import date


def find_matching_skills(description: str, top_skills: list) -> list:
    """Renvoie les compétences de ton profil qui apparaissent explicitement
    dans le texte de l'offre — c'est ce qui rend le template "adapté" sans
    avoir besoin d'un LLM."""
    if not description:
        return []
    text = description.lower()
    return [s for s in top_skills if s.lower() in text]


def generate_template_letter(job: dict, profile: dict) -> str:
    matched = find_matching_skills(job.get("description") or "", profile.get("top_skills", []))
    matched_str = ", ".join(matched) if matched else ", ".join(profile.get("top_skills", [])[:3])
    highlight = (profile.get("highlights") or ["mon expérience pertinente"])[0]

    return f"""Objet : Candidature — {job.get('title', 'Poste')} chez {job.get('company', '')}

Bonjour,

Je me permets de postuler au poste de {job.get('title', 'Poste')} chez {job.get('company', '')}.

{("Votre offre mentionne " + matched_str + ", ce qui correspond directement à mon profil.") if matched else ("Mon profil couvre notamment " + matched_str + ".")}
{highlight}

Je serais ravi d'échanger sur la façon dont je peux contribuer à votre équipe.

Cordialement,
{profile.get('name', '')}
{profile.get('email', '')} — {profile.get('linkedin', '')}

---
[BROUILLON — à relire et personnaliser avant envoi. Compétences détectées dans l'offre : {matched_str or 'aucune détectée automatiquement'}]
"""


def generate_ollama_letter(job: dict, profile: dict, model: str = "llama3.2") -> str:
    """Optionnel — nécessite Ollama installé et lancé (ollama.com, gratuit,
    tourne en local). Si indisponible, lève une exception que main() attrape
    pour retomber sur le template."""
    import requests

    prompt = f"""Écris une courte lettre de motivation (150 mots max, en français) pour ce poste :

Poste : {job.get('title')}
Entreprise : {job.get('company')}
Description de l'offre : {(job.get('description') or '')[:1500]}

Profil du candidat :
- Nom : {profile.get('name')}
- Résumé : {profile.get('headline')}
- Compétences clés : {', '.join(profile.get('top_skills', []))}
- Points forts : {'; '.join(profile.get('highlights', []))}

Ne pas inventer d'informations qui ne sont pas données ci-dessus. Ton professionnel mais direct."""

    resp = requests.post(
        "http://localhost:11434/api/generate",
        json={"model": model, "prompt": prompt, "stream": False},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json().get("response", "").strip()


def safe_filename(job: dict) -> str:
    raw = f"{job.get('company', 'inconnu')}_{job.get('title', 'poste')}"
    return re.sub(r"[^\w\-]+", "_", raw)[:120]


def generate_all(jobs_path: str = "jobs_discovered.json",
                  out_dir: str = "cover_letters",
                  use_ollama: bool = False,
                  ollama_model: str = "llama3.2",
                  limit: int = None):
    """Génère un brouillon par offre, dans out_dir/. Ne régénère PAS un
    brouillon déjà existant pour la même offre (idempotent — tu peux relancer
    après un nouveau discover.py sans tout réécrire).

    Chaque fichier commence par la checklist des exigences détectées
    (apply/requirements.py) avant la lettre elle-même — pour que tu voies
    d'un coup d'œil si l'offre demande une vidéo, un GitHub, etc."""
    import config
    from apply.requirements import checklist_for_job

    jobs = json.loads(Path(jobs_path).read_text(encoding="utf-8"))
    if limit:
        jobs = jobs[:limit]

    out = Path(out_dir)
    out.mkdir(exist_ok=True)

    profile = config.CANDIDATE_PROFILE
    created, skipped = 0, 0

    for job in jobs:
        fname = out / f"{safe_filename(job)}.txt"
        if fname.exists():
            skipped += 1
            continue

        letter = None
        if use_ollama:
            try:
                letter = generate_ollama_letter(job, profile, model=ollama_model)
            except Exception as e:
                print(f"  [Ollama indisponible pour {job.get('company')} — {type(e).__name__}, "
                      f"utilisation du template] ", end="")

        if not letter:
            letter = generate_template_letter(job, profile)

        checklist = checklist_for_job(job, profile)
        fname.write_text(checklist + "\n" + letter, encoding="utf-8")
        created += 1

    print(f"\n{created} brouillon(s) créé(s) dans {out_dir}/, {skipped} déjà existant(s) ignoré(s).")
    return created, skipped


if __name__ == "__main__":
    import sys
    from pathlib import Path as _P
    sys.path.insert(0, str(_P(__file__).parent.parent))
    generate_all()
