# -*- coding: utf-8 -*-
"""
Recherches enregistrées (liste), stockées dans tracking.db (clé "searches").
Chacune garde les paramètres de lancement (mots-clés, pays, sources...) et le
résultat de sa dernière exécution. « Actualiser » et les alertes les relancent
toutes pour mettre le stock d'offres à jour.
"""
import uuid
from datetime import datetime, timezone

import tracking

KEY = "searches"
_PARAMS = ("keywords", "sites", "source_ids", "location", "jobicy_geo", "country_indeed")


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def list_all():
    return tracking.kv_get(KEY, []) or []


def _save(items):
    tracking.kv_set(KEY, items)


def add(params, label):
    """Ajoute une recherche ; si le libellé existe déjà, ses paramètres sont remplacés."""
    label = (label or "Recherche").strip()[:80]
    clean = {k: params.get(k) for k in _PARAMS}
    items = list_all()
    for it in items:
        if it["label"].lower() == label.lower():
            it["params"] = clean
            _save(items)
            return it
    it = {"id": uuid.uuid4().hex[:8], "label": label, "params": clean, "created": _now(),
          "last_run": None, "last_total": None, "last_new": None, "last_error": None}
    items.append(it)
    _save(items)
    return it


def remove(search_id):
    items = list_all()
    kept = [i for i in items if i["id"] != search_id]
    _save(kept)
    return len(kept) != len(items)


def update(search_id, **fields):
    items = list_all()
    for it in items:
        if it["id"] == search_id:
            it.update(fields)
            _save(items)
            return it
    return None