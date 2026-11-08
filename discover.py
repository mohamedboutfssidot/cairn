# -*- coding: utf-8 -*-
"""
Point d'entrée CLI (mode terminal, sans l'app web). Les sources tournent en
parallèle via search_engine.run_search() — un même moteur est partagé avec
server.py pour que CLI et app web se comportent toujours pareil.

Usage :
    python discover.py
"""
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))  # pour "from schema import Job" partout

import config
from schema import Job
from search_engine import run_search, SourceResult


def _on_event(result: SourceResult):
    """Affiche la progression dans le terminal au fur et à mesure — les
    sources tournent en parallèle, donc l'ordre d'affichage suit l'ordre
    réel de fin de chaque source, pas un ordre fixe comme avant."""
    if result.status == "running":
        print(f"→ {result.label}...", flush=True)
    elif result.status == "done":
        print(f"✓ {result.label} : {len(result.jobs)} offres", flush=True)
    elif result.status == "error":
        print(f"✗ {result.label} : ÉCHEC ({result.error})", flush=True)


def discover_all() -> list[Job]:
    return run_search(on_event=_on_event)


def clean_previous_output():
    """Supprime les anciens jobs_discovered.csv/.json avant de redécouvrir.
    Évite de mélanger les résultats d'un run précédent avec les nouveaux —
    chaque exécution de discover.py repart de zéro."""
    for path_str in (config.OUTPUT_CSV, config.OUTPUT_JSON):
        path = Path(path_str)
        if path.exists():
            path.unlink()
            print(f"(ancien fichier supprimé : {path})")


def dedup(jobs: list[Job]) -> list[Job]:
    seen, unique = set(), []
    for j in jobs:
        k = j.dedup_key()
        if k not in seen:
            seen.add(k)
            unique.append(j)
    return unique


def _clean_nan(value):
    """JobSpy renvoie parfois float('nan') pour un salaire manquant (hérité
    de pandas en interne) au lieu de None. json.dump écrit alors un NaN
    littéral, qui n'est PAS du JSON valide (seul Python/JS le tolèrent en
    lecture permissive) — tout lecteur strict (navigateur, autre langage)
    plante dessus. On remplace par None avant d'écrire."""
    if isinstance(value, float) and value != value:  # NaN != NaN est vrai pour un float NaN
        return None
    return value


def save(jobs: list[Job]):
    records = [
        {k: _clean_nan(v) for k, v in j.to_dict().items()}
        for j in jobs
    ]

    with open(config.OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    pd.DataFrame(records).to_csv(config.OUTPUT_CSV, index=False)

    print(f"\n{len(jobs)} offres uniques -> {config.OUTPUT_CSV} / {config.OUTPUT_JSON}")


def main():
    print("=== Découverte multi-sources ===\n")
    clean_previous_output()
    raw = discover_all()
    print(f"\nTotal brut (avant dédoublonnage) : {len(raw)}")
    unique = dedup(raw)
    save(unique)

    # Répartition par source, pour voir vite d'où vient le volume
    by_source = {}
    for j in unique:
        by_source[j.source] = by_source.get(j.source, 0) + 1
    print("\nRépartition par source :")
    for src, n in sorted(by_source.items(), key=lambda x: -x[1]):
        print(f"  {src:25s} {n}")


if __name__ == "__main__":
    main()
