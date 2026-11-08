# -*- coding: utf-8 -*-
"""
Alertes : recherche planifiée + notification des NOUVELLES offres.

Réglages et état stockés dans tracking.db (clé "alerts"). Les identifiants
Telegram / SMTP restent sur ta machine ; l'API ne les renvoie jamais à
l'interface (seulement "token_set": true).

Envoi : Telegram (Bot API, HTTPS) ou e-mail (SMTP). Que de la bibliothèque
standard.
"""
import json
import smtplib
import ssl
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import searches
import tracking

KEY = "alerts"

DEFAULTS = {
    "enabled": False,
    "every_hours": 12,
    "min_score": 0,          # 0 = toutes les nouvelles offres ; sinon score minimal
    "search": None,          # {"label", "params": {keywords, source_ids, location, ...}}
    "telegram": {"token": "", "chat_id": ""},
    "email": {"host": "", "port": 587, "user": "", "password": "", "to": "", "starttls": True},
    "state": {"running": False, "last_run": None, "next_run": None, "last_total": None,
              "last_new": None, "last_error": None, "last_notified": None},
}
_SECRETS = {"telegram": ("token",), "email": ("password",)}


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.isoformat(timespec="seconds")


def get_config():
    """Configuration complète (avec secrets) — usage interne uniquement."""
    saved = tracking.kv_get(KEY, {}) or {}
    cfg = json.loads(json.dumps(DEFAULTS))
    for k, v in saved.items():
        if isinstance(v, dict) and isinstance(cfg.get(k), dict):
            cfg[k].update(v)
        elif k in cfg:
            cfg[k] = v
    return cfg


def _save(cfg):
    tracking.kv_set(KEY, cfg)


def migrate():
    """Ancienne version : une seule recherche dans les alertes -> liste de recherches enregistrées."""
    cfg = get_config()
    if cfg.get("search") and not searches.list_all():
        searches.add(cfg["search"].get("params") or {}, cfg["search"].get("label") or "Recherche enregistrée")
    if cfg.get("search"):
        cfg["search"] = None
        _save(cfg)


def public_config():
    """Version pour l'interface : secrets masqués."""
    migrate()
    cfg = get_config()
    cfg["searches"] = searches.list_all()
    for section, fields in _SECRETS.items():
        for f in fields:
            cfg[section][f + "_set"] = bool(cfg[section].get(f))
            cfg[section][f] = ""
    return cfg


def update_config(data):
    """Met à jour les réglages. Un secret vide/absent = on garde l'ancien."""
    cfg = get_config()
    if "enabled" in data:
        was = cfg["enabled"]
        cfg["enabled"] = bool(data["enabled"])
        if cfg["enabled"] and not was and not cfg["state"].get("next_run"):
            cfg["state"]["next_run"] = _iso(_now())   # premier passage au prochain cycle
    if "every_hours" in data:
        cfg["every_hours"] = max(1, min(168, int(data["every_hours"] or 12)))
    if "min_score" in data:
        cfg["min_score"] = max(0, min(100, int(data["min_score"] or 0)))
    for section, fields in (("telegram", ("token", "chat_id")),
                            ("email", ("host", "port", "user", "password", "to", "starttls"))):
        incoming = data.get(section)
        if not isinstance(incoming, dict):
            continue
        for f in fields:
            if f not in incoming:
                continue
            v = incoming[f]
            if f in _SECRETS.get(section, ()) and not v:
                continue
            if f == "port":
                v = int(v or 587)
            elif f == "starttls":
                v = bool(v)
            else:
                v = str(v or "").strip()
            cfg[section][f] = v
    _save(cfg)
    return public_config()


def set_search(params, label=""):
    """Compat : enregistre la recherche dans la liste."""
    searches.add(params, label or "Recherche enregistrée")
    return public_config()


def update_state(**kw):
    cfg = get_config()
    cfg["state"].update(kw)
    _save(cfg)


def is_due(cfg=None, now=None):
    migrate()
    cfg = cfg or get_config()
    if not cfg["enabled"] or not searches.list_all() or cfg["state"].get("running"):
        return False
    nr = cfg["state"].get("next_run")
    return nr is None or (now or _now()) >= datetime.fromisoformat(nr)


def plan_next(cfg=None):
    cfg = cfg or get_config()
    return _iso(_now() + timedelta(hours=cfg["every_hours"]))


# --- Messages -----------------------------------------------------------------

def build_message(new_jobs, total, min_score=0, limit=10):
    """-> (sujet, texte brut). `new_jobs` : dicts d'offres (title, company, url,
    location, score, posted_date)."""
    # meilleurs scores d'abord, puis les plus récentes
    ranked = sorted(new_jobs, key=lambda j: str(j.get("posted_date") or ""), reverse=True)
    ranked = sorted(ranked, key=lambda j: -(j.get("score") or 0))
    n = len(new_jobs)
    subject = f"{n} nouvelle{'s' if n > 1 else ''} offre{'s' if n > 1 else ''}"
    lines = [f"{subject} sur {total} offres" + (f" (pertinence ≥ {min_score})" if min_score else "") + " :", ""]
    for j in ranked[:limit]:
        score = f" [{j['score']}]" if j.get("score") is not None else ""
        where = f" — {j['location']}" if j.get("location") else ""
        lines.append(f"• {j.get('title', '?')} · {j.get('company', '?')}{score}{where}")
        lines.append(f"  {j.get('url', '')}")
    if n > limit:
        lines += ["", f"… et {n - limit} autre{'s' if n - limit > 1 else ''} dans l'app."]
    return subject, "\n".join(lines)


# --- Envoi --------------------------------------------------------------------

def send_telegram(token, chat_id, text):
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": text[:4000], "disable_web_page_preview": True}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = json.loads(e.read().decode()).get("description", "")
        except Exception:
            pass
        raise RuntimeError(f"Telegram {e.code} {detail}".strip())
    if not body.get("ok"):
        raise RuntimeError(f"Telegram : {body.get('description', 'erreur')}")


def send_email(cfg, subject, text):
    msg = EmailMessage()
    msg["Subject"] = f"[Job Discovery] {subject}"
    msg["From"] = cfg["user"] or cfg["to"]
    msg["To"] = cfg["to"]
    msg.set_content(text)
    port = int(cfg.get("port") or 587)
    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(cfg["host"], port, context=ctx, timeout=20) as s:
            if cfg.get("user"):
                s.login(cfg["user"], cfg["password"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(cfg["host"], port, timeout=20) as s:
            if cfg.get("starttls", True):
                s.starttls(context=ctx)
            if cfg.get("user"):
                s.login(cfg["user"], cfg["password"])
            s.send_message(msg)


def channels_configured(cfg):
    out = []
    if cfg["telegram"].get("token") and cfg["telegram"].get("chat_id"):
        out.append("telegram")
    if cfg["email"].get("host") and cfg["email"].get("to"):
        out.append("email")
    return out


def notify(subject, text, cfg=None):
    """Envoie sur tous les canaux configurés. -> [{channel, ok, error}]"""
    cfg = cfg or get_config()
    results = []
    for ch in channels_configured(cfg):
        try:
            if ch == "telegram":
                send_telegram(cfg["telegram"]["token"], cfg["telegram"]["chat_id"], text)
            else:
                send_email(cfg["email"], subject, text)
            results.append({"channel": ch, "ok": True, "error": None})
        except Exception as e:  # réseau, identifiants, SMTP...
            results.append({"channel": ch, "ok": False, "error": f"{type(e).__name__}: {e}"})
    return results