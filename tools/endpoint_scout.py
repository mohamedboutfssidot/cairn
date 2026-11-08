# -*- coding: utf-8 -*-
"""
Remplace l'étape manuelle "F12 -> Network -> chercher -> repérer la requête
JSON" par un script qui le fait automatiquement, site par site.

Ce n'est PAS magique : ça ne fonctionnera pas sur tous les sites (certains
n'ont vraiment aucun endpoint JSON, d'autres ont un champ de recherche que
le détecteur générique ne trouve pas). Le but est de réduire le travail
manuel de "66 sites à checker un par un" à "une poignée de candidats à
vérifier à la main".

Nécessite : pip install playwright && playwright install chromium
"""
import json
import time
from dataclasses import dataclass, field
from typing import List, Optional

# Mots qu'on s'attend à voir dans une VRAIE réponse d'offres d'emploi —
# sert à filtrer le bruit (JSON d'analytics, de config, de pub...) parmi
# toutes les requêtes JSON qu'un site charge.
JOB_SIGNAL_WORDS = [
    "title", "company", "location", "job", "position", "salary",
    "poste", "offre", "entreprise", "vacancy", "employer",
]

# Sélecteurs essayés dans l'ordre pour trouver un champ de recherche —
# couvre la plupart des sites, mais pas tous (certains ont une recherche
# cachée derrière un clic, ou un champ dans un iframe).
SEARCH_INPUT_SELECTORS = [
    'input[type="search"]',
    'input[placeholder*="search" i]',
    'input[placeholder*="job" i]',
    'input[placeholder*="recherche" i]',
    'input[placeholder*="emploi" i]',
    'input[name*="search" i]',
    'input[name="q"]',
]


@dataclass
class Candidate:
    url: str
    content_type: str
    size_bytes: int
    signal_words_found: List[str] = field(default_factory=list)

    @property
    def confidence(self) -> str:
        n = len(self.signal_words_found)
        if n >= 4:
            return "haute"
        if n >= 2:
            return "moyenne"
        return "faible"


@dataclass
class ScanResult:
    site: str
    url: str
    status: str  # "ok" | "erreur: ..."
    search_box_found: bool
    candidates: List[Candidate] = field(default_factory=list)


def scan_site(page, name: str, url: str, keyword: str = "AI Engineer",
              nav_timeout_ms: int = 15000) -> ScanResult:
    candidates: List[Candidate] = []
    search_box_found = False

    def on_response(response):
        try:
            ctype = response.headers.get("content-type", "")
            if "application/json" not in ctype or response.status != 200:
                return
            body = response.text()
            if len(body) < 30:  # trop petit pour être une liste d'offres
                return
            body_lower = body.lower()
            found = [w for w in JOB_SIGNAL_WORDS if w in body_lower]
            if found:
                candidates.append(Candidate(
                    url=response.url, content_type=ctype,
                    size_bytes=len(body), signal_words_found=found,
                ))
        except Exception:
            pass  # une réponse illisible ne doit pas planter le scan

    page.on("response", on_response)
    try:
        page.goto(url, timeout=nav_timeout_ms, wait_until="domcontentloaded")

        for sel in SEARCH_INPUT_SELECTORS:
            try:
                el = page.locator(sel).first
                if el.is_visible(timeout=1500):
                    el.click()
                    el.fill(keyword)
                    el.press("Enter")
                    search_box_found = True
                    page.wait_for_timeout(3500)  # laisse la recherche se charger
                    break
            except Exception:
                continue

        page.wait_for_timeout(2000)  # requêtes de fond en retard
        status = "ok"
    except Exception as e:
        status = f"erreur: {type(e).__name__}: {e}"
    finally:
        page.remove_listener("response", on_response)

    # dédoublonne par URL, garde le plus gros payload (souvent le plus complet)
    by_url = {}
    for c in candidates:
        if c.url not in by_url or c.size_bytes > by_url[c.url].size_bytes:
            by_url[c.url] = c

    return ScanResult(
        site=name, url=url, status=status,
        search_box_found=search_box_found,
        candidates=sorted(by_url.values(), key=lambda c: -len(c.signal_words_found)),
    )


def scan_all(sites, keyword: str = "AI Engineer", delay_between: float = 3.0):
    """sites: liste de (nom, url). Un navigateur, une page réutilisée pour
    tous les sites (plus léger), délai entre chaque pour rester poli."""
    from playwright.sync_api import sync_playwright

    results: List[ScanResult] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (compatible; endpoint-scout-personnel/1.0)"
        )
        page = context.new_page()
        for name, url in sites:
            print(f"→ {name}...", end=" ", flush=True)
            r = scan_site(page, name, url, keyword=keyword)
            n = len(r.candidates)
            if r.status != "ok":
                print(r.status)
            else:
                print(f"{n} candidat(s)" + (f" [{r.candidates[0].confidence}]" if n else ""))
            results.append(r)
            time.sleep(delay_between)
        browser.close()
    return results


def save_report(results: List[ScanResult], path: str = "endpoint_scan_results.json"):
    payload = []
    for r in results:
        payload.append({
            "site": r.site, "url": r.url, "status": r.status,
            "search_box_found": r.search_box_found,
            "candidates": [
                {"url": c.url, "content_type": c.content_type,
                 "size_bytes": c.size_bytes, "confidence": c.confidence,
                 "signal_words_found": c.signal_words_found}
                for c in r.candidates
            ],
        })
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return path
