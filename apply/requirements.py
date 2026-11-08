# -*- coding: utf-8 -*-
"""
La couche manquante entre "j'ai trouvé l'offre" et "j'ai postulé" : chaque
offre ne demande pas la même chose. Certaines veulent juste un CV. D'autres
veulent une vidéo de présentation, un lien GitHub, une réponse à "pourquoi
vous", tes prétentions salariales, ta disponibilité...

Ce module lit la description de l'offre, détecte quels types d'exigences
apparaissent, et pour chacune :
  - si l'info existe déjà dans ton CANDIDATE_PROFILE -> la fournit directement
  - sinon -> la signale comme "à faire toi-même", avec une explication de
    pourquoi (une vidéo, par exemple, ne peut jamais être générée pour toi)

Rien n'est deviné : si le profil est vide pour un champ, c'est marqué "à
compléter", jamais rempli avec une valeur inventée.
"""
import re
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Requirement:
    type: str              # clé technique, ex. "github"
    label: str              # nom lisible, ex. "Lien GitHub"
    status: str              # "fourni" | "à compléter" | "à faire toi-même"
    value: Optional[str] = None    # la valeur si "fourni"
    note: Optional[str] = None      # explication si "à compléter"/"à faire toi-même"


# Chaque entrée : (type, label, [patterns à chercher dans la description, FR+EN],
#                   nom du champ dans CANDIDATE_PROFILE ou None si non-générable,
#                   note si le champ est vide ou non-générable)
REQUIREMENT_RULES = [
    ("github", "Lien GitHub / code public",
     [r"\bgithub\b", r"code sample", r"échantillon de code", r"portfolio de code"],
     "github",
     "Ajoute ton lien GitHub dans config.CANDIDATE_PROFILE['github']."),

    ("portfolio", "Portfolio / site personnel",
     [r"\bportfolio\b", r"site personnel", r"personal website", r"work samples?"],
     "portfolio",
     "Ajoute ton lien portfolio dans config.CANDIDATE_PROFILE['portfolio']."),

    ("video", "Vidéo de présentation",
     [r"record a (short )?video", r"vid[ée]o de pr[ée]sentation", r"\bloom\b",
      r"video introduction", r"introduce yourself.{0,30}video"],
     None,
     "Une vidéo ne peut pas être générée pour toi — à enregistrer toi-même "
     "(regarde ce que l'offre demande précisément comme durée/sujet)."),

    ("personal_statement", "Texte \"parlez-nous de vous\" / motivation détaillée",
     [r"tell us about yourself", r"why do you want to work", r"pourquoi (vous|nous)",
      r"parlez-nous de vous", r"personal statement", r"lettre de motivation"],
     None,  # généré par cover_letter.py, pas ici — juste signalé comme couvert
     "Couvert par apply/cover_letter.py (le brouillon de lettre)."),

    ("salary", "Prétentions salariales",
     [r"salary expectation", r"desired salary", r"compensation expectation",
      r"pr[ée]tentions? salariales?", r"attentes? salariales?"],
     "desired_salary",
     "Ajoute un montant/une fourchette dans config.CANDIDATE_PROFILE['desired_salary'] "
     "— ou laisse vide si tu préfères négocier plus tard sans donner de chiffre."),

    ("availability", "Disponibilité / date de début",
     [r"start date", r"availability", r"date de d[ée]but", r"disponibilit[ée]",
      r"notice period", r"pr[ée]avis"],
     "availability",
     "Ajoute ta disponibilité dans config.CANDIDATE_PROFILE['availability']."),

    ("work_auth", "Autorisation de travail / visa",
     [r"work authorization", r"visa sponsorship", r"right to work",
      r"autorisation de travail", r"sponsorisation.{0,15}visa"],
     "work_authorization",
     "Ajoute ta situation réelle dans config.CANDIDATE_PROFILE['work_authorization'] "
     "— c'est sensible, sois honnête, ne laisse pas ce champ vide sur une vraie candidature."),

    ("references", "Références / recommandations",
     [r"\breferences?\b", r"referees?", r"r[ée]f[ée]rences?"],
     None,
     "À préparer toi-même (coordonnées de 2-3 personnes qui peuvent te recommander) "
     "— pas quelque chose qu'on peut deviner ou générer."),

    ("resume", "CV / Resume",
     [r"\bresume\b", r"\bcv\b", r"curriculum vitae"],
     None,
     "Ton CV existant — assure-toi qu'il est à jour, ce module ne le génère pas."),
]


def detect_requirements(description: str, profile: dict) -> List[Requirement]:
    if not description:
        return []
    text = description.lower()
    found = []

    for req_type, label, patterns, profile_field, note in REQUIREMENT_RULES:
        if not any(re.search(p, text, flags=re.IGNORECASE) for p in patterns):
            continue  # cette offre ne demande pas ça

        if profile_field:
            value = (profile.get(profile_field) or "").strip()
            if value:
                found.append(Requirement(req_type, label, "fourni", value=value))
            else:
                found.append(Requirement(req_type, label, "à compléter", note=note))
        else:
            found.append(Requirement(req_type, label, "à faire toi-même", note=note))

    return found


def format_checklist(requirements: List[Requirement]) -> str:
    if not requirements:
        return "Aucune exigence particulière détectée au-delà du CV standard.\n"

    lines = ["Exigences détectées dans cette offre :\n"]
    for r in requirements:
        if r.status == "fourni":
            lines.append(f"  [OK] {r.label} -> {r.value}")
        elif r.status == "à compléter":
            lines.append(f"  [  ] {r.label} — {r.note}")
        else:  # à faire toi-même
            lines.append(f"  [!!] {r.label} — {r.note}")
    return "\n".join(lines) + "\n"


def checklist_for_job(job: dict, profile: dict) -> str:
    reqs = detect_requirements(job.get("description") or "", profile)
    header = f"{job.get('title', 'Poste')} — {job.get('company', '')}\n{'=' * 40}\n"
    return header + format_checklist(reqs)
