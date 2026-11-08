# -*- coding: utf-8 -*-
"""
Un seul fichier CSV que tu peux ouvrir dans Excel et modifier toi-même
(colonne "statut") — ce script ne fait que le synchroniser avec les
nouvelles offres trouvées par discover.py, sans jamais écraser ce que tu as
déjà rempli à la main.

Usage :
    python apply/tracker.py sync      # ajoute les nouvelles offres au tracker
    python apply/tracker.py stats     # affiche un résumé par statut
"""
import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd

COLUMNS = ["title", "company", "url", "source", "location",
           "date_found", "date_applied", "statut", "relance_prevue", "notes"]

STATUTS_VALIDES = ["à faire", "postulé", "relance", "entretien", "refus", "offre"]


def sync(jobs_path: str = "jobs_discovered.json", tracker_path: str = "candidatures.csv"):
    jobs = json.loads(Path(jobs_path).read_text(encoding="utf-8"))
    today = date.today().isoformat()

    tracker_file = Path(tracker_path)
    if tracker_file.exists():
        existing = pd.read_csv(tracker_file, dtype=str).fillna("")
    else:
        existing = pd.DataFrame(columns=COLUMNS, dtype=str)

    known_urls = set(existing["url"]) if "url" in existing.columns else set()
    new_rows = []
    for job in jobs:
        if job.get("url") in known_urls:
            continue  # déjà dans le tracker, on ne touche pas à ce qui existe
        new_rows.append({
            "title": job.get("title"), "company": job.get("company"),
            "url": job.get("url"), "source": job.get("source"),
            "location": job.get("location"), "date_found": today,
            "date_applied": "", "statut": "à faire",
            "relance_prevue": "", "notes": "",
        })

    if new_rows:
        existing = pd.concat([existing, pd.DataFrame(new_rows)], ignore_index=True)
    existing.to_csv(tracker_file, index=False)

    print(f"{len(new_rows)} nouvelle(s) offre(s) ajoutée(s) au tracker.")
    print(f"Total dans {tracker_path} : {len(existing)} candidature(s) suivies.")
    return len(new_rows)


def stats(tracker_path: str = "candidatures.csv"):
    tracker_file = Path(tracker_path)
    if not tracker_file.exists():
        print(f"{tracker_path} n'existe pas encore — lance 'sync' d'abord.")
        return
    df = pd.read_csv(tracker_file)
    print(f"Total : {len(df)} candidature(s)\n")
    print(df["statut"].value_counts().to_string())

    # relances dues aujourd'hui ou en retard
    if "relance_prevue" in df.columns:
        today = date.today().isoformat()
        due = df[(df["relance_prevue"].astype(str) != "") &
                  (df["relance_prevue"].astype(str) <= today) &
                  (df["statut"] == "postulé")]
        if len(due):
            print(f"\n⚠ {len(due)} relance(s) à faire :")
            for _, row in due.iterrows():
                print(f"  - {row['title']} @ {row['company']} ({row['url']})")


def mark(url_substring: str, statut: str, tracker_path: str = "candidatures.csv",
         relance_dans_jours: int = None):
    """Marque une candidature par un bout de son URL (pas besoin de l'URL
    complète). Ex. : mark('greenhouse.io/supabase/12345', 'postulé')"""
    tracker_file = Path(tracker_path)
    df = pd.read_csv(tracker_file, dtype=str).fillna("")
    mask = df["url"].astype(str).str.contains(url_substring, na=False)
    n = mask.sum()
    if n == 0:
        print("Aucune candidature trouvée avec ce bout d'URL.")
        return
    if n > 1:
        print(f"{n} candidatures correspondent — précise davantage l'URL.")
        return

    df.loc[mask, "statut"] = statut
    if statut == "postulé":
        df.loc[mask, "date_applied"] = date.today().isoformat()
    if relance_dans_jours:
        from datetime import timedelta
        df.loc[mask, "relance_prevue"] = (date.today() + timedelta(days=relance_dans_jours)).isoformat()

    df.to_csv(tracker_file, index=False)
    print(f"Mis à jour : {df.loc[mask, 'title'].values[0]} -> {statut}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "sync"
    if cmd == "sync":
        sync()
    elif cmd == "stats":
        stats()
    else:
        print("Usage : python apply/tracker.py [sync|stats]")
