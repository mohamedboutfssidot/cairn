# -*- coding: utf-8 -*-
"""Déduction pays / ville à partir du texte libre "location" des offres.
Partagé par server.py (filtres, facettes) et search_engine.py (sources par pays)."""
import re

# --- Extraction de pays à partir du texte libre "location" -----------------
# Les sources ne donnent jamais un code pays structuré -> on repère les pays
# les plus fréquents dans ce domaine (remote tech) par mot-clé simple. Ce
# n'est pas un geocoding complet, juste assez pour peupler un filtre utile.
_COUNTRY_PATTERNS = [
    ("USA", ["united states", "usa", "u.s.", " us ", "us,"]),
    ("Canada", ["canada"]),
    ("UK", ["united kingdom", "uk,", " uk ", "england", "scotland"]),
    ("Germany", ["germany", "deutschland"]),
    ("France", ["france"]),
    ("Spain", ["spain", "españa"]),
    ("Portugal", ["portugal"]),
    ("Netherlands", ["netherlands", "holland"]),
    ("Poland", ["poland"]),
    ("India", ["india"]),
    ("Morocco", ["morocco", "maroc", "casablanca", "rabat", "tanger", "marrakech", "agadir",
                 "kenitra", "kénitra", "tetouan", "tétouan", "oujda", "settat", "nouaceur",
                 "mohammedia", "meknes", "meknès", " fes ", " fès ", " salé ", "berrechid",
                 "el jadida", "nador", "laayoune", "dakhla"]),
    ("Brazil", ["brazil", "brasil"]),
    ("Mexico", ["mexico"]),
    ("Argentina", ["argentina"]),
    ("Philippines", ["philippines"]),
    ("Australia", ["australia"]),
    ("Singapore", ["singapore"]),
    ("Worldwide / Anywhere", ["anywhere", "worldwide", "global"]),
    ("Europe (non précisé)", ["europe", "emea"]),
    ("APAC (non précisé)", ["apac"]),
    ("LATAM (non précisé)", ["latam"]),
]


def _guess_country(location: str):
    if not location:
        return None
    text = f" {location.lower()} "
    for country, needles in _COUNTRY_PATTERNS:
        if any(n in text for n in needles):
            return country
    return None


guess_country = _guess_country


# Valeurs de "premier segment" qui ne sont pas une ville.
_NOT_A_CITY = {
    "remote", "anywhere", "worldwide", "global", "hybrid", "on-site", "onsite",
    "europe", "emea", "apac", "latam", "international", "multiple locations",
    "multiple", "various", "n/a",
}


def _is_country_word(low: str) -> bool:
    for name, needles in _COUNTRY_PATTERNS:
        if low == name.lower() or low in {n.strip(" ,.") for n in needles[:2]}:
            return True
    return False


def guess_city(location):
    """Ville / zone = premier segment de "Ville, Région, Pays" (format de
    LinkedIn, Indeed, Glassdoor). None si "Remote", un pays seul, ou un texte
    sans virgule qui est lui-même un pays."""
    if not location:
        return None
    parts = [p.strip() for p in re.split(r"[,;/|]", str(location)) if p.strip()]
    if not parts:
        return None
    first = parts[0]
    low = first.lower()
    if low in _NOT_A_CITY or len(first) > 40 or re.search(r"remote|hybrid|anywhere", low):
        return None
    if _is_country_word(low):
        return None  # c'est le pays lui-même, pas une ville
    return first


def country_needles(country, min_len=4):
    """Mots-clés (minuscules) qui identifient un pays dans un texte de lieu —
    pour filtrer côté SQL ; on écarte les motifs trop courts/ambigus (" us ")."""
    for name, needles in _COUNTRY_PATTERNS:
        if name == country:
            return [n.strip() for n in needles if len(n.strip()) >= min_len]
    return []