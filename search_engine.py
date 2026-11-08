# -*- coding: utf-8 -*-
"""
Moteur de recherche partagé entre discover.py (CLI) et server.py (app web).

Les sources tournent en PARALLÈLE (ThreadPoolExecutor) au lieu de
séquentiellement — elles font toutes des I/O réseau (requests, JobSpy),
donc les threads se chevauchent efficacement malgré le GIL Python.

Chaque source est décrite dans SOURCE_REGISTRY : un id stable, un libellé
affichable, et une fonction qui l'exécute. run_search() accepte un callback
appelé à chaque étape (source démarrée / terminée / échouée) — c'est ce que
server.py utilise pour pousser la progression en direct vers l'app (SSE), et
que discover.py utilise pour afficher les mêmes lignes qu'avant dans le
terminal, afin que les deux restent cohérents.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Callable, List, Optional

import config
from schema import Job
from sources import api_sources, ats_sources, dataset_sources, jobspy_source


@dataclass
class SourceResult:
    source_id: str
    label: str
    status: str          # "running" | "done" | "error"
    jobs: List[Job]
    error: Optional[str] = None
    streamed: bool = False   # True : offres déjà enregistrées par lots (on_batch)


def _make_sources(keywords: List[str], sites: Optional[List[str]] = None,
                   location: Optional[str] = None, jobicy_geo: Optional[str] = None,
                   country_indeed: Optional[str] = None):
    """Construit la liste des sources à exécuter pour cette recherche.
    `keywords` et `sites` (JobSpy) sont paramétrables -> permet le mode
    "mots-clés personnalisés" demandé, sans dupliquer tout le registre.

    Mode "par pays" (location/jobicy_geo/country_indeed fournis) : demande
    explicite de l'utilisateur -> les résultats doivent montrer le REMOTE
    *et* les offres ciblées sur ce pays ensemble, jamais l'un à la place de
    l'autre. On ne remplace donc PAS la source JobSpy/Jobicy existante : on
    ajoute deux sources supplémentaires ("jobspy_country", "jobicy_country")
    qui tournent en plus, avec leurs propres filtres pays — "jobspy" et
    "jobicy" restent toujours en remote strict, comme le mode par défaut.
    Les deux versions tournent en parallèle comme toutes les autres sources,
    et leurs résultats se mélangent/dédupliquent normalement en aval.

    `location` : lieu JobSpy pour la variante "pays" uniquement.
    `jobicy_geo` : slug de la taxonomie Jobicy (ex. "usa", "france") pour la
    variante "pays" de Jobicy -> transmis tel quel à fetch_jobicy_api(), car
    Jobicy attend un slug précis et PAS un texte libre comme "United
    States" (`location`).
    `country_indeed` : nom de pays exact attendu par JobSpy pour Indeed et
    Glassdoor (liste fermée différente de `location`/`jobicy_geo` — voir
    jobspy_source.fetch_jobspy). Sans lui, ces deux sites ne filtraient pas
    vraiment par pays malgré `location`."""
    jobspy_sites = sites if sites is not None else config.JOBSPY_SITES
    jobspy_term = f"{keywords[0]} remote" if keywords else config.JOBSPY_SEARCH_TERM
    jobspy_term_country = f"{keywords[0]}" if keywords else config.JOBSPY_SEARCH_TERM

    sources = [
        {
            "id": "remoteok",
            "label": "RemoteOK",
            "fn": lambda: api_sources.fetch_remoteok(keywords),
        },
        {
            "id": "remotive",
            "label": "Remotive",
            "fn": lambda: api_sources.fetch_remotive(keywords),
        },
        {
            "id": "wwr",
            "label": "We Work Remotely",
            "fn": lambda: api_sources.fetch_wwr(),
        },
        {
            "id": "himalayas",
            "label": "Himalayas",
            "fn": lambda: api_sources.fetch_himalayas(keywords),
        },
        {
            "id": "ats",
            "label": "ATS entreprises (Greenhouse/Lever/Ashby/...)",
            "fn": lambda: ats_sources.fetch_all_ats_targets(
                config.ATS_TARGETS, keywords=keywords, max_workers=config.ATS_MAX_WORKERS
            ),
        },
        {
            "id": "jobicy",
            "label": "Jobicy (API live, remote)",
            "fn": lambda: dataset_sources.fetch_jobicy_api(keywords),
            "enabled": config.JOBICY_API_ENABLED,
        },
        *[
            {
                "id": f"hf:{ds_name.split('/')[0]}",
                "label": f"Dataset HF: {ds_name}",
                "fn": lambda ds=ds_name: dataset_sources.fetch_hf_dataset(
                    ds, keywords, recent_days=config.HF_DATASETS_RECENT_DAYS
                ),
                "enabled": config.HF_DATASETS_ENABLED,
            }
            for ds_name in config.HF_DATASETS
        ],
        {
            "id": "jobspy",
            "label": "JobSpy (LinkedIn/Indeed/Glassdoor/..., remote)",
            "fn": lambda: jobspy_source.fetch_jobspy(
                jobspy_term, config.JOBSPY_LOCATION, jobspy_sites,
                config.JOBSPY_RESULTS_PER_SITE, config.JOBSPY_HOURS_OLD,
                linkedin_fetch_description=config.JOBSPY_LINKEDIN_FETCH_DESCRIPTION,
                is_remote=True,
            ),
        },
    ]

    # Sources additionnelles "par pays" : ajoutées EN PLUS des sources remote
    # ci-dessus, jamais à leur place -> les résultats contiennent les deux.
    if location or jobicy_geo or country_indeed:
        sources.append({
            "id": "jobspy_country",
            "label": f"JobSpy (LinkedIn/Indeed/Glassdoor/..., {location or 'pays choisi'})",
            "fn": lambda: jobspy_source.fetch_jobspy(
                jobspy_term_country, location or config.JOBSPY_LOCATION, jobspy_sites,
                config.JOBSPY_RESULTS_PER_SITE, config.JOBSPY_HOURS_OLD,
                linkedin_fetch_description=config.JOBSPY_LINKEDIN_FETCH_DESCRIPTION,
                country_indeed=country_indeed, is_remote=False,
            ),
        })
        if config.JOBICY_API_ENABLED and jobicy_geo:
            sources.append({
                "id": "jobicy_country",
                "label": f"Jobicy (API live, {location or 'pays choisi'})",
                "fn": lambda: dataset_sources.fetch_jobicy_api(keywords, geo=jobicy_geo),
            })

    return sources


# Deux modes de recherche : « rapide » = API publiques + ATS + Jobicy + JobSpy (LinkedIn, Indeed...) ;
# « approfondie » = datasets HF (le plus lent). None = tout.
FAST_SOURCE_IDS = {"remoteok", "remotive", "wwr", "himalayas", "ats", "jobicy", "jobicy_country", "jobspy", "jobspy_country"}


def source_mode(source_id: str) -> str:
    return "fast" if source_id in FAST_SOURCE_IDS else "deep"


def run_search(
    keywords: Optional[List[str]] = None,
    sites: Optional[List[str]] = None,
    source_ids: Optional[List[str]] = None,
    location: Optional[str] = None,
    jobicy_geo: Optional[str] = None,
    country_indeed: Optional[str] = None,
    on_event: Optional[Callable[[SourceResult], None]] = None,
    max_workers: int = 8,
    mode: Optional[str] = None,
    on_batch: Optional[Callable] = None,   # accepté pour compatibilité avec server.py (non utilisé ici)
) -> List[Job]:
    """Lance toutes les sources en parallèle et renvoie la liste complète des
    offres (non dédupliquées -> à passer à discover.dedup() ensuite).

    keywords       : mots-clés custom, ou config.SEARCH_KEYWORDS si None/vide
                     (mode "recherche par défaut" vs "mots-clés personnalisés")
    sites          : sites JobSpy à utiliser (sous-ensemble de config.JOBSPY_SITES),
                     ou tous si None (= "choix des sources par case à cocher")
    source_ids     : limite l'exécution à ces sources (par id), ou toutes si None
    location       : lieu JobSpy custom (mode "recherche par pays") -> remplace
                     config.JOBSPY_LOCATION ("Remote") si fourni. Désactive
                     aussi le filtre is_remote strict (voir _make_sources).
    jobicy_geo     : slug de pays Jobicy (mode "recherche par pays") -> filtre
                     aussi Jobicy nativement via son paramètre `geo`.
    country_indeed : nom de pays exact attendu par Indeed/Glassdoor via JobSpy
                     (mode "recherche par pays") -> sans lui, ces deux sites
                     ne filtraient pas réellement par pays malgré `location`.
                     Les autres sources (RemoteOK, Remotive, Himalayas, ATS,
                     dataset HF...) restent filtrées par `keywords`
                     uniquement, car elles n'exposent pas de paramètre
                     "lieu"/pays exploitable côté API — c'est une limite
                     réelle de ces API, pas un oubli : impossible de filtrer
                     par pays ce qu'une API ne permet pas de filtrer par pays.
    mode           : "fast" (API + ATS + Jobicy), "deep" (JobSpy + datasets HF)
                     ou None/"all" (toutes les sources)
    on_event       : appelé avec un SourceResult à chaque "running"/"done"/"error"
                     -> c'est le point d'accroche pour la progression en direct
    """
    kw = keywords if keywords else config.SEARCH_KEYWORDS
    sources = _make_sources(kw, sites=sites, location=location, jobicy_geo=jobicy_geo,
                             country_indeed=country_indeed)
    sources = [s for s in sources if s.get("enabled", True)]
    if source_ids is not None:
        # "jobspy_country"/"jobicy_country" n'existent que lorsqu'un pays est
        # choisi -> absentes de la liste de sources que le frontend propose à
        # cocher (construite sans pays via list_available_sources()), donc
        # jamais dans `source_ids`. On les laisse passer malgré tout dès
        # qu'elles sont générées ici, sinon le mode "par pays" perdrait
        # silencieusement son volet géo-ciblé dès qu'une seule source est
        # décochée dans l'UI (source_ids devient alors une liste restreinte
        # qui ne les contient pas).
        wanted = set(source_ids) | {"jobspy_country", "jobicy_country"}
        sources = [s for s in sources if s["id"] in wanted]

    if mode in ("fast", "deep"):
        sources = [s for s in sources if source_mode(s["id"]) == mode]

    all_jobs: List[Job] = []

    def _emit(result: SourceResult):
        if on_event:
            on_event(result)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_source = {}
        for s in sources:
            _emit(SourceResult(s["id"], s["label"], "running", []))
            future = executor.submit(s["fn"])
            future_to_source[future] = s

        for future in as_completed(future_to_source):
            s = future_to_source[future]
            try:
                jobs = future.result()
                all_jobs.extend(jobs)
                _emit(SourceResult(s["id"], s["label"], "done", jobs))
            except Exception as e:  # une source cassée ne doit jamais arrêter les autres
                _emit(SourceResult(s["id"], s["label"], "error", [], error=f"{type(e).__name__}: {e}"))

    return all_jobs


def list_available_sources() -> List[dict]:
    """Pour l'UI : liste des sources disponibles (id + label), sans les
    exécuter — sert à construire les cases à cocher de sélection de sources."""
    sources = _make_sources(config.SEARCH_KEYWORDS)
    return [
        {"id": s["id"], "label": s["label"], "mode": source_mode(s["id"])}
        for s in sources
        if s.get("enabled", True)
    ]