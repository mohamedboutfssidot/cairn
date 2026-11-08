# -*- coding: utf-8 -*-
"""
À lancer une seule fois pour voir la VRAIE structure du dataset — au lieu
de deviner les noms de colonnes à l'aveugle. Affiche les colonnes
disponibles et un exemple complet de ligne.

Usage : python diagnose_edwarddgao.py
"""
from datasets import load_dataset

ds = load_dataset("edwarddgao/open-apply-jobs", split="train", streaming=True)
row = next(iter(ds))

print("Colonnes disponibles :")
for key in row.keys():
    print(f"  - {key}")

print("\nExemple complet d'une ligne :")
for key, value in row.items():
    preview = str(value)[:200]
    print(f"  {key}: {preview}")
