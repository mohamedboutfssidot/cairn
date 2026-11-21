# -*- coding: utf-8 -*-
"""
Serveur local qui pilote la recherche ET sert les résultats à l'app React.
100% local, aucune donnée n'est envoyée ailleurs que sur ta propre machine.

Usage :
    pip install -r requirements_server.txt
    python server.py

Puis ouvre l'app React (voir web/README.md) — elle appelle ce serveur sur
http://localhost:5000.

Flux de recherche (remplace "python discover.py" en CLI) :
    1. POST /api/search/start   -> lance une recherche en arrière-plan
                                    (mots-clés + sources choisis dans l'app)
    2. GET  /api/search/stream  -> Server-Sent Events : progression source
                                    par source + résultats au fur et à mesure
                                    (l'app n'attend pas la fin totale)
    3. Les offres sont aussi écrites dans jobs_discovered.json/.csv à la fin,
       comme avant — /api/jobs etc. continuent de fonctionner normalement.

Endpoints de lecture (inchangés + filtres remote/country ajoutés) :
    GET /api/jobs            ?q&source&days_max&sort&remote&country
    GET /api/sources         liste des sources présentes + compte
    GET /api/filters         valeurs disponibles pour remote/country (facettes)
    GET /api/meta            date de dernière recherche
    GET/PUT/DELETE /api/tracking   suivi de candidatures (SQLite, tracking.db)
    GET/PUT /api/profile     profil pour le score de pertinence
"""
import inspect
import json
import os
import queue
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

import config
from schema import Job
from geo import guess_country as _guess_country, guess_city as _guess_city
from search_engine import run_search, list_available_sources, SourceResult
import tracking
import alerts
import searches
import store
import origins
import kit
from scoring import Scorer

BASE_DIR = Path(__file__).parent
NEW_HOURS = 48  # une offre est "nouvelle" pendant 48 h après sa première apparition
JOBS_JSON = BASE_DIR / config.OUTPUT_JSON
JOBS_CSV = BASE_DIR / config.OUTPUT_CSV

app = Flask(__name__)
CORS(app)  # autorise l'app React (origine différente en dev) à appeler ce serveur

# --- État de la recherche en cours -----------------------------------------
# Une seule recherche à la fois (usage personnel local) ; chaque recherche a
# un id, une file d'événements SSE, et une liste de jobs accumulés pour
# pouvoir les écrire sur disque à la fin.
_search_lock = threading.Lock()
_current_search = {"id": None, "queue": None, "jobs": [], "done": False}


def _clean_nan(value):
    """JobSpy renvoie parfois float('nan') (hérité de pandas) au lieu de
    None -> ni JSON valide, ni affichable tel quel. On neutralise avant
    d'envoyer au front ou d'écrire sur disque."""
    if isinstance(value, float) and value != value:
        return None
    return value


_scorer_cache = {"key": None, "scorer": None}


def _get_scorer():
    """Scorer du profil courant (reconstruit seulement si le profil change)."""
    profile = tracking.get_profile()
    key = json.dumps(profile, sort_keys=True)
    if _scorer_cache["key"] != key:
        _scorer_cache["key"] = key
        _scorer_cache["scorer"] = Scorer(profile)
    return _scorer_cache["scorer"]


def _job_to_clean_dict(job: Job) -> dict:
    d = {k: _clean_nan(v) for k, v in job.to_dict().items()}
    # pour filtrer / compter le flux live côté client
    d["country"] = _guess_country(d.get("location"))
    d["city"] = _guess_city(d.get("location"))
    d["score"], d["reasons"] = _get_scorer().score(d)
    return d


_imported = {"done": False}
_enriched_cache = {"key": None, "jobs": [], "index": {}}


def _ensure_imported():
    """Reprend un ancien jobs_discovered.json dans le stock (une seule fois, si le stock est vide)."""
    if not _imported["done"]:
        _imported["done"] = True
        try:
            store.import_json(JOBS_JSON)
        except Exception as e:
            print(f"[stock] import de {JOBS_JSON.name} impossible : {type(e).__name__}: {e}")


def _tracked_urls():
    return set(tracking.status_map().keys())


def _load_jobs():
    """Offres du stock permanent (voir store.py)."""
    _ensure_imported()
    return store.all_jobs(protect_urls=_tracked_urls())


def _load_enriched():
    """Offres du stock + pays/ville + score + suivi + nouveauté. Résultat mis en
    cache tant que le stock, le suivi et le profil ne changent pas : les endpoints
    /api/jobs, /api/sources et /api/filters le réutilisent sans tout recalculer.
    Ne PAS modifier les dicts renvoyés (partagés entre requêtes)."""
    _ensure_imported()
    scorer = _get_scorer()
    key = (store.VERSION, tracking.VERSION, scorer.hash, int(time.time() // 300), str(JOBS_JSON))
    if _enriched_cache["key"] == key:
        return _enriched_cache["jobs"]
    track = tracking.status_map()
    hidden_u = tracking.hidden_urls()
    hidden_c = tracking.hidden_companies()
    jobs = store.all_jobs(protect_urls=set(track.keys()))
    new_after = (datetime.now(timezone.utc) - timedelta(hours=NEW_HOURS)).isoformat(timespec="seconds")
    index = {}
    for j in jobs:
        j["country"] = _guess_country(j.get("location"))
        j["city"] = _guess_city(j.get("location"))
        j["score"], j["reasons"] = scorer.score(j)
        t = track.get(j.get("url")) or next((track[a["url"]] for a in j.get("alt_urls", []) if a["url"] in track), None)
        j["status"] = t["status"] if t else None
        j["note"] = t["note"] if t else ""
        j["follow_up"] = t["follow_up"] if t else None
        fs = j.get("first_seen")
        j["is_new"] = bool(fs and fs != "baseline" and fs >= new_after)
        # Sites d'origine (LinkedIn, Indeed, Greenhouse…), pas les moyens d'accès.
        j["sources"] = origins.display_list(j.get("sources") or [j.get("source")])
        j["source"] = origins.display(j.get("source"))
        j["hidden"] = (not t) and (
            j.get("url") in hidden_u or any(a["url"] in hidden_u for a in j.get("alt_urls", []))
            or tracking._norm_company(j.get("company")) in hidden_c)
        index[j.get("url")] = j
        for a in j.get("alt_urls", []):
            index[a["url"]] = j
    _enriched_cache.update(key=key, jobs=jobs, index=index)
    return jobs


def _list_view(j):
    """Version allégée pour les listes : description tronquée (le détail la recharge)."""
    d = dict(j)
    desc = d.get("description") or ""
    d["description"] = desc[:300]
    d["desc_len"] = len(desc)
    return d


def _parse_date(value):
    """Essaie de lire une date ISO (avec ou sans heure/fuseau). Renvoie None
    si le champ est vide ou illisible — les offres sans date ne doivent pas
    faire planter le tri, juste atterrir en dernier."""
    if not value:
        return None
    text = str(value)[:10]
    try:
        return datetime.strptime(text, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


# --- Lecture des résultats ---------------------------------------------------

def _read_filters():
    """Lit les filtres communs (q, source, days_max, remote, country) depuis
    la query string. Les mêmes paramètres servent à /api/jobs, /api/sources
    et /api/filters pour que les compteurs des listes déroulantes
    correspondent EXACTEMENT à ce que la liste d'offres affichera."""
    return {
        "q": request.args.get("q", "").strip().lower(),
        "source": request.args.get("source", "").strip(),
        "days_max": request.args.get("days_max", type=int),
        "remote": request.args.get("remote", "").strip(),  # "true" | "false" | ""
        "country": request.args.get("country", "").strip(),
        "city": request.args.get("city", "").strip(),
        # "" | "tracked" (toute offre suivie) | un statut | "none" (non suivie)
        "status": request.args.get("status", "").strip(),
        "min_score": request.args.get("min_score", type=int),
        "new": request.args.get("new", "").strip() in ("1", "true"),
        # données structurées (voir extract.py)
        "level": request.args.get("level", "").strip(),
        "lang": request.args.get("lang", "").strip(),
        "visa": request.args.get("visa", "").strip(),          # "yes" | "no" | "unknown"
        "salary_min": request.args.get("salary_min", type=int),  # USD / an
        # "" (masquées exclues) | "only" (seulement les masquées)
        "hidden": request.args.get("hidden", "").strip(),
        "limit": request.args.get("limit", default=5000, type=int),
    }


def _apply_filters(jobs, f, skip=()):
    """Applique les filtres `f` sauf ceux listés dans `skip` (utile pour les
    facettes : le compteur d'un filtre ignore ce filtre lui-même mais tient
    compte de tous les autres -> pays 'Morocco (2)' = 2 offres réellement
    visibles si on choisit Morocco avec la source/période actuelles)."""
    if f.get("hidden") == "only":
        jobs = [j for j in jobs if j.get("hidden")]
    else:
        jobs = [j for j in jobs if not j.get("hidden")]

    if f["q"] and "q" not in skip:
        q = f["q"]
        jobs = [
            j for j in jobs
            if q in (j.get("title") or "").lower()
            or q in (j.get("company") or "").lower()
        ]

    if f["source"] and "source" not in skip:
        jobs = [j for j in jobs if f["source"] in (j.get("sources") or [j.get("source")])]

    if "remote" not in skip:
        if f["remote"] == "true":
            jobs = [j for j in jobs if j.get("remote") is True]
        elif f["remote"] == "false":
            jobs = [j for j in jobs if j.get("remote") is False]

    if f["country"] and "country" not in skip:
        jobs = [j for j in jobs if _guess_country(j.get("location")) == f["country"]]

    if f["city"] and "city" not in skip:
        jobs = [j for j in jobs if _guess_city(j.get("location")) == f["city"]]

    if f["status"] and "status" not in skip:
        st = f["status"]
        if st == "tracked":
            jobs = [j for j in jobs if j.get("status")]
        elif st == "none":
            jobs = [j for j in jobs if not j.get("status")]
        else:
            jobs = [j for j in jobs if j.get("status") == st]

    if f["level"] and "level" not in skip:
        jobs = [j for j in jobs if j.get("level") == f["level"]]

    if f["lang"] and "lang" not in skip:
        jobs = [j for j in jobs if f["lang"] in (j.get("langs") or [])]

    if f["visa"] and "visa" not in skip:
        want = None if f["visa"] == "unknown" else f["visa"]
        jobs = [j for j in jobs if j.get("visa") == want]

    if f["salary_min"] and "salary_min" not in skip:
        jobs = [j for j in jobs if (j.get("sal_usd_max") or 0) >= f["salary_min"]]

    if f["new"] and "new" not in skip:
        jobs = [j for j in jobs if j.get("is_new")]

    if f["min_score"] and "min_score" not in skip:
        jobs = [j for j in jobs if (j.get("score") or 0) >= f["min_score"]]

    if f["days_max"] is not None and "days_max" not in skip:
        now = datetime.now(timezone.utc)
        kept = []
        for j in jobs:
            dt = _parse_date(j.get("posted_date"))
            if dt is None:
                continue  # sans date connue, on ne peut pas garantir la fraîcheur -> exclu du filtre
            if (now - dt).days <= f["days_max"]:
                kept.append(j)
        jobs = kept
    return jobs


@app.route("/api/jobs")
def get_jobs():
    f = _read_filters()
    sort = request.args.get("sort", "date_desc")
    jobs = _apply_filters(_load_enriched(), f)

    def sort_key(j):
        dt = _parse_date(j.get("posted_date"))
        return (dt is None, dt or datetime.min.replace(tzinfo=timezone.utc))

    if sort == "score_desc":
        # pertinence d'abord, puis les plus récentes
        jobs = sorted(jobs, key=sort_key, reverse=True)
        jobs = sorted(jobs, key=lambda j: -(j.get("score") or 0))
    else:
        jobs = sorted(jobs, key=sort_key, reverse=(sort != "date_asc"))

    total = len(jobs)
    jobs = [_list_view(j) for j in jobs[: max(1, f["limit"])]]
    return jsonify({"count": total, "jobs": jobs})


@app.route("/api/job")
def get_job_detail():
    """Une offre complète (description entière) par n'importe lequel de ses liens."""
    _load_enriched()
    j = _enriched_cache["index"].get(request.args.get("url", ""))
    if not j:
        return jsonify({"error": "Offre introuvable (supprimée du stock ?)"}), 404
    return jsonify(j)


@app.route("/api/sources")
def get_sources():
    """Sources présentes dans les résultats, avec le nombre d'offres qui
    passent les AUTRES filtres actifs (pays, période, remote, texte)."""
    f = _read_filters()
    jobs = _apply_filters(_load_enriched(), f, skip=("source",))
    counts = {}
    for j in jobs:
        for src in (j.get("sources") or [j.get("source", "?")]):
            counts[src] = counts.get(src, 0) + 1
    sources = [
        {"source": src, "count": n}
        for src, n in sorted(counts.items(), key=lambda x: -x[1])
    ]
    return jsonify({"sources": sources, "total": len(jobs)})


@app.route("/api/sources/available")
def get_available_sources():
    """Sources que l'on PEUT lancer (pour les cases à cocher de l'écran de
    recherche) — différent de /api/sources qui liste ce qui est déjà présent
    dans les résultats."""
    return jsonify({"sources": list_available_sources()})


@app.route("/api/filters")
def get_filters():
    """Facettes (pays / remote) calculées sur les résultats, en tenant compte
    des autres filtres actifs : chaque compteur = nombre d'offres que la liste
    affichera réellement si on sélectionne cette valeur."""
    f = _read_filters()
    all_jobs = _load_enriched()

    countries = {}
    for j in _apply_filters(all_jobs, f, skip=("country",)):
        c = _guess_country(j.get("location"))
        if c:
            countries[c] = countries.get(c, 0) + 1

    cities = {}
    for j in _apply_filters(all_jobs, f, skip=("city",)):
        ci = _guess_city(j.get("location"))
        if ci:
            cities[ci] = cities.get(ci, 0) + 1

    remote_true = remote_false = remote_unknown = 0
    for j in _apply_filters(all_jobs, f, skip=("remote",)):
        r = j.get("remote")
        if r is True:
            remote_true += 1
        elif r is False:
            remote_false += 1
        else:
            remote_unknown += 1

    levels, langs = {}, {}
    for j in _apply_filters(all_jobs, f, skip=("level",)):
        if j.get("level"):
            levels[j["level"]] = levels.get(j["level"], 0) + 1
    for j in _apply_filters(all_jobs, f, skip=("lang",)):
        for code in j.get("langs") or []:
            langs[code] = langs.get(code, 0) + 1
    visa = {"yes": 0, "no": 0, "unknown": 0}
    for j in _apply_filters(all_jobs, f, skip=("visa",)):
        visa[j.get("visa") or "unknown"] += 1
    salary = {}
    for floor in (30000, 60000, 90000, 120000):
        salary[str(floor)] = sum(1 for j in _apply_filters(all_jobs, f, skip=("salary_min",))
                                 if (j.get("sal_usd_max") or 0) >= floor)

    statuses = {}
    for j in _apply_filters(all_jobs, f, skip=("status",)):
        st = j.get("status")
        if st:
            statuses[st] = statuses.get(st, 0) + 1

    hidden_n = sum(1 for j in all_jobs if j.get("hidden"))
    return jsonify({
        "hidden": hidden_n,
        "levels": [{"level": k, "count": v} for k, v in sorted(levels.items(), key=lambda x: -x[1])],
        "langs": [{"lang": k, "count": v} for k, v in sorted(langs.items(), key=lambda x: -x[1])],
        "visa": visa,
        "salary": salary,
        "statuses": statuses,
        "countries": [
            {"country": c, "count": n}
            for c, n in sorted(countries.items(), key=lambda x: -x[1])
        ],
        "cities": [
            {"city": c, "count": n}
            for c, n in sorted(cities.items(), key=lambda x: -x[1])[:150]
        ],
        "remote": {
            "true": remote_true,
            "false": remote_false,
            "unknown": remote_unknown,
        },
    })


# --- Suivi de candidatures + profil -----------------------------------------

@app.route("/api/tracking", methods=["GET"])
def list_tracking():
    return jsonify({"statuses": tracking.STATUSES, "items": tracking.list_applications()})


@app.route("/api/tracking", methods=["PUT"])
def put_tracking():
    """Crée/met à jour une candidature. Corps : {url, status?, note?, follow_up?,
    clear_follow_up?, job?} ; `job` = instantané de l'offre (utile à la création)."""
    body = request.get_json(silent=True) or {}
    try:
        item = tracking.upsert_application(
            body.get("url"), status=body.get("status"), note=body.get("note"),
            follow_up=body.get("follow_up") or None,
            job=body.get("job"), clear_follow_up=bool(body.get("clear_follow_up")),
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(item)


@app.route("/api/tracking", methods=["DELETE"])
def delete_tracking():
    url = request.args.get("url", "")
    return jsonify({"deleted": tracking.delete_application(url)})


@app.route("/api/hidden", methods=["POST"])
def post_hidden():
    """Masque une offre (« pas intéressé ») : {url, company?, scope: "job" | "company"}.
    Une offre suivie ne peut pas être masquée : elle reste dans le suivi."""
    body = request.get_json(silent=True) or {}
    url, company = body.get("url"), body.get("company")
    try:
        if body.get("scope") == "company":
            tracking.hide_company(company)
        else:
            _load_enriched()
            if (_enriched_cache["index"].get(url) or {}).get("status") or url in tracking.status_map():
                return jsonify({"error": "Cette offre est suivie : retire-la d'abord du suivi."}), 400
            tracking.hide_job(url, company)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"hidden": True})


@app.route("/api/hidden", methods=["DELETE"])
def delete_hidden():
    """Rétablit une offre (url) ou une entreprise entière (company)."""
    if request.args.get("company"):
        tracking.unhide_company(request.args["company"])
    # une offre masquée via son entreprise n'a pas d'url propre dans la table
    url = request.args.get("url", "")
    if url:
        _load_enriched()
        j = _enriched_cache["index"].get(url)
        for u in [url] + [a["url"] for a in (j or {}).get("alt_urls", [])]:
            tracking.unhide_job(u)
        if j and tracking._norm_company(j.get("company")) in tracking.hidden_companies():
            tracking.unhide_company(j.get("company"))
    return jsonify({"hidden": False})


@app.route("/api/dashboard")
def get_dashboard():
    """Données de la page d'accueil : nouveautés, relances, suivi, stock, actualisation."""
    _ensure_imported()
    jobs = _load_enriched()
    visible = [j for j in jobs if not j.get("hidden")]
    today = datetime.now(timezone.utc).date().isoformat()
    soon = (datetime.now(timezone.utc).date() + timedelta(days=7)).isoformat()

    def card(x):
        j = x.get("job") or {}
        return {"url": x["url"], "title": j.get("title"), "company": j.get("company"), "status": x["status"],
                "follow_up": x["follow_up"], "note": x["note"]}

    apps = tracking.list_applications()
    pipeline = {st["id"] if isinstance(st, dict) else st: 0 for st in tracking.STATUSES}
    for a in apps:
        pipeline[a["status"]] = pipeline.get(a["status"], 0) + 1
    due = sorted((a for a in apps if a["follow_up"] and a["follow_up"] <= today), key=lambda a: a["follow_up"])
    upcoming = sorted((a for a in apps if a["follow_up"] and today < a["follow_up"] <= soon), key=lambda a: a["follow_up"])

    def sort_key(j):
        return (-(j.get("score") or 0), str(j.get("posted_date") or ""))
    fresh = [j for j in visible if j.get("is_new") and not j.get("status")]
    fresh = sorted(sorted(fresh, key=lambda j: str(j.get("posted_date") or ""), reverse=True), key=lambda j: -(j.get("score") or 0))

    counts = {}
    for j in visible:
        for src in j.get("sources") or []:
            counts[src] = counts.get(src, 0) + 1
    st = store.stats()
    saved = searches.list_all()
    return jsonify({
        "today": today,
        "new": {"count": len(fresh), "jobs": [_list_view(j) for j in fresh[:12]], "hours": NEW_HOURS},
        "followups": {"due": [card(a) for a in due], "upcoming": [card(a) for a in upcoming]},
        "pipeline": pipeline,
        "applications": len(apps),
        "recent": [dict(card(a), updated_at=a["updated_at"])
                   for a in sorted(apps, key=lambda a: a["updated_at"], reverse=True)[:6]],
        "stock": {"visible": len(visible), "hidden": len(jobs) - len(visible), "total": st["total"],
                  "sources": [{"source": k, "count": v} for k, v in sorted(counts.items(), key=lambda x: -x[1])[:8]]},
        "refresh": dict(_refresh),
        "last_updated": st["last_update"],
        "searches": [{"id": x["id"], "label": x["label"], "last_run": x.get("last_run"), "last_total": x.get("last_total"),
                      "last_new": x.get("last_new"), "last_error": x.get("last_error")} for x in saved],
        "has_profile": bool(tracking.get_profile().get("titles") or tracking.get_profile().get("must")),
    })


# --- Candidature assistée (kit.py) -------------------------------------------------

def _job_by_url(url):
    _load_enriched()
    return _enriched_cache["index"].get(url)


@app.route("/api/candidate", methods=["GET"])
def get_candidate():
    return jsonify(kit.get_candidate())


@app.route("/api/candidate", methods=["PUT"])
def put_candidate():
    return jsonify(kit.set_candidate(request.get_json(silent=True) or {}))


@app.route("/api/kit/settings", methods=["GET"])
def get_kit_settings():
    return jsonify(kit.public_settings())


@app.route("/api/kit/settings", methods=["PUT"])
def put_kit_settings():
    return jsonify(kit.set_settings(request.get_json(silent=True) or {}))


@app.route("/api/kit", methods=["POST"])
def post_kit():
    """Brouillons (gabarits sans IA) pour une offre : {url, lang?}. Si des brouillons
    modifiés existent pour cette offre dans la même langue, ils sont renvoyés tels quels."""
    body = request.get_json(silent=True) or {}
    job = _job_by_url(body.get("url", ""))
    if not job:
        return jsonify({"error": "Offre introuvable."}), 404
    app_item = next((a for a in tracking.list_applications() if a["url"] == job.get("url")), None)
    sent_on = (app_item or {}).get("created_at", "")[:10] if app_item and app_item["status"] != "saved" else None
    tone = body.get("tone") if body.get("tone") in ("formal", "direct", "warm") else "formal"
    length = body.get("length") if body.get("length") in ("short", "standard", "long") else "standard"
    out = kit.build(job, body.get("lang"), sent_on, tone, length, body.get("picks"))
    saved = {} if body.get("fresh") else kit.get_drafts(job["url"])
    if saved and saved.get("lang") == out["lang"]:
        for k in ("letter", "cv", "email_subject", "email", "follow_subject", "follow"):
            if saved.get(k):
                out[k] = saved[k]
        out["saved"] = True
    return jsonify(out)


@app.route("/api/kit/draft", methods=["PUT"])
def put_kit_draft():
    body = request.get_json(silent=True) or {}
    job = _job_by_url(body.get("url", ""))
    if not job:
        return jsonify({"error": "Offre introuvable."}), 404
    return jsonify(kit.set_drafts(job["url"], body.get("drafts")))


@app.route("/api/kit/improve", methods=["POST"])
def post_kit_improve():
    body = request.get_json(silent=True) or {}
    job = _job_by_url(body.get("url", ""))
    if not job:
        return jsonify({"error": "Offre introuvable."}), 404
    try:
        text = kit.improve(body.get("kind"), body.get("text") or "", job, body.get("lang") or "fr", body.get("instruction") or "")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"text": text})


@app.route("/api/profile", methods=["GET"])
def get_profile():
    return jsonify(tracking.get_profile())


@app.route("/api/profile", methods=["PUT"])
def put_profile():
    body = request.get_json(silent=True) or {}
    return jsonify(tracking.set_profile(body))


@app.route("/api/meta")
def get_meta():
    _ensure_imported()
    st = store.stats()
    return jsonify({
        "exists": st["total"] > 0,
        "last_updated": st["last_update"],
        "total": st["total"],
        "refresh": dict(_refresh),
        "searches": len(searches.list_all()),
    })


@app.route("/api/store", methods=["DELETE"])
def clear_store():
    """Vide le stock d'offres (les candidatures suivies gardent leur instantané)."""
    n = store.purge(protect_urls=_tracked_urls(), days=0)   # tout sauf les offres suivies
    return jsonify({"cleared": n})


# --- Lancement et suivi d'une recherche (remplace "python discover.py") ----

def _export_files():
    """Copie JSON/CSV du stock actif (compatibilité avec les anciens scripts)."""
    try:
        store.export_files(JOBS_JSON, JOBS_CSV, protect_urls=_tracked_urls())
    except Exception as e:
        print(f"[stock] export JSON/CSV impossible : {type(e).__name__}: {e}")


def _dedup(jobs: list[Job]) -> list[Job]:
    seen, unique = set(), []
    for j in jobs:
        k = j.dedup_key()
        if k not in seen:
            seen.add(k)
            unique.append(j)
    return unique


# Progression en direct de la recherche en cours (lue par GET /api/progress toutes les ~1 s).
# `tick` change à chaque lot d'offres enregistré : l'interface recharge alors sa liste, donc
# chaque offre apparaît dès qu'une source la renvoie, sans attendre la fin.
_progress_lock = threading.Lock()
_progress = {"running": False, "search_id": None, "mode": None, "sources": {}, "found": 0,
             "tick": 0, "started": None, "finished": None, "error": None, "new": 0, "total": None,
             "cancelled": False}

# Recherches arrêtées par l'utilisateur : leur fil continue peut-être en coulisse (une source déjà
# lancée ne s'interrompt pas toujours), mais plus rien n'est enregistré et rien n'est supprimé.
_cancelled_ids = set()


class _Stopped(BaseException):
    """Levée dans les rappels d'une recherche arrêtée pour couper court aux sources encore en cours."""


def _progress_reset(search_id, mode):
    with _progress_lock:
        _progress.update(running=True, search_id=search_id, mode=mode, sources={}, found=0, tick=0,
                         started=time.time(), finished=None, error=None, new=0, total=None, cancelled=False)


def _progress_cancel(search_id):
    with _progress_lock:
        if _progress["search_id"] == search_id and _progress["running"]:
            _progress.update(running=False, cancelled=True, finished=time.time(), tick=_progress["tick"] + 1,
                             total=_progress["found"])


def _progress_source(source_id, label=None, status=None, count=None, error=None):
    with _progress_lock:
        s = _progress["sources"].setdefault(source_id, {"label": source_id, "status": "running", "count": 0, "error": None})
        if label:
            s["label"] = label
        if status:
            s["status"] = status
        if count is not None:
            s["count"] = count
        if error:
            s["error"] = error
        _progress["tick"] += 1


def _progress_found(n):
    with _progress_lock:
        _progress["found"] += n
        _progress["tick"] += 1


def _progress_end(search_id, error=None, new=None, total=None):
    with _progress_lock:
        if _progress["search_id"] == search_id and _progress["running"]:
            _progress.update(running=False, finished=time.time(), error=error, tick=_progress["tick"] + 1)
            if new is not None:
                _progress["new"] = new
            if total is not None:
                _progress["total"] = total


# Modes de recherche, appliqués ici (sans toucher à search_engine.py) en choisissant les sources :
#  « fast » = API publiques + ATS + Jobicy + JobSpy ; « deep » = le reste (datasets HF).
FAST_SOURCE_IDS = {"remoteok", "remotive", "wwr", "himalayas", "ats", "jobicy", "jobicy_country",
                   "jobspy", "jobspy_country"}


def _apply_mode(mode, source_ids, location, jobicy_geo, country_indeed):
    """-> (source_ids, location, jobicy_geo, country_indeed) adaptés au mode demandé."""
    if mode not in ("fast", "deep"):
        return source_ids, location, jobicy_geo, country_indeed
    try:
        all_ids = [s["id"] for s in list_available_sources()]
    except Exception:
        return source_ids, location, jobicy_geo, country_indeed
    chosen = [i for i in all_ids if (i in FAST_SOURCE_IDS) == (mode == "fast")]
    if source_ids is not None:
        chosen = [i for i in chosen if i in set(source_ids)]
    if not chosen:      # ids inconnus : mieux vaut tout lancer que ne rien lancer
        return source_ids, location, jobicy_geo, country_indeed
    if mode == "deep":  # les sources « par pays » (JobSpy, Jobicy) sont rapides : on ne les génère pas
        return chosen, None, None, None
    return chosen, location, jobicy_geo, country_indeed


def _store_is_baseline():
    """Compatible avec les anciennes et nouvelles versions de store.py."""
    fn = getattr(store, "is_baseline", None)
    if fn:
        return fn()
    try:
        with store._conn() as conn:
            return store._is_baseline(conn)
    except Exception:
        return False


def _run_search_background(search_id: str, keywords, sites, source_ids, location=None,
                            jobicy_geo=None, country_indeed=None, on_complete=None, on_error=None, mode=None, clean=False):
    q = _current_search["queue"]
    new_urls, new_lock = set(), threading.Lock()
    seen_urls = set()
    baseline = False

    def stopped():
        return search_id in _cancelled_ids

    def persist(cleaned):
        """Fusionne tout de suite des offres dans le stock permanent : elles sont
        visibles dans l'app dès leur arrivée et survivent à la fin de la recherche."""
        if stopped():
            raise _Stopped()
        try:
            fresh, _ = store.upsert_many(cleaned)
            with new_lock:
                new_urls.update(fresh)
                seen_urls.update(c["url"] for c in cleaned if c.get("url"))
        except Exception as e:
            print(f"[stock] enregistrement impossible : {type(e).__name__}: {e}")

    def on_event(result: SourceResult):
        # on_event est appelé depuis les threads de search_engine -> on ne
        # fait que pousser dans la queue thread-safe, le générateur SSE
        # (dans un autre contexte) la consomme et formate pour le navigateur.
        payload = {
            "type": "source_event",
            "source_id": result.source_id,
            "label": result.label,
            "status": result.status,
            "count": len(result.jobs) if result.jobs else 0,
            "error": result.error,
        }
        if stopped():
            raise _Stopped()
        q.put(payload)
        _progress_source(result.source_id, label=result.label, status=result.status,
                         count=payload["count"], error=result.error)
        # streamed=True : ces offres ont déjà été enregistrées par lots pendant
        # l'exécution de la source (on_batch) -> pas de doublon à la fin.
        if result.status == "done" and result.jobs and not getattr(result, "streamed", False):
            cleaned = [_job_to_clean_dict(j) for j in result.jobs]
            persist(cleaned)
            _progress_found(len(cleaned))
            q.put({"type": "jobs_batch", "source_id": result.source_id, "n": len(cleaned)})

    def on_batch(source_id, jobs, total):
        # Offres d'une source qui n'a pas encore fini : enregistrées tout de suite,
        # avec le compteur "en cours" de la source (ligne de progression).
        if stopped():
            raise _Stopped()
        cleaned = [_job_to_clean_dict(j) for j in jobs]
        persist(cleaned)
        _progress_found(len(cleaned))
        _progress_source(source_id, status="running", count=total)
        q.put({"type": "jobs_batch", "source_id": source_id, "n": len(cleaned)})
        q.put({
            "type": "source_event", "source_id": source_id,
            "label": None, "status": "running", "count": total, "error": None,
        })

    try:
        baseline = _store_is_baseline()
        source_ids, location, jobicy_geo, country_indeed = _apply_mode(mode, source_ids, location, jobicy_geo, country_indeed)
        extra = {"on_batch": on_batch} if "on_batch" in inspect.signature(run_search).parameters else {}
        all_jobs = run_search(
            keywords=keywords, sites=sites, source_ids=source_ids,
            location=location, jobicy_geo=jobicy_geo, country_indeed=country_indeed,
            on_event=on_event, **extra,
        )
        if stopped():
            return
        unique = _dedup(all_jobs)
        # Passe finale (idempotente) : rattrape ce qui n'aurait pas été enregistré en route.
        persist([_job_to_clean_dict(j) for j in unique])
        store.finish_run()
        if clean:
            # Nouvelle recherche « à neuf » : l'ancienne liste n'est retirée qu'une fois la nouvelle
            # terminée (si tu arrêtes en route, rien n'est perdu). Les offres suivies restent.
            store.purge(protect_urls=set(_tracked_urls()) | seen_urls, days=0)
        else:
            store.purge(protect_urls=_tracked_urls())
        _export_files()

        _progress_end(search_id, new=len(new_urls), total=len(unique))
        q.put({"type": "search_done", "total": len(unique), "total_raw": len(all_jobs),
               "new": len(new_urls), "stock": store.stats()["total"]})
        if on_complete:
            try:
                on_complete(unique, set(new_urls), baseline)
            except Exception as e:  # une alerte ratée ne doit pas casser la recherche
                print(f"[alertes] erreur après recherche : {type(e).__name__}: {e}")
    except _Stopped:
        pass   # arrêtée par l'utilisateur : tout ce qui était déjà enregistré est conservé
    except Exception as e:
        if stopped():
            return
        _progress_end(search_id, error=f"{type(e).__name__}: {e}")
        q.put({"type": "search_error", "error": f"{type(e).__name__}: {e}"})
        if on_error:
            try:
                on_error(e)
            except Exception:
                pass
    finally:
        _progress_end(search_id, error="La recherche s'est arrêtée de façon inattendue.")  # sans effet si déjà terminée
        q.put(None)  # sentinelle : ferme le flux SSE
        # "done" doit être posé par le thread de recherche lui-même : avant, seul
        # le générateur SSE le faisait, donc si personne ne lisait le flux
        # (page rafraîchie / onglet fermé en cours de recherche), le serveur
        # restait bloqué sur "Une recherche est déjà en cours" (409) jusqu'à
        # son redémarrage. Le test d'id évite qu'une ancienne recherche qui se
        # termine tard marque comme finie une recherche plus récente.
        with _search_lock:
            if _current_search["id"] == search_id:
                _current_search["done"] = True


def _try_start_search(params, on_complete=None, on_error=None):
    """Démarre une recherche en arrière-plan si aucune n'est en cours.
    Renvoie son id, ou None si une recherche tourne déjà."""
    with _search_lock:
        if _current_search["queue"] is not None and not _current_search["done"]:
            return None
        search_id = str(uuid.uuid4())
        _current_search["id"] = search_id
        _current_search["queue"] = queue.Queue()
        _current_search["done"] = False
        _progress_reset(search_id, params.get("mode") if params.get("mode") in ("fast", "deep") else None)

    thread = threading.Thread(
        target=_run_search_background,
        args=(search_id, params.get("keywords") or None, params.get("sites") or None,
              params.get("source_ids") or None, params.get("location") or None,
              params.get("jobicy_geo") or None, params.get("country_indeed") or None,
              on_complete, on_error, params.get("mode") if params.get("mode") in ("fast", "deep") else None,
              bool(params.get("clean"))),
        daemon=True,
    )
    thread.start()
    return search_id


def _stop_search():
    """Arrête la recherche en cours et l'actualisation éventuelle. Rien n'est supprimé : les offres
    déjà enregistrées et toutes les recherches sauvegardées restent. True si quelque chose tournait."""
    was_refresh = False
    with _refresh_lock:
        if _refresh["running"]:
            _refresh["cancel"] = True
            was_refresh = True
    sid, q = None, None
    with _search_lock:
        if _current_search["queue"] is not None and not _current_search["done"]:
            sid, q = _current_search["id"], _current_search["queue"]
            _cancelled_ids.add(sid)
            _current_search["done"] = True      # libère le serveur : une nouvelle recherche peut démarrer
    if sid:
        _progress_cancel(sid)
        try:
            q.put({"type": "search_stopped"})
            q.put(None)
        except Exception:
            pass
    return bool(sid) or was_refresh


@app.route("/api/search/stop", methods=["POST"])
def stop_search():
    stopped = _stop_search()
    return jsonify({"stopped": stopped, "stock": store.stats()["total"]})


@app.route("/api/progress", methods=["GET"])
def get_progress():
    """Où en est la recherche en cours : sources (en cours / terminée / erreur), offres trouvées,
    et `tick` qui change quand de nouvelles offres sont enregistrées."""
    with _progress_lock:
        p = json.loads(json.dumps(_progress))
    p["stock"] = store.stats()["total"]
    p["elapsed"] = round((p["finished"] or time.time()) - p["started"], 1) if p["started"] else 0
    return jsonify(p)


@app.route("/api/search/start", methods=["POST"])
def start_search():
    body = request.get_json(silent=True) or {}
    # None -> défauts du serveur (mots-clés de config, tous les sites/sources, pas de pays)
    search_id = _try_start_search(body)
    if search_id is None:
        return jsonify({"error": "Une recherche est déjà en cours."}), 409
    return jsonify({"search_id": search_id})


# --- Actualisation : relance toutes les recherches enregistrées ------------------
# Le stock d'offres est permanent (store.py) ; « Actualiser » (bouton) et les alertes
# (planificateur) relancent les recherches enregistrées, l'une après l'autre, et
# fusionnent leurs résultats dans le stock.

_refresh_lock = threading.Lock()
_refresh = {"running": False, "index": 0, "total": 0, "label": None, "new": 0,
            "error": None, "finished": None, "notify": False, "cancel": False, "cancelled": False}


def _start_refresh(ids=None, notify=False, mode=None):
    """Lance l'actualisation en arrière-plan. False si déjà en cours ou rien à relancer."""
    items = searches.list_all()
    if ids:
        items = [i for i in items if i["id"] in ids]
    if not items:
        return False
    with _refresh_lock:
        if _refresh["running"]:
            return False
        _refresh.update(running=True, index=0, total=len(items), label=None, new=0,
                        error=None, finished=None, notify=notify, cancel=False, cancelled=False)
    if notify:
        alerts.update_state(running=True, last_error=None)
    threading.Thread(target=_refresh_worker, args=(items, notify, mode), daemon=True).start()
    return True


def _refresh_worker(items, notify, mode=None):
    new_all, errors, baseline_any = set(), [], False
    try:
        for i, item in enumerate(items):
            if _refresh.get("cancel"):
                break
            _refresh.update(index=i + 1, label=item["label"])
            result, done = {}, threading.Event()

            def ok(unique, new_urls, baseline, _r=result, _d=done):
                _r.update(total=len(unique), new=set(new_urls), baseline=baseline)
                _d.set()

            def bad(exc, _r=result, _d=done):
                _r["error"] = f"{type(exc).__name__}: {exc}"
                _d.set()

            sid, deadline = None, time.time() + 900
            while sid is None and time.time() < deadline and not _refresh.get("cancel"):
                sid = _try_start_search({**item["params"], "mode": mode} if mode else item["params"], ok, bad)   # attend qu'une recherche manuelle finisse
                if sid is None:
                    time.sleep(0.5)
            if sid is None and _refresh.get("cancel"):
                break
            if sid is None:
                errors.append(f"{item['label']} : une autre recherche occupait le serveur")
                searches.update(item["id"], last_error="Serveur occupé")
                continue
            waited = 0.0
            while not done.wait(timeout=0.5) and waited < 3600 and not _refresh.get("cancel"):
                waited += 0.5
            if _refresh.get("cancel"):
                break   # arrêtée : on garde cette recherche telle quelle (date de dernière actualisation inchangée)
            err = result.get("error") or (None if result else "Pas de réponse")
            if err:
                errors.append(f"{item['label']} : {err}")
            else:
                new_all |= result["new"]
                baseline_any = baseline_any or result["baseline"]
            searches.update(item["id"], last_run=alerts._iso(alerts._now()), last_error=err,
                            last_total=result.get("total"), last_new=len(result.get("new", ())))
            _refresh["new"] = len(new_all)
    except Exception as e:
        errors.append(f"{type(e).__name__}: {e}")
    finally:
        _refresh.update(running=False, error=" ; ".join(errors) or None,
                        finished=alerts._iso(alerts._now()), cancelled=bool(_refresh.get("cancel")))
        if notify and not _refresh.get("cancel"):
            try:
                _finish_scheduled(new_all, baseline_any, errors)
            except Exception as e:
                alerts.update_state(running=False, last_error=f"{type(e).__name__}: {e}")


def _finish_scheduled(new_urls, baseline, errors):
    """Fin d'une actualisation planifiée : met à jour l'état et notifie les nouveautés."""
    cfg = alerts.get_config()
    total = store.stats()["total"]
    state = {"running": False, "last_run": alerts._iso(alerts._now()), "last_total": total,
             "last_error": " ; ".join(errors) or None, "next_run": alerts.plan_next(cfg)}
    _load_enriched()
    index = _enriched_cache["index"]
    notified = None
    if baseline:
        state["last_new"] = 0
        if alerts.channels_configured(cfg):
            notified = alerts.notify(
                "Alertes activées",
                f"Alertes activées : {total} offres enregistrées comme référence. "
                "Tu seras prévenu des prochaines nouveautés.", cfg)
    else:
        fresh = [index[u] for u in new_urls if u in index and not index[u].get("hidden")]
        if cfg["min_score"]:
            fresh = [j for j in fresh if (j.get("score") or 0) >= cfg["min_score"]]
        state["last_new"] = len(fresh)
        if fresh:
            subject, text = alerts.build_message(fresh, total, cfg["min_score"])
            notified = alerts.notify(subject, text, cfg)
    if notified is not None:
        failed = [f"{r['channel']}: {r['error']}" for r in notified if not r["ok"]]
        if failed:
            state["last_error"] = ((state["last_error"] + " ; ") if state["last_error"] else "") + \
                "Envoi échoué — " + " ; ".join(failed)
        elif notified:
            state["last_notified"] = alerts._iso(alerts._now())
    alerts.update_state(**state)


def _scheduler_tick():
    if alerts.is_due() and not _start_refresh(notify=True):
        # rien à lancer maintenant (actualisation manuelle en cours) : on réessaiera à la minute suivante
        pass


def _scheduler_loop():
    # Au démarrage, un "running" resté à True (arrêt brutal) est remis à zéro.
    alerts.update_state(running=False)
    while True:
        try:
            _scheduler_tick()
        except Exception as e:
            print(f"[alertes] planificateur : {type(e).__name__}: {e}")
        time.sleep(60)


# --- Recherches enregistrées + actualisation ------------------------------------

@app.route("/api/searches", methods=["GET"])
def list_searches():
    alerts.migrate()
    return jsonify({"searches": searches.list_all(), "refresh": dict(_refresh)})


@app.route("/api/searches", methods=["POST"])
def add_search():
    body = request.get_json(silent=True) or {}
    item = searches.add(body.get("params") or {}, body.get("label") or "")
    return jsonify(item)


@app.route("/api/searches/<search_id>", methods=["DELETE"])
def delete_search(search_id):
    return jsonify({"deleted": searches.remove(search_id)})


@app.route("/api/refresh", methods=["GET"])
def refresh_status():
    return jsonify(dict(_refresh))


@app.route("/api/refresh", methods=["POST"])
def refresh_now():
    """Relance les recherches enregistrées (toutes, ou celles listées dans {ids})."""
    body = request.get_json(silent=True) or {}
    alerts.migrate()
    if not searches.list_all():
        return jsonify({"error": "Aucune recherche enregistrée : va dans Recherche > Enregistrer."}), 400
    mode = body.get("mode") if body.get("mode") in ("fast", "deep") else None
    if not _start_refresh(ids=body.get("ids") or None, notify=False, mode=mode):
        return jsonify({"error": "Une actualisation est déjà en cours."}), 409
    return jsonify({"started": True})


@app.route("/api/alerts", methods=["GET"])
def get_alerts():
    cfg = alerts.public_config()
    cfg["channels"] = alerts.channels_configured(alerts.get_config())
    return jsonify(cfg)


@app.route("/api/alerts", methods=["PUT"])
def put_alerts():
    try:
        cfg = alerts.update_config(request.get_json(silent=True) or {})
    except (ValueError, TypeError) as e:
        return jsonify({"error": f"Valeur invalide : {e}"}), 400
    cfg["channels"] = alerts.channels_configured(alerts.get_config())
    return jsonify(cfg)


@app.route("/api/alerts/search", methods=["PUT"])
def put_alert_search():
    """Compat : enregistre une recherche (équivaut à POST /api/searches)."""
    body = request.get_json(silent=True) or {}
    searches.add(body.get("params") or {}, body.get("label") or "")
    return jsonify(alerts.public_config())


@app.route("/api/alerts/test", methods=["POST"])
def test_alerts():
    cfg = alerts.get_config()
    if not alerts.channels_configured(cfg):
        return jsonify({"error": "Aucun canal configuré (Telegram ou e-mail)."}), 400
    results = alerts.notify("Test", "Test de Job Discovery : les alertes fonctionnent ✓", cfg)
    return jsonify({"results": results})


@app.route("/api/alerts/run", methods=["POST"])
def run_alerts_now():
    alerts.migrate()
    if not searches.list_all():
        return jsonify({"error": "Aucune recherche enregistrée : va dans Recherche > Enregistrer."}), 400
    if not _start_refresh(notify=True):
        return jsonify({"error": "Une actualisation est déjà en cours."}), 409
    return jsonify({"started": True})


@app.route("/api/search/stream")
def stream_search():
    """Server-Sent Events : le navigateur garde cette connexion ouverte et
    reçoit chaque événement (source démarrée/terminée, lot d'offres, fin)
    au fil de l'eau, sans polling."""
    q = _current_search["queue"]
    if q is None:
        return jsonify({"error": "Aucune recherche démarrée. Appelle /api/search/start d'abord."}), 400

    def generate():
        while True:
            item = q.get()
            if item is None:
                _current_search["done"] = True
                yield "event: close\ndata: {}\n\n"
                break
            yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"

    return Response(generate(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",  # évite le buffering si jamais derrière un proxy
    })


if __name__ == "__main__":
    threading.Thread(target=_scheduler_loop, daemon=True).start()
    print("Serveur local démarré sur http://localhost:5000")
    print("(Ctrl+C pour arrêter)")
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)