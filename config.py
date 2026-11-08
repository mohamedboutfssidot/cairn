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
JOBSPY_LINKEDIN_FETCH_DESCRIPTION = True  # requête supplémentaire par offre LinkedIn,
                                            # nécessaire sinon description/tags restent vides

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

# Nombre d'entreprises ATS traitées EN PARALLÈLE (détection de l'ATS + lecture
# des offres). Avant, tout tournait séquentiellement (une entreprise après
# l'autre, et pour chacune jusqu'à 6 patterns d'ATS testés un par un aussi)
# -> gros contributeur au ">5 min" signalé par l'utilisateur. Augmente cette
# valeur si tu as beaucoup d'entreprises dans ATS_TARGETS et une bonne
# connexion ; diminue-la si tu vois des erreurs de connexion dues à trop de
# requêtes simultanées.
ATS_MAX_WORKERS = 8

# Datasets Hugging Face à interroger (voir dataset_sources.py)
# Mets HF_DATASETS_ENABLED = False si ta connexion à huggingface.co continue
# de timeout/couper — les 4 API + le motif ATS suffisent largement en volume.
HF_DATASETS_ENABLED = True

# Jobicy a une vraie API REST live (https://jobicy.com/api/v2/remote-jobs),
# gratuite et sans clé — confirmée par la doc officielle jobicy.com. C'est
# strictement meilleur que lire les fichiers HF (toujours à jour, alors que
# le dataset HF n'est qu'un instantané quotidien), donc on l'utilise à la
# place de l'ancienne fetch_jobicy_direct() qui lisait des fichiers Hugging
# Face. Mets JOBICY_API_ENABLED = False pour la désactiver séparément.
JOBICY_API_ENABLED = True

# edwarddgao/open-apply-jobs reste en Parquet -> passe par fetch_hf_dataset()
# (la lib `datasets` est nécessaire pour lire du Parquet, pas de raccourci ici)
HF_DATASETS = [
    "edwarddgao/open-apply-jobs",
]

# edwarddgao/open-apply-jobs est partitionné par date (data/date=YYYY-MM-DD/...)
# et mis à jour chaque jour côté HF. fetch_hf_dataset() cible maintenant en
# priorité les HF_DATASETS_RECENT_DAYS derniers jours (via l'API de listing
# HF) au lieu de scanner le dataset depuis son tout début -> offres fraîches
# garanties, plutôt que dépendantes d'une limite de lignes scannées qui finissait
# par s'épuiser avant d'atteindre les partitions récentes (c'était la cause
# des offres "vieilles de 5 mois" remontées par l'utilisateur, pas un dataset
# à l'abandon). Cette valeur contrôle aussi directement la VITESSE de cette
# source : chaque jour = jusqu'à 7 fichiers Parquet (un par ATS) à énumérer
# et lire sur le réseau -> remonte-la si tu veux voir plus loin dans
# l'historique récent, au prix de plus de lenteur.
# Réduit de 14 à 7 (demande explicite : recherche totale prenait >5 min) ->
# moitié moins de fichiers Parquet à énumérer/lire pour cette seule source,
# tout en gardant une semaine complète d'offres fraîches (largement
# suffisant vu que cette source se met à jour chaque jour).
HF_DATASETS_RECENT_DAYS = 7

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

# --- Mode "recherche par pays" (JobSpy) ------------------------------------
# Avant : UNE requête par site, avec UN SEUL mot-clé, 40 résultats / 7 jours.
# Maintenant : une requête par couple (titre x site), en parallèle limitée.
JOBSPY_COUNTRY_RESULTS_PER_QUERY = 100   # résultats demandés par requête
JOBSPY_COUNTRY_HOURS_OLD = 720           # 30 jours (au lieu de 7)
JOBSPY_COUNTRY_MAX_TERMS = 100           # garde-fou technique seulement : le nombre de postes se règle dans l'app (page Recherche)
JOBSPY_COUNTRY_WORKERS = 3               # requêtes simultanées (baisse à 2 si LinkedIn bloque / 429)
# LinkedIn : une requête de plus PAR offre pour la description -> très lent
# sur des centaines d'offres. False = rapide (titre, entreprise, lieu, date).
JOBSPY_COUNTRY_LINKEDIN_FETCH_DESCRIPTION = False
# Dataset HF (edwarddgao) : offres du pays choisi (filtre sur le champ lieu).
HF_COUNTRY_MAX_MATCHES = 1500

# --- Vitesse de la recherche (JobSpy) --------------------------------------
# Chaque site a SA PROPRE file de requêtes, et les sites tournent en même
# temps : le temps total ~ celui du site le plus lent (avant : une seule file
# partagée de 3 requêtes à la fois pour tous les sites).
# LinkedIn limite vite (429) -> peu de requêtes simultanées ; Indeed supporte plus.
JOBSPY_SITE_WORKERS = {"linkedin": 2, "indeed": 3, "glassdoor": 2, "zip_recruiter": 2, "bayt": 2, "naukri": 2}
# Résultats demandés par requête, par site (défaut = JOBSPY_COUNTRY_RESULTS_PER_QUERY).
# LinkedIn pagine par ~25 offres : 50 = 2 pages au lieu de 4 (nettement plus rapide).
JOBSPY_COUNTRY_RESULTS_BY_SITE = {"linkedin": 50}
# Disjoncteur : après N échecs d'affilée sur un site (blocage/429), on arrête
# d'envoyer des requêtes à ce site pour cette recherche, au lieu d'attendre
# toutes les expirations. Les autres sites continuent.
JOBSPY_SITE_MAX_FAILS = 3
# Cache mémoire du serveur : relancer la même recherche (même titre, site, lieu)
# dans ce délai réutilise les résultats -> quasi instantané. 0 = désactivé.
JOBSPY_CACHE_MINUTES = 30