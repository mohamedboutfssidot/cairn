# -*- coding: utf-8 -*-
"""
Usage :
    pip install playwright
    playwright install chromium   # télécharge le navigateur (~150 Mo), une seule fois
    python scan_endpoints.py

Ça visite chaque site de sites_to_scan.py, tente une recherche "AI Engineer",
et note toutes les requêtes JSON qui ressemblent à des offres d'emploi.
Résultat écrit dans endpoint_scan_results.json + résumé affiché ici.

Compte environ 10-20 secondes par site -> ~15-20 min pour les 56.
Lance-le une fois, pas besoin de le refaire souvent (les sites sans
endpoint aujourd'hui n'en auront probablement pas demain non plus).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from tools.endpoint_scout import scan_all, save_report
from sites_to_scan import SITES_TO_SCAN


def main():
    print(f"=== Scan de {len(SITES_TO_SCAN)} sites (méthode JobSpy, automatisée) ===\n")
    results = scan_all(SITES_TO_SCAN, keyword="AI Engineer", delay_between=3.0)
    path = save_report(results)

    with_candidates = [r for r in results if r.candidates]
    without = [r for r in results if not r.candidates and r.status == "ok"]
    errors = [r for r in results if r.status != "ok"]

    print(f"\n=== Résumé ===")
    print(f"Rapport complet : {path}")
    print(f"\n{len(with_candidates)} site(s) avec au moins un candidat JSON :")
    for r in sorted(with_candidates, key=lambda r: -len(r.candidates[0].signal_words_found)):
        best = r.candidates[0]
        print(f"  [{best.confidence:6s}] {r.site:35s} -> {best.url}")

    print(f"\n{len(without)} site(s) sans candidat trouvé (recherche générique n'a rien capté)")
    print(f"{len(errors)} site(s) en erreur (souvent : blocage anti-bot, timeout)")
    print("\nÉtape suivante : vérifie à la main les candidats 'confiance haute/moyenne' "
          "dans le rapport JSON avant de les brancher dans sources/.")


if __name__ == "__main__":
    main()
