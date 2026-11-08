# -*- coding: utf-8 -*-
"""
Extraction de données structurées depuis une offre (titre + description + champs
de la source) : niveau, langues, visa, salaire annuel en USD.

100 % local, par règles explicables (pas de modèle). Pensé pour être prudent :
quand le texte ne permet pas de trancher, le champ reste vide (None / []) plutôt
que de deviner, pour ne pas polluer les filtres.
"""
import re
import unicodedata

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _plain(text):
    return _WS_RE.sub(" ", _TAG_RE.sub(" ", text or "")).strip()


def _norm(text):
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return text.lower()


# ------------------------------------------------------------------ niveau ---

LEVELS = ["intern", "junior", "mid", "senior", "lead", "manager"]

_LEVEL_TITLE = [
    ("manager", re.compile(r"\b(manager|director|head of|vp|vice president|chef de|responsable|directeur|directrice|leiter|leiterin|gerente)\b")),
    ("lead", re.compile(r"\b(lead|principal|staff|architect|architecte|tech lead|team lead)\b")),
    ("senior", re.compile(r"\b(senior|sr\.?|confirme|experimente|erfahren|senior)\b")),
    ("intern", re.compile(r"\b(intern|internship|stage|stagiaire|alternance|alternant|apprenti|apprentice|trainee|werkstudent|praktikum|praktikant|pfe)\b")),
    ("junior", re.compile(r"\b(junior|jr\.?|entry[- ]level|graduate|debutant|berufseinsteiger|nouveau diplome)\b")),
    ("mid", re.compile(r"\b(mid|mid[- ]level|intermediate|intermediaire)\b")),
]
_YEARS_RE = re.compile(r"(\d{1,2})\s*(?:\+|-|to|a|à|–)?\s*(?:\d{1,2})?\s*\+?\s*(?:years?|yrs?|ans|jahre|años|anos)\b(?:\s+of)?\s*(?:experience|exp|d'experience|experiencia|erfahrung)?")


def detect_level(title, description):
    t = _norm(title)
    for level, rx in _LEVEL_TITLE:
        if rx.search(t):
            return level
    d = _norm(_plain(description))[:6000]
    # "stage" / "internship" dans le corps seulement si c'est clairement le sujet
    if re.search(r"\b(this is an? internship|stage de fin d'etudes|stage de \d+ mois|internship program)\b", d):
        return "intern"
    years = [int(m.group(1)) for m in _YEARS_RE.finditer(d) if 0 < int(m.group(1)) <= 20]
    if years:
        y = min(years)
        return "junior" if y <= 2 else "mid" if y <= 5 else "senior"
    return None


# ------------------------------------------------------------------ langues ---

LANG_NAMES = {"en": "English", "fr": "Français", "de": "Deutsch", "es": "Español",
              "pt": "Português", "nl": "Nederlands", "pl": "Polski", "ar": "العربية"}

_STOP = {
    "en": "the and with for you our will are this that have from your work team experience skills about role".split(),
    "fr": "les des est une pour avec dans vous nous notre sur par qui poste equipe experience competences mission".split(),
    "de": "und die der das mit fur sie wir ihre eine auf als bei aufgaben erfahrung kenntnisse unser".split(),
    "es": "los las del una con para por que nuestro equipo experiencia puesto trabajo requisitos".split(),
    "pt": "dos das uma com para por que nossa equipe experiencia vaga trabalho requisitos voce".split(),
    "nl": "het een voor met van wij jij ons team ervaring functie werken bij je".split(),
    "pl": "oraz dla jest nasz nasza zespol doswiadczenie praca wymagania stanowisko aplikuj".split(),
}
_STOP = {k: set(v) for k, v in _STOP.items()}

_LANG_WORDS = {
    "en": r"english|anglais|englisch|ingles|inglés|inglês",
    "fr": r"french|francais|français|franzosisch|französisch|frances|francés|francês",
    "de": r"german|allemand|deutsch|alemán|aleman|alemão|alemao",
    "es": r"spanish|espagnol|spanisch|espanol|español|espanhol",
    "pt": r"portuguese|portugais|portugiesisch|portugues|português",
    "nl": r"dutch|neerlandais|néerlandais|niederlandisch|nederlands|holandes",
    "pl": r"polish|polonais|polnisch|polski|polaco",
    "ar": r"arabic|arabe|arabisch|arabic",
}
_REQ_WORDS = (r"fluent|fluency|native|proficien\w*|bilingual|bilingue|courant|maitrise|maîtrise|"
              r"required|mandatory|obligatoire|verhandlungssicher|flie[sß]end|muttersprach\w*|"
              r"business[- ]level|written and spoken|spoken|langue|language|speak|speaking")
_LANG_RX = {
    code: re.compile(rf"(?:\b(?:{_REQ_WORDS})\b[^.\n]{{0,40}}\b(?:{words})\b|\b(?:{words})\b[^.\n]{{0,40}}\b(?:{_REQ_WORDS})\b)", re.I)
    for code, words in _LANG_WORDS.items()
}


def detect_text_language(title, description):
    """Langue d'écriture de l'offre (comptage de mots-outils), None si incertain."""
    text = _norm(f"{title or ''} {_plain(description)}")[:5000]
    words = re.findall(r"[a-z]+", text)
    if len(words) < 12:
        # texte trop court : indices dans le titre brut (accents typiques)
        raw = (title or "").lower()
        if re.search(r"ingénieur|développeur|analyste|chef de|responsable|stagiaire", raw):
            return "fr"
        if re.search(r"entwickler|ingenieur|leiter|sachbearbeiter", raw):
            return "de"
        if re.search(r"desarrollador|ingeniero|analista de", raw):
            return "es"
        if re.search(r"desenvolvedor|engenheiro|programador", raw):
            return "pt"
        return None
    counts = {c: sum(1 for w in words if w in sw) for c, sw in _STOP.items()}
    best = max(counts, key=counts.get)
    ordered = sorted(counts.values(), reverse=True)
    if counts[best] < 4 or (len(ordered) > 1 and counts[best] < ordered[1] * 1.4):
        return None
    return best


def detect_languages(title, description):
    """Langues citées comme exigées (ex. « French fluent ») + langue de l'offre."""
    plain = _plain(description)
    found = []
    text_lang = detect_text_language(title, description)
    if text_lang:
        found.append(text_lang)
    hay = _norm(plain)[:8000] + " " + _norm(title or "")
    for code, rx in _LANG_RX.items():
        if code not in found and rx.search(hay):
            found.append(code)
    return found, text_lang


# --------------------------------------------------------------------- visa ---

_VISA_NO = re.compile(
    r"(no|not|without|unable to|cannot|can't|do not|does not|don't|won't|n'offrons pas|pas de|sans)\s+(?:\w+\s+){0,4}?"
    r"(visa|sponsor\w*|relocation|work permit)"
    r"|(must|should)\s+(?:\w+\s+){0,3}?(authori[sz]ed|eligible|legally|permitted|right)\s+(?:\w+\s+){0,3}?(work|live)"
    r"|right to work|work authori[sz]ation required|permis de travail requis|doit etre autorise",
    re.I,
)
_VISA_YES = re.compile(
    r"visa\s+(sponsor\w*|support|assistance|provided|available)"
    r"|sponsor\w*\s+(?:\w+\s+){0,3}?(visa|work permit|available|provided|offered)"
    r"|we\s+(?:can\s+|will\s+)?sponsor"
    r"|relocation\s+(package|assistance|support|bonus|allowance|provided|offered|budget)"
    r"|(?:help|assist)\w*\s+(?:with\s+)?(?:your\s+)?relocation"
    r"|work permit\s+(provided|support|assistance)"
    r"|prise en charge\s+(?:du|de la)\s+(visa|relocation|demenagement)"
    r"|visa\s+provided|blue card|visa-?sponsoring|aide a la relocation",
    re.I,
)


def detect_visa(title, description):
    text = _norm(f"{title or ''}. {_plain(description)}")[:12000]
    if _VISA_NO.search(text):
        return "no"
    if _VISA_YES.search(text):
        return "yes"
    return None


# ------------------------------------------------------------------ salaire ---

# Taux approximatifs vers USD : sert à comparer des ordres de grandeur, pas à convertir
# précisément. Mis à jour à la main si besoin.
USD_RATES = {"USD": 1.0, "EUR": 1.08, "GBP": 1.27, "CAD": 0.73, "AUD": 0.65, "CHF": 1.12,
             "MAD": 0.10, "INR": 0.012, "PLN": 0.25, "BRL": 0.18, "MXN": 0.055, "SGD": 0.74,
             "ARS": 0.001, "PHP": 0.017, "SEK": 0.095, "NOK": 0.093, "DKK": 0.145}
_SYMBOL_CUR = {"$": "USD", "€": "EUR", "£": "GBP", "us$": "USD", "usd": "USD", "eur": "EUR", "gbp": "GBP",
               "cad": "CAD", "aud": "AUD", "chf": "CHF", "mad": "MAD", "dh": "MAD", "dhs": "MAD", "inr": "INR",
               "pln": "PLN", "brl": "BRL", "mxn": "MXN", "sgd": "SGD", "c$": "CAD", "a$": "AUD", "₹": "INR"}

_NUM = r"\d{1,3}(?:[ ,. ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?"
_CUR = r"(?:us\$|c\$|a\$|\$|€|£|₹|usd|eur|gbp|cad|aud|chf|mad|dhs?|inr|pln|brl|mxn|sgd)"
_SAL_RX = re.compile(
    rf"(?P<c1>{_CUR})?\s?(?P<a>{_NUM})\s?(?P<ka>[kK])?\s?(?P<c2>{_CUR})?\s?(?:-|–|—|to|a|à|bis)\s?(?P<c3>{_CUR})?\s?(?P<b>{_NUM})\s?(?P<kb>[kK])?\s?(?P<c4>{_CUR})?"
    rf"(?P<tail>[^.\n]{{0,25}})",
    re.I,
)
_SAL_ONE_RX = re.compile(rf"(?P<c1>{_CUR})\s?(?P<a>{_NUM})\s?(?P<ka>[kK])?(?P<tail>[^.\n]{{0,25}})", re.I)


def _to_num(s, k=False):
    s = s.replace(" ", "").replace(" ", "")
    if re.search(r"[.,]\d{3}(?!\d)", s):          # séparateur de milliers
        s = re.sub(r"[.,](?=\d{3}(?!\d))", "", s)
    s = s.replace(",", ".")
    try:
        v = float(s)
    except ValueError:
        return None
    return v * 1000 if k else v


def _period(tail, value):
    t = _norm(tail)
    if re.search(r"/\s*h(ou)?r|per hour|hourly|par heure|/\s*heure|stunde|por hora", t):
        return "hour"
    if re.search(r"/\s*(month|mo)\b|per month|monthly|par mois|mensuel|/\s*mois|pro monat|por mes|mensal", t):
        return "month"
    if re.search(r"/\s*(day|jour)|per day|par jour|daily|tjm", t):
        return "day"
    if re.search(r"/\s*(year|yr|an)\b|per year|annual|yearly|par an|annuel|pro jahr|por ano|per annum|p\.a\.", t):
        return "year"
    return None


def _annualise(value, period):
    mult = {"hour": 2080, "day": 220, "month": 12, "year": 1}.get(period)
    if mult is None:  # période inconnue : on devine d'après l'ordre de grandeur
        mult = 2080 if value < 500 else 12 if value < 20000 else 1
    return value * mult


def _usd(value, cur):
    return value * USD_RATES.get(cur or "USD", 1.0)


def detect_salary(job):
    """-> (min_usd, max_usd, currency) annuels, ou (None, None, None)."""
    cur = (job.get("salary_currency") or "").upper() or None
    lo, hi = job.get("salary_min"), job.get("salary_max")
    vals = []
    if lo or hi:
        for v in (lo, hi):
            try:
                v = float(v)
                if v > 0:
                    vals.append(v)
            except (TypeError, ValueError):
                pass
        if vals:
            cur = cur or "USD"
            lo_v, hi_v = min(vals), max(vals)
            return _finish(_annualise(lo_v, None), _annualise(hi_v, None), cur)

    text = f"{job.get('title') or ''}. {_plain(job.get('description'))}"[:10000]
    for m in _SAL_RX.finditer(text):
        c = next((m.group(g) for g in ("c1", "c2", "c3", "c4") if m.group(g)), None)
        if not c:
            continue  # sans symbole de devise : trop ambigu (années, dates...)
        a = _to_num(m.group("a"), bool(m.group("ka")))
        b = _to_num(m.group("b"), bool(m.group("kb")) or (bool(m.group("ka")) and not m.group("kb") and False))
        if a is None or b is None:
            continue
        if m.group("ka") and not m.group("kb") and b < 1000:
            b *= 1000  # "80k-120"
        if m.group("kb") and not m.group("ka") and a < 1000:
            a *= 1000  # "80-120k" : le k vaut pour les deux bornes
        cur2 = _SYMBOL_CUR.get(c.lower(), "USD")
        period = _period(m.group("tail"), a)
        res = _finish(_annualise(min(a, b), period), _annualise(max(a, b), period), cur2)
        if res[0] is not None:
            return res
    for m in _SAL_ONE_RX.finditer(text):
        a = _to_num(m.group("a"), bool(m.group("ka")))
        if a is None:
            continue
        cur2 = _SYMBOL_CUR.get(m.group("c1").lower(), "USD")
        period = _period(m.group("tail"), a)
        if period is None and a < 1000 and not m.group("ka"):
            continue  # "$50" sans période : prix, pas salaire
        res = _finish(_annualise(a, period), _annualise(a, period), cur2)
        if res[0] is not None:
            return res
    return None, None, None


def _finish(lo, hi, cur):
    lo_u, hi_u = _usd(lo, cur), _usd(hi, cur)
    # Plausibilité : un salaire annuel hors de cette plage est presque sûrement une erreur de lecture.
    if not (6_000 <= lo_u <= 1_000_000 and 6_000 <= hi_u <= 1_000_000):
        return None, None, None
    return round(lo_u), round(hi_u), cur


# ---------------------------------------------------------------- ensemble ---

def extract(job):
    """Champs structurés d'une offre (dict) -> dict à fusionner dans l'offre."""
    langs, text_lang = detect_languages(job.get("title"), job.get("description"))
    lo, hi, cur = detect_salary(job)
    return {
        "level": detect_level(job.get("title"), job.get("description")),
        "langs": langs,
        "text_lang": text_lang,
        "visa": detect_visa(job.get("title"), job.get("description")),
        "sal_usd_min": lo,
        "sal_usd_max": hi,
        "sal_cur": cur,
    }