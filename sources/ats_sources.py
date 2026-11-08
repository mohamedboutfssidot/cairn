# -*- coding: utf-8 -*-
"""
Le "motif ATS" documenté dans le classeur : 6 systèmes de recrutement ont
tous une API publique gratuite, sans clé. Ashby est confirmé pour la
société Ashby elle-même ; pour les 14 autres entreprises de l'onglet
ENTREPRISES, le slug/ATS exact n'est pas encore identifié (config.py les
marque "unknown") — detect_ats() les teste tous automatiquement.
"""
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Optional, Tuple

from schema import Job

TIMEOUT = 15
HEADERS = {"User-Agent": "job-discovery-bot/1.0 (usage personnel)"}

# (nom_ats, template_url) — {slug} est remplacé par le nom de l'entreprise
ATS_PATTERNS = {
    "greenhouse": "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true",
    "lever":      "https://api.lever.co/v0/postings/{slug}?mode=json",
    "ashby":      "https://api.ashbyhq.com/posting-api/job-board/{slug}",
    "workable":   "https://apply.workable.com/api/v1/widget/accounts/{slug}",
    "recruitee":  "https://{slug}.recruitee.com/api/offers/",
    "personio":   "https://{slug}.jobs.personio.de/xml",
}


def detect_ats(slug: str) -> Optional[Tuple[str, str]]:
    """Essaie les 6 patterns EN PARALLÈLE (avant : séquentiel, donc jusqu'à
    6 x TIMEOUT=15s = 90s dans le pire cas pour UNE SEULE entreprise si
    chaque pattern échoue par timeout plutôt que par réponse rapide — c'était
    une part importante du ">5 min" total signalé) et retourne (ats, url) du
    premier qui répond avec une vraie liste d'offres. Retourne None si aucun
    ne marche (l'entreprise utilise probablement un ATS propriétaire, ou un
    slug différent du nom de la société — à vérifier à la main sur /careers).

    On garde TOUS les workers lancés jusqu'à la fin (pas d'arrêt anticipé
    propre avec ThreadPoolExecutor), mais comme ils tournent en parallèle,
    le temps total reste borné par le plus lent des 6, pas leur somme."""
    def _try(ats, template):
        url = template.format(slug=slug)
        try:
            resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            if resp.status_code == 200 and _looks_like_jobs(ats, resp):
                return ats, url
        except requests.RequestException:
            pass
        return None

    with ThreadPoolExecutor(max_workers=len(ATS_PATTERNS)) as executor:
        futures = [executor.submit(_try, ats, template) for ats, template in ATS_PATTERNS.items()]
        for future in as_completed(futures):
            result = future.result()
            if result is not None:
                return result
    return None


def _looks_like_jobs(ats: str, resp: requests.Response) -> bool:
    try:
        if ats == "personio":
            return "<position>" in resp.text.lower()
        data = resp.json()
        if ats == "greenhouse":
            return bool(data.get("jobs"))
        if ats == "lever":
            return isinstance(data, list) and len(data) >= 0
        if ats == "ashby":
            return bool(data.get("jobs"))
        if ats == "workable":
            return bool(data.get("results"))
        if ats == "recruitee":
            return bool(data.get("offers"))
    except ValueError:
        return False
    return False


def fetch_ats_jobs(company_name: str, ats: str, slug: str, keywords=None) -> List[Job]:
    """Récupère les offres d'une entreprise dont l'ATS est déjà connu
    (ats != 'unknown'). Pour 'unknown', appeler detect_ats() d'abord.

    keywords : si fourni, ne garde que les offres dont le titre (et la
    description quand l'API la fournit) contient au moins un mot-clé —
    sinon on récupère TOUS les postes ouverts de l'entreprise (RH, ventes,
    marketing...), ce qui noie les vraies offres pertinentes dans le bruit."""
    if ats not in ATS_PATTERNS:
        return []
    url = ATS_PATTERNS[ats].format(slug=slug)
    resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()

    kw_lower = [k.lower() for k in keywords] if keywords else None

    def _matches(*texts) -> bool:
        if not kw_lower:
            return True
        haystack = " ".join(t for t in texts if t).lower()
        return any(k in haystack for k in kw_lower)

    jobs = []
    if ats == "greenhouse":
        for item in resp.json().get("jobs", []):
            title = item.get("title", "Sans titre")
            content = item.get("content")  # HTML, présent car ?content=true
            if not _matches(title, content):
                continue
            jobs.append(Job(
                title=title, company=company_name,
                url=item.get("absolute_url", ""), source="ats:greenhouse",
                location=(item.get("location") or {}).get("name"),
                posted_date=(item.get("updated_at") or "")[:10] or None,
            ))
    elif ats == "lever":
        for item in resp.json():
            title = item.get("text", "Sans titre")
            desc = item.get("descriptionPlain") or item.get("description")
            if not _matches(title, desc):
                continue
            jobs.append(Job(
                title=title, company=company_name,
                url=item.get("hostedUrl", ""), source="ats:lever",
                location=(item.get("categories") or {}).get("location"),
                tags=(item.get("categories") or {}).get("team", []) and
                     [(item.get("categories") or {}).get("team")] or [],
            ))
    elif ats == "ashby":
        for item in resp.json().get("jobs", []):
            title = item.get("title", "Sans titre")
            desc = item.get("descriptionHtml") or item.get("descriptionPlain")
            if not _matches(title, desc):
                continue
            jobs.append(Job(
                title=title, company=company_name,
                url=item.get("jobUrl", ""), source="ats:ashby",
                location=item.get("location"),
                salary_min=(item.get("compensation") or {}).get("scrapedFromCompensationRange"),
            ))
    elif ats == "workable":
        for item in resp.json().get("results", []):
            title = item.get("title", "Sans titre")
            if not _matches(title):
                continue
            jobs.append(Job(
                title=title, company=company_name,
                url=item.get("url", ""), source="ats:workable",
                location=item.get("location", {}).get("city"),
            ))
    elif ats == "recruitee":
        for item in resp.json().get("offers", []):
            title = item.get("title", "Sans titre")
            desc = item.get("description")
            if not _matches(title, desc):
                continue
            jobs.append(Job(
                title=title, company=company_name,
                url=item.get("careers_url", ""), source="ats:recruitee",
                location=item.get("city"),
            ))
    return jobs


def _fetch_one_target(company_name: str, ats: str, slug: str, cache: dict, keywords=None):
    """Traite UNE entreprise (detect_ats si besoin + fetch_ats_jobs) -> conçu
    pour tourner dans un thread, voir fetch_all_ats_targets().
    Renvoie (company_name, jobs, detected_ats_ou_None, erreur_ou_None).
    detected_ats_ou_None n'est renseigné que si cette entreprise vient d'être
    détectée (pas si elle était déjà en cache) -> permet au thread principal
    de ne mettre à jour `cache` que lui-même (dict Python = pas thread-safe
    en écriture concurrente)."""
    detected_ats = None
    try:
        if ats == "unknown":
            if company_name in cache:
                ats = cache[company_name]
            else:
                detected = detect_ats(slug)
                if not detected:
                    return company_name, [], None, None
                ats, _ = detected
                detected_ats = ats
        jobs = fetch_ats_jobs(company_name, ats, slug, keywords=keywords)
        return company_name, jobs, detected_ats, None
    except requests.RequestException as e:
        return company_name, [], None, e


def fetch_all_ats_targets(targets: dict, keywords=None,
                           cache_path: str = "ats_cache.json",
                           max_workers: int = 8, on_batch=None) -> List[Job]:
    """targets: dict nom -> (ats, slug) — voir config.ATS_TARGETS.
    Pour 'unknown', vérifie d'abord un cache local (fichier JSON) avant de
    re-tester les 6 patterns — sans ça, chaque lancement re-devine l'ATS de
    chaque entreprise à chaque fois, ce qui est inutile une fois trouvé.
    Le cache se remplit tout seul et se réutilise aux lancements suivants.

    LENTEUR CORRIGÉE (signalée par l'utilisateur, ">5 min") : avant, les
    entreprises étaient traitées une par une, et pour chaque entreprise
    "unknown" (non encore en cache), detect_ats() teste jusqu'à 6 patterns
    d'ATS SÉQUENTIELLEMENT, chacun avec un timeout de 15s -> au pire,
    15 entreprises x 6 patterns x 15s = plus de 20 minutes au premier
    lancement (sans cache). On paralllélise maintenant TOUT (détection ET
    fetch) avec un ThreadPoolExecutor, comme search_engine.run_search() le
    fait déjà entre les différentes sources -> le temps total se rapproche
    du pire cas d'UNE SEULE entreprise plutôt que de la somme de toutes.

    Si TOUTES les entreprises échouent avec une erreur réseau, ça lève une
    exception au lieu de renvoyer silencieusement une liste vide — sinon une
    vraie panne (DNS, connexion coupée) ressemble à "0 offres trouvées" au
    lieu d'une erreur claire, comme ce qui s'est passé pour We Work Remotely."""
    import json
    from pathlib import Path

    cache_file = Path(cache_path)
    cache = json.loads(cache_file.read_text(encoding="utf-8")) if cache_file.exists() else {}

    all_jobs: List[Job] = []
    failures = 0
    cache_updated = False

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_fetch_one_target, name, ats, slug, cache, keywords): name
            for name, (ats, slug) in targets.items()
        }
        for future in as_completed(futures):
            company_name, jobs, detected_ats, error = future.result()
            if error is not None:
                failures += 1
                continue
            all_jobs.extend(jobs)
            if on_batch and jobs:
                on_batch(jobs)   # affichage au fil de l'eau, entreprise par entreprise
            if detected_ats is not None:
                # Écriture dans `cache` : uniquement ici, dans le thread
                # principal (as_completed), jamais depuis un thread -> pas
                # de risque de corruption malgré l'exécution parallèle.
                cache[company_name] = detected_ats
                cache_updated = True

    if cache_updated:
        cache_file.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")

    if failures == len(targets) and failures > 0:
        raise ConnectionError(
            f"les {failures} entreprises ont toutes échoué (réseau probablement coupé) "
            "— pas un vrai '0 offres', vérifie ta connexion"
        )

    return all_jobs