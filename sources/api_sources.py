# -*- coding: utf-8 -*-
"""
Les 4 sources avec une vraie API/flux public gratuit, confirmées dans le
classeur (onglet "APIs & Endpoints"). Chaque fonction retourne une liste de
schema.Job. Chaque fonction est indépendante et protégée par try/except dans
discover.py : si une seule tombe en panne (site down, format changé), les
autres continuent.
"""
import requests
import feedparser
from datetime import datetime
from typing import List

from schema import Job

TIMEOUT = 20
HEADERS = {"User-Agent": "job-discovery-bot/1.0 (usage personnel)"}


def fetch_remoteok(keywords) -> List[Job]:
    """https://remoteok.com/api — gratuit, sans clé. Le 1er élément du JSON
    est une notice légale, pas une offre : on le saute."""
    resp = requests.get("https://remoteok.com/api", headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    jobs = []
    for item in data:
        if not isinstance(item, dict) or "id" not in item:
            continue  # notice légale ou entrée invalide
        text = f"{item.get('position', '')} {item.get('description', '')}".lower()
        if keywords and not any(k.lower() in text for k in keywords):
            continue
        jobs.append(Job(
            title=item.get("position", "Sans titre"),
            company=item.get("company", "?"),
            url=item.get("url") or item.get("apply_url") or f"https://remoteok.com/l/{item.get('id')}",
            source="remoteok",
            location=item.get("location") or "Remote",
            remote=True,
            posted_date=_epoch_to_iso(item.get("epoch")),
            description=item.get("description"),
            salary_min=item.get("salary_min"),
            salary_max=item.get("salary_max"),
            tags=item.get("tags", []) or [],
            logo_url=item.get("company_logo") or None,
        ))
    return jobs


def fetch_remotive(keywords) -> List[Job]:
    """https://remotive.com/api/remote-jobs?search=... — gratuit, sans clé."""
    jobs = []
    for kw in keywords:
        resp = requests.get(
            "https://remotive.com/api/remote-jobs",
            params={"search": kw},
            headers=HEADERS, timeout=TIMEOUT,
        )
        resp.raise_for_status()
        for item in resp.json().get("jobs", []):
            jobs.append(Job(
                title=item.get("title", "Sans titre"),
                company=item.get("company_name", "?"),
                url=item.get("url", ""),
                source="remotive",
                location=item.get("candidate_required_location") or "Remote",
                remote=True,
                posted_date=(item.get("publication_date") or "")[:10] or None,
                description=item.get("description"),
                salary_min=None, salary_max=None,
                tags=item.get("tags", []) or [],
                logo_url=item.get("company_logo_url") or None,
            ))
    return _dedup_local(jobs)


def fetch_wwr(category_slug="remote-programming-jobs") -> List[Job]:
    """https://weworkremotely.com/categories/<slug>.rss — flux officiel gratuit.
    Pas de filtre mot-clé côté serveur : on filtre nous-mêmes sur le titre.

    feedparser ne lève JAMAIS d'exception réseau : en cas d'échec (DNS, site
    down, flux invalide), il renvoie juste un objet avec .entries vide. On
    doit donc vérifier .bozo (= "quelque chose s'est mal passé") nous-mêmes,
    sinon une vraie panne ressemble à "0 offres" au lieu d'une erreur claire."""
    feed_url = f"https://weworkremotely.com/categories/{category_slug}.rss"
    feed = feedparser.parse(feed_url)

    if getattr(feed, "bozo", 0) and not feed.entries:
        reason = getattr(feed, "bozo_exception", "raison inconnue")
        raise ConnectionError(f"flux RSS WWR illisible ou inaccessible ({reason})")
    if not feed.entries:
        raise ConnectionError(
            "flux RSS WWR lu mais vide — le slug de catégorie a peut-être changé "
            f"(vérifier manuellement {feed_url})"
        )

    jobs = []
    for entry in feed.entries:
        # Le titre WWR est généralement "Entreprise: Poste"
        title = entry.get("title", "Sans titre")
        company, _, role = title.partition(":")
        jobs.append(Job(
            title=(role or title).strip(),
            company=company.strip() if role else "?",
            url=entry.get("link", ""),
            source="wwr",
            location="Remote",
            remote=True,
            posted_date=_struct_to_iso(entry.get("published_parsed")),
            description=entry.get("summary"),
            tags=[],
        ))
    return jobs


def fetch_himalayas(keywords) -> List[Job]:
    """https://himalayas.app/jobs/api/search?keyword=... — gratuit, sans clé."""
    jobs = []
    for kw in keywords:
        resp = requests.get(
            "https://himalayas.app/jobs/api/search",
            params={"keyword": kw},
            headers=HEADERS, timeout=TIMEOUT,
        )
        resp.raise_for_status()
        payload = resp.json()
        for item in payload.get("jobs", payload if isinstance(payload, list) else []):
            jobs.append(Job(
                title=item.get("title", "Sans titre"),
                company=(item.get("companyName") or item.get("company") or "?"),
                url=item.get("applicationLink") or item.get("guid") or "",
                source="himalayas",
                location=", ".join(item.get("locationRestrictions", []) or []) or "Remote",
                remote=True,
                posted_date=_epoch_to_iso(item.get("pubDate")) or None,
                description=item.get("excerpt"),
                salary_min=item.get("minSalary"),
                salary_max=item.get("maxSalary"),
                tags=item.get("categories", []) or [],
            ))
    return _dedup_local(jobs)


# ---- utilitaires internes ----

def _epoch_to_iso(value):
    if not value:
        return None
    try:
        return datetime.utcfromtimestamp(int(value)).date().isoformat()
    except (ValueError, TypeError):
        return None


def _struct_to_iso(struct_time):
    if not struct_time:
        return None
    try:
        return datetime(*struct_time[:6]).date().isoformat()
    except (ValueError, TypeError):
        return None


def _dedup_local(jobs: List[Job]) -> List[Job]:
    seen, out = set(), []
    for j in jobs:
        k = j.dedup_key()
        if k not in seen:
            seen.add(k)
            out.append(j)
    return out
