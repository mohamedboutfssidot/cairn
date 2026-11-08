# -*- coding: utf-8 -*-
"""
Score de pertinence d'une offre par rapport au profil (0-100) + raisons.

Tout est local et explicable : pas de modèle, des règles pondérées.
    - Intitulé (30 pts) : proche d'un intitulé visé.
    - Compétences (40 pts) : "indispensables" comptent double, "appréciées"
      simple ; cherchées dans le titre, les tags et la description.
    - Lieu / télétravail (15 pts) : pays préféré, mode remote voulu.
    - Fraîcheur (10 pts) : une offre récente vaut mieux.
    - Visa (5 pts) : bonus si l'offre mentionne visa / sponsorship / relocation.
    - Mots à éviter : malus de 40 pts.
Si le profil est vide, il n'y a pas de score (None).
"""
import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone

_TAG_RE = re.compile(r"<[^>]+>")
_VISA_RE = re.compile(r"visa|sponsor|relocat|work permit|permis de travail|relocation", re.I)

_cache = {}
_CACHE_MAX = 20000


def _norm(text):
    text = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode()
    return text.lower()


def _term_re(term):
    """Terme entier (évite que "go" matche "google" ou "ai" matche "mail"),
    tolérant sur les caractères spéciaux (c++, .net, node.js)."""
    t = re.escape(_norm(term).strip())
    return re.compile(rf"(?<![a-z0-9]){t}(?![a-z0-9])")


def profile_is_empty(profile):
    return not any(profile.get(k) for k in ("titles", "must", "nice", "exclude", "countries")) \
        and profile.get("remote", "any") == "any" and not profile.get("visa")


def profile_hash(profile):
    return hashlib.sha1(json.dumps(profile, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]


class Scorer:
    def __init__(self, profile):
        self.profile = profile
        self.empty = profile_is_empty(profile)
        self.hash = profile_hash(profile)
        self.titles = [(t, _term_re(t)) for t in profile.get("titles", [])]
        self.must = [(t, _term_re(t)) for t in profile.get("must", [])]
        self.nice = [(t, _term_re(t)) for t in profile.get("nice", [])]
        self.exclude = [(t, _term_re(t)) for t in profile.get("exclude", [])]
        self.countries = {c.lower() for c in profile.get("countries", [])}

    def score(self, job):
        """-> (score 0-100, [raisons]) ou (None, [])."""
        if self.empty:
            return None, []
        url = job.get("url") or ""
        ck = (self.hash, url, job.get("title"), job.get("posted_date"))
        if url and ck in _cache:
            return _cache[ck]
        result = self._compute(job)
        if url:
            if len(_cache) > _CACHE_MAX:
                _cache.clear()
            _cache[ck] = result
        return result

    def _compute(self, job):
        p = self.profile
        reasons = []
        total, possible = 0.0, 0.0

        title = _norm(job.get("title"))
        body = _norm(
            _TAG_RE.sub(" ", job.get("description") or "") + " " + " ".join(job.get("tags") or [])
        )
        haystack = title + " " + body

        # Intitulé
        if self.titles:
            possible += 30
            best = 0.0
            hit = None
            for name, rx in self.titles:
                if rx.search(title):
                    best, hit = 1.0, name
                    break
                words = [w for w in re.findall(r"[a-z0-9+#.]+", _norm(name)) if len(w) > 2]
                if words:
                    ratio = sum(1 for w in words if re.search(rf"(?<![a-z0-9]){re.escape(w)}", title)) / len(words)
                    if ratio > best:
                        best, hit = ratio, name
            if best >= 0.5:
                total += 30 * best
                reasons.append(f"Intitulé proche de « {hit} »")

        # Compétences
        weights = [(n, rx, 2) for n, rx in self.must] + [(n, rx, 1) for n, rx in self.nice]
        if weights:
            possible += 40
            wsum = sum(w for _, _, w in weights)
            got, found, missing_must = 0, [], []
            for name, rx, w in weights:
                in_title = bool(rx.search(title))
                if in_title or rx.search(body):
                    got += w * (1.25 if in_title else 1)
                    found.append(name)
                elif w == 2:
                    missing_must.append(name)
            total += 40 * min(1.0, got / wsum)
            if found:
                reasons.append("Compétences : " + ", ".join(found[:6]))
            if missing_must:
                reasons.append("Manque : " + ", ".join(missing_must[:4]))

        # Lieu / télétravail
        loc_pts = 0
        if self.countries or p.get("remote", "any") != "any":
            possible += 15
            if p.get("remote") == "remote":
                if job.get("remote") is True:
                    loc_pts += 8
                    reasons.append("Remote")
                elif job.get("remote") is False:
                    loc_pts -= 4
            elif p.get("remote") == "onsite":
                if job.get("remote") is False:
                    loc_pts += 8
                    reasons.append("Sur site")
            else:
                loc_pts += 4
            if self.countries:
                country = (job.get("country") or "").lower()
                if country in self.countries:
                    loc_pts += 7
                    reasons.append(f"Pays : {job.get('country')}")
                elif job.get("remote") is True:
                    loc_pts += 4  # remote : le pays compte moins
            else:
                loc_pts += 4
            total += max(0, min(15, loc_pts))

        # Fraîcheur
        possible += 10
        d = (job.get("posted_date") or "")[:10]
        try:
            age = (datetime.now(timezone.utc) - datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=timezone.utc)).days
            fresh = 10 if age <= 3 else 8 if age <= 7 else 5 if age <= 14 else 3 if age <= 30 else 1
            total += fresh
            if age <= 3:
                reasons.append("Très récente")
        except ValueError:
            pass

        # Visa
        if p.get("visa"):
            possible += 5
            if _VISA_RE.search(job.get("description") or "") or _VISA_RE.search(job.get("title") or ""):
                total += 5
                reasons.append("Visa / relocation mentionnés")

        # Mots à éviter
        for name, rx in self.exclude:
            if rx.search(title) or rx.search(body):
                total -= 40
                reasons.append(f"À éviter : {name}")
                break

        score = 0 if possible == 0 else round(max(0.0, min(1.0, total / possible)) * 100)
        return score, reasons