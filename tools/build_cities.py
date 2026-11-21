"""Construit la base de villes de la carte : un fichier par pays dans web/public/cities/.

Usage (depuis le dossier job_discovery) :
    pip install geonamescache
    python tools/build_cities.py            # toutes les villes du jeu de données, jusqu'aux petites localités (environ 235 000)
    python tools/build_cities.py 5000       # base plus légère : seuil de population au choix

Chaque fichier <PAYS>.json ne se charge dans le navigateur que si des offres de ce pays sont affichées.
"""
import json, re, sys, unicodedata
from pathlib import Path

import geonamescache as g

THRESHOLD = int(sys.argv[1]) if len(sys.argv) > 1 else 500
OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "cities"
LATIN = re.compile(r"^[A-Za-zÀ-ÿ' .\-]+$")


def fold(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def alternates(c, limit):
    seen, out = {fold(c["name"])}, []
    for a in c["alternatenames"]:
        f = fold(a)
        if LATIN.match(a) and f not in seen and 3 <= len(f) <= 30 and len(out) < limit:
            seen.add(f)
            out.append(a)
    return out


def main():
    cities = g.GeonamesCache(min_city_population=THRESHOLD if THRESHOLD in (500, 1000, 5000, 15000) else 500).get_cities().values()
    by, top = {}, []
    for c in cities:
        pop = c["population"]
        alts = alternates(c, 30 if pop >= 50000 else 2)
        row = [c["name"], round(c["latitude"], 3), round(c["longitude"], 3), max(1, pop // 1000)]
        if alts or c["countrycode"] == "US":
            row.append(alts)
        if c["countrycode"] == "US":
            row.append(c["admin1code"])
        by.setdefault(c["countrycode"], []).append(row)
        if pop >= 200000:                                   # table mondiale : pays inconnu dans l'annonce
            top.append([c["name"], round(c["latitude"], 3), round(c["longitude"], 3), max(1, pop // 1000), alternates(c, 12), c["countrycode"]])
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    for iso, rows in by.items():
        rows.sort(key=lambda r: -r[3])
        (OUT / f"{iso}.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    top.sort(key=lambda r: -r[3])
    (OUT / "_top.json").write_text(json.dumps(top, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    small = sorted((iso, len(r)) for iso, r in by.items() if len(r) < 20)
    total = sum(len(r) for r in by.values())
    print(f"{total} villes, {len(by)} pays, {len(top)} grandes villes (table mondiale) -> {OUT}")
    print(f"Pays avec moins de 20 villes (trop petits pour plus) : {small}")


main()
