# -*- coding: utf-8 -*-
"""
Tout ce que tu es censé modifier toi-même est ici — rien d'autre dans le
projet ne devrait avoir besoin d'être édité pour changer ta recherche.
"""

# Mots-clés de recherche (utilisés par toutes les sources qui le permettent)
SEARCH_KEYWORDS = ["AI Engineer", "Machine Learning Engineer", "ML Engineer"]

# Pour JobSpy : requête + lieu (JobSpy veut un lieu même pour du remote)
JOBSPY_SEARCH_TERM = "AI Engineer remote"
JOBSPY_LOCATION = "Remote"
JOBSPY_SITES = ["indeed", "linkedin", "zip_recruiter", "glassdoor"]  # + "naukri", "bayt" si besoin
JOBSPY_RESULTS_PER_SITE = 40
JOBSPY_HOURS_OLD = 168  # 7 jours

# Onglet ENTREPRISES : nom -> (ats, slug). Mets "unknown" pour un slug que tu
# n'as pas encore identifié — detect_ats() dans ats_sources.py essaiera de le
# deviner automatiquement.
ATS_TARGETS = {
    "Ashby":                 ("ashby",      "ashby"),          # confirmé
    "Supabase":              ("unknown",    "supabase"),
    "Hotjar":                ("unknown",    "hotjar"),
    "MailerLite":            ("unknown",    "mailerlite"),
    "Doist":                 ("unknown",    "doist"),
    "Publitas":              ("unknown",    "publitas"),
    "Automattic":            ("unknown",    "automattic"),
    "Canonical":             ("unknown",    "canonical"),
    "Deel":                  ("unknown",    "deel"),
    "SafetyWing":            ("unknown",    "safetywing"),
    "PostHog":                ("unknown",   "posthog"),
    "Basecamp (37signals)":  ("unknown",    "37signals"),
    "Buffer":                ("unknown",    "buffer"),
    "Sourcegraph":           ("unknown",    "sourcegraph"),
    "Sanity":                ("unknown",    "sanity"),
}

# Datasets Hugging Face à interroger (voir dataset_sources.py)
# Mets HF_DATASETS_ENABLED = False si ta connexion à huggingface.co continue
# de timeout/couper — les 4 API + le motif ATS suffisent largement en volume.
HF_DATASETS_ENABLED = True
HF_DATASETS = [
    "jobicy/remote-jobs",
    "edwarddgao/open-apply-jobs",
]

# Fichier de sortie (une ligne = une offre, structure du schema.Job)
OUTPUT_CSV = "jobs_discovered.csv"
OUTPUT_JSON = "jobs_discovered.json"

# ---- Ton profil pour la génération de lettres de motivation (apply/cover_letter.py) ----
# À REMPLIR TOI-MÊME — je ne devine pas ton pitch à ta place. "top_skills" sert
# à repérer automatiquement quels mots-clés de chaque offre matchent ton profil.
CANDIDATE_PROFILE = {
    "name": "Ton nom",
    "headline": "ex: AI Engineer avec expérience en systèmes de trading algorithmique",
    "top_skills": [
        "Python", "Machine Learning", "Pine Script", "MQL5",
        # ajoute tes vrais mots-clés ici
    ],
    "highlights": [
        # 2-3 réalisations concrètes, une phrase chacune — ce qui rend TA candidature différente
        "Décris ici une réalisation concrète (projet, résultat chiffré si possible)",
    ],
    "email": "ton@email.com",
    "linkedin": "linkedin.com/in/toi",

    # ---- Ajouté pour apply/requirements.py — laisse vide ("") ce que tu n'as pas ----
    # Rempli une fois ici, réutilisé automatiquement sur toutes les offres qui le demandent.
    "github": "",              # ex: github.com/toi
    "portfolio": "",           # ex: toi.dev
    "desired_salary": "",      # ex: "55-70k EUR/an" — laisse vide si tu préfères ne rien donner par défaut
    "availability": "",        # ex: "Immédiate" ou "Préavis de 1 mois"
    "work_authorization": "",  # ex: "Citoyen marocain, besoin d'un visa de travail" — ta vraie situation
}
