# -*- coding: utf-8 -*-
"""
JobSpy est l'outil open source que la plupart des gens utilisent pour les
sites sans API publique (LinkedIn, Indeed, Glassdoor, ZipRecruiter, Naukri,
Bayt...). Il ne "contourne" rien de magique : il lit les mêmes pages que ton
navigateur, donc reste raisonnable sur le volume/fréquence pour éviter tout
blocage (voir la mise en garde sur la vitesse de requêtes, déjà discutée
pour les outils d'auto-candidature).
"""
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, List, Optional

import pandas as pd

import config
from schema import Job


# Cache mémoire (vit autant que le serveur) : clé = paramètres de la requête.
_CACHE: dict = {}
_CACHE_LOCK = threading.Lock()


def _cache_get(key):
    ttl = config.JOBSPY_CACHE_MINUTES * 60
    if ttl <= 0:
        return None
    with _CACHE_LOCK:
        hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    return None


def _cache_put(key, jobs):
    if config.JOBSPY_CACHE_MINUTES > 0 and jobs:
        with _CACHE_LOCK:
            _CACHE[key] = (time.time(), jobs)


def fetch_jobspy(search_term: str, location: str, sites: list,
                  results_per_site: int = 30, hours_old: int = 168,
                  linkedin_fetch_description: bool = False,
                  country_indeed: str = None, is_remote: bool = True,
                  on_batch: Optional[Callable[[List[Job]], None]] = None) -> List[Job]:
    """Un appel séparé PAR site, chacun protégé — sinon un seul site qui
    plante (ex. Glassdoor : problème DNS/TLS ponctuel) fait perdre les
    résultats des autres. Les sites tournent EN PARALLÈLE (avant : l'un après
    l'autre) et chaque site envoie ses offres dès qu'il a fini (on_batch).

    linkedin_fetch_description : sans ça, LinkedIn renvoie titre/entreprise
    seulement — pas de description. Coûte une requête de plus par offre.

    country_indeed : Indeed et Glassdoor en ont besoin (en plus de `location`)
    pour filtrer par pays. Nom exact de la liste JobSpy ("USA", "UK", "France"
    — PAS "United States").

    is_remote : True = offres remote seulement (comportement d'origine).
    Mode "par pays" : False pour garder aussi les offres sur site/hybrides."""
    try:
        import jobspy  # noqa: F401
    except ImportError as e:
        raise ImportError("pip install python-jobspy") from e

    jobs: List[Job] = []
    if not sites:
        return jobs
    with ThreadPoolExecutor(max_workers=len(sites)) as pool:
        futures = [
            pool.submit(_scrape_site, search_term, location, site, results_per_site, hours_old,
                        linkedin_fetch_description, country_indeed, is_remote)
            for site in sites
        ]
        for fut in as_completed(futures):
            batch = fut.result()
            jobs.extend(batch)
            if on_batch and batch:
                on_batch(batch)
    return jobs


def _scrape_site_raw(search_term, location, site, results_per_site, hours_old,
                      linkedin_fetch_description, country_indeed, is_remote) -> List[Job]:
    """UNE requête JobSpy (un site, un titre). Lève en cas d'échec : l'appelant
    décide (disjoncteur). Utilise le cache mémoire."""
    from jobspy import scrape_jobs
    key = (search_term, location, site, results_per_site, hours_old, country_indeed, is_remote)
    cached = _cache_get(key)
    if cached is not None:
        return list(cached)

    kwargs = dict(
        site_name=[site],
        search_term=search_term,
        location=location,
        results_wanted=results_per_site,
        hours_old=hours_old,
    )
    if is_remote:
        kwargs["is_remote"] = True
    if site in ("indeed", "glassdoor") and country_indeed:
        kwargs["country_indeed"] = country_indeed
    if site == "linkedin" and linkedin_fetch_description:
        kwargs["linkedin_fetch_description"] = True
    df = scrape_jobs(**kwargs)

    jobs = []
    for _, row in df.iterrows():
        jobs.append(Job(
            title=row.get("title", "Sans titre"),
            company=row.get("company", "?"),
            url=row.get("job_url", ""),
            source=f"jobspy:{row.get('site', site)}",
            location=row.get("location"),
            remote=bool(row.get("is_remote")) if row.get("is_remote") is not None else None,
            # row vient d'un DataFrame pandas : une valeur manquante est un
            # float('nan'), "truthy" en Python -> on utilise pd.notna().
            posted_date=str(row.get("date_posted")) if pd.notna(row.get("date_posted")) else None,
            description=row.get("description") if pd.notna(row.get("description")) else None,
            salary_min=row.get("min_amount") if pd.notna(row.get("min_amount")) else None,
            salary_max=row.get("max_amount") if pd.notna(row.get("max_amount")) else None,
            salary_currency=row.get("currency") if pd.notna(row.get("currency")) else None,
        ))
    _cache_put(key, jobs)
    return jobs


def _scrape_site(search_term, location, site, results_per_site, hours_old,
                  linkedin_fetch_description, country_indeed, is_remote) -> List[Job]:
    """Version protégée : une panne ne fait jamais perdre les autres sites."""
    try:
        return _scrape_site_raw(search_term, location, site, results_per_site, hours_old,
                                 linkedin_fetch_description, country_indeed, is_remote)
    except Exception as e:
        print(f"\n    [JobSpy:{site}:{search_term}] échec, ignoré : {type(e).__name__}: {e}", end="")
        return []


def sites_for_country(sites, country_indeed):
    """Retire les sites qui ne couvrent pas le pays (requêtes inutiles) :
    ZipRecruiter = USA/Canada seulement ; Naukri = Inde seulement."""
    c = (country_indeed or "").strip().lower()
    out = []
    for s_ in sites:
        if s_ == "zip_recruiter" and c not in ("usa", "canada", ""):
            continue
        if s_ == "naukri" and c not in ("india", ""):
            continue
        out.append(s_)
    return out


def fetch_jobspy_country(terms, location, sites, results_per_query, hours_old,
                          country_indeed=None, linkedin_fetch_description=False,
                          max_workers=3, max_terms=8,
                          on_batch: Optional[Callable[[List[Job]], None]] = None) -> List[Job]:
    """Mode "par pays" : une requête par couple (titre x site), sur sites ET
    offres sur site/hybrides (pas de filtre remote).

    VITESSE :
    - une file de requêtes PAR SITE, toutes en parallèle (concurrence propre à
      chaque site : config.JOBSPY_SITE_WORKERS) ;
    - les offres sont envoyées (on_batch) dès qu'UNE requête finit -> l'app
      affiche les premières offres en quelques secondes, pas à la toute fin ;
    - disjoncteur : après config.JOBSPY_SITE_MAX_FAILS échecs d'affilée sur un
      site, ses requêtes restantes sont ignorées (blocage/429) ;
    - cache mémoire : relancer une recherche identique est quasi instantané.
    `max_workers` n'est plus utilisé (gardé pour compatibilité)."""
    terms = [t for t in dict.fromkeys(terms or []) if t][:max_terms]
    sites = sites_for_country(sites, country_indeed)
    if not terms or not sites:
        return []

    fails = {s_: 0 for s_ in sites}
    lock = threading.Lock()

    def task(term, site):
        with lock:
            if fails[site] >= config.JOBSPY_SITE_MAX_FAILS:
                return []          # disjoncteur ouvert pour ce site
        n = config.JOBSPY_COUNTRY_RESULTS_BY_SITE.get(site, results_per_query)
        try:
            batch = _scrape_site_raw(term, location, site, n, hours_old,
                                      linkedin_fetch_description, country_indeed, False)
        except Exception as e:
            with lock:
                fails[site] += 1
                opened = fails[site] == config.JOBSPY_SITE_MAX_FAILS
            print(f"\n    [JobSpy:{site}:{term}] échec ({type(e).__name__})"
                  + (f" — {site} mis en pause pour cette recherche" if opened else ""), end="")
            return []
        with lock:
            fails[site] = 0
        return batch

    jobs, seen = [], set()
    pools = {s_: ThreadPoolExecutor(max_workers=config.JOBSPY_SITE_WORKERS.get(s_, 2)) for s_ in sites}
    try:
        futures = [pools[s_].submit(task, t, s_) for t in terms for s_ in sites]
        for fut in as_completed(futures):
            fresh = []
            for j in fut.result():
                key = j.url or f"{j.title}|{j.company}"
                if key in seen:
                    continue
                seen.add(key)
                fresh.append(j)
            jobs.extend(fresh)
            if on_batch and fresh:
                on_batch(fresh)
    finally:
        for p_ in pools.values():
            p_.shutdown(wait=False, cancel_futures=True)
    return jobs