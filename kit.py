# -*- coding: utf-8 -*-
"""Candidature assistée : lettre, CV adapté, e-mails et écart profil/offre pour UNE offre.

Deux niveaux :
  1. `build()` : gabarits sans IA, hors ligne. Réordonne ce que tu as déjà écrit
     (compétences, expériences) selon l'offre. N'invente JAMAIS rien : tout vient
     de ta fiche candidat ; ce qui manque devient un [champ à compléter].
  2. `improve()` : réécriture par Claude (clé API facultative), avec la consigne
     stricte de ne s'appuyer que sur ta fiche candidat.
"""
import json
import re
import unicodedata
import urllib.error
import urllib.request
from datetime import date

import tracking

DEFAULT_CANDIDATE = {
    "name": "", "email": "", "phone": "", "location": "",
    "linkedin": "", "github": "", "website": "",
    "headline": "", "summary": "",
    "skills": [],
    "experiences": [],   # {role, company, period, bullets: [str]}
    "education": [],     # {degree, school, period}
    "languages": [],     # ["Français (natif)", "Anglais (C1)"]
}

# Vocabulaire technique repéré dans les offres (sert à l'écart profil/offre).
SKILL_VOCAB = [
    "python", "pytorch", "tensorflow", "keras", "scikit-learn", "pandas", "numpy", "sql", "nosql",
    "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "spark", "hadoop", "airflow", "dbt",
    "kafka", "docker", "kubernetes", "terraform", "ansible", "aws", "azure", "gcp", "linux", "git",
    "ci/cd", "mlops", "llm", "llms", "rag", "langchain", "llamaindex", "openai", "hugging face",
    "transformers", "nlp", "computer vision", "deep learning", "machine learning", "reinforcement learning",
    "generative ai", "prompt engineering", "fine-tuning", "vector database", "pinecone", "faiss",
    "fastapi", "flask", "django", "node.js", "react", "typescript", "javascript", "java", "scala",
    "go", "rust", "c++", "c#", ".net", "rest", "graphql", "microservices", "api", "mlflow",
    "data engineering", "etl", "data pipelines", "bigquery", "snowflake", "databricks", "tableau",
    "power bi", "statistics", "a/b testing", "agile", "scrum", "pyspark", "onnx", "cuda", "mt5",
]

# Compétences d'autres métiers (finance, marketing, vente, RH, santé, industrie…).
SKILL_VOCAB_EXTRA = [
    "excel", "powerpoint", "word", "sap", "erp", "crm", "salesforce", "hubspot", "jira", "confluence", "notion", "figma",
    "photoshop", "illustrator", "indesign", "premiere pro", "after effects", "canva", "seo", "sem", "google ads",
    "google analytics", "facebook ads", "linkedin ads", "email marketing", "content marketing", "social media",
    "copywriting", "community management", "brand strategy", "market research", "b2b", "b2c", "prospecting",
    "lead generation", "negotiation", "account management", "customer success", "customer service", "cold calling",
    "comptabilité", "accounting", "bookkeeping", "audit", "budgeting", "forecasting", "financial analysis",
    "financial reporting", "ifrs", "gaap", "tax", "payroll", "treasury", "risk management", "compliance", "kyc", "aml",
    "recruitment", "talent acquisition", "onboarding", "employee relations", "training", "coaching", "hris",
    "supply chain", "logistics", "procurement", "inventory", "warehouse", "lean", "six sigma", "kaizen", "iso 9001",
    "quality control", "quality assurance", "maintenance", "autocad", "solidworks", "catia", "plc", "scada", "hvac",
    "project management", "pmp", "prince2", "kanban", "stakeholder management", "change management", "business analysis",
    "process improvement", "reporting", "dashboards", "data analysis", "research", "legal research", "contract management",
    "gdpr", "rgpd", "contracts", "litigation", "nursing", "patient care", "clinical trials", "gcp", "pharmacovigilance",
    "laboratory", "pcr", "hse", "qhse", "renewable energy", "solar", "environmental", "teaching", "curriculum", "e-learning",
    "lms", "public speaking", "presentation", "communication", "leadership", "teamwork", "problem solving", "time management",
    "english", "french", "arabic", "german", "spanish", "translation", "customer relations", "event planning", "hospitality",
    "retail", "merchandising", "e-commerce", "shopify", "wordpress", "real estate",
]
_ALIASES = {"llms": "llm", "scikit learn": "scikit-learn", "sklearn": "scikit-learn", "k8s": "kubernetes",
            "js": "javascript", "ts": "typescript", "node": "node.js", "nodejs": "node.js", "ml": "machine learning",
            "ai": "machine learning", "hf": "hugging face", "postgres": "postgresql"}


# --- Fiche candidat -----------------------------------------------------------------

def _clean_list(values, limit=60):
    out, seen = [], set()
    for v in values or []:
        v = str(v).strip()
        if v and v.lower() not in seen:
            seen.add(v.lower()); out.append(v)
    return out[:limit]


def get_candidate():
    saved = tracking.kv_get("candidate", {}) or {}
    return {**DEFAULT_CANDIDATE, **{k: v for k, v in saved.items() if k in DEFAULT_CANDIDATE}}


def set_candidate(data):
    c = dict(DEFAULT_CANDIDATE)
    for k in ("name", "email", "phone", "location", "linkedin", "github", "website", "headline", "summary"):
        c[k] = str(data.get(k) or "").strip()[:2000]
    c["skills"] = _clean_list(data.get("skills"))
    c["languages"] = _clean_list(data.get("languages"), 20)
    exps = []
    for e in (data.get("experiences") or [])[:20]:
        if not isinstance(e, dict):
            continue
        role, company = str(e.get("role") or "").strip(), str(e.get("company") or "").strip()
        bullets = [b.strip() for b in (e.get("bullets") or []) if str(b).strip()][:12]
        if role or company or bullets:
            exps.append({"role": role, "company": company, "period": str(e.get("period") or "").strip(), "bullets": bullets})
    c["experiences"] = exps
    edu = []
    for e in (data.get("education") or [])[:10]:
        if isinstance(e, dict) and (str(e.get("degree") or "").strip() or str(e.get("school") or "").strip()):
            edu.append({k: str(e.get(k) or "").strip() for k in ("degree", "school", "period")})
    c["education"] = edu
    tracking.kv_set("candidate", c)
    return c


def is_empty(c):
    return not (c.get("name") or c.get("skills") or c.get("experiences"))


# --- Analyse de l'offre ------------------------------------------------------------

def _fold(text):
    """Minuscules sans accents : « Comptabilité » et « comptabilite » se retrouvent."""
    return "".join(ch for ch in unicodedata.normalize("NFD", str(text or "").lower()) if unicodedata.category(ch) != "Mn")


def _has(text, term):
    return re.search(r"(?<![\w+#.])" + re.escape(_fold(term)) + r"(?![\w+#])", _fold(text)) is not None


_REQ_HEAD = re.compile(r"(requirements?|qualifications?|must[- ]have|what you(?:'|’)ll bring|your profile|skills|profil recherch|votre profil|"
                       r"compétences|competences|vous avez|ce que nous recherchons|exigences)", re.I)


def _canon(term):
    t = term.strip().lower()
    return _ALIASES.get(t, t)


_ACRONYMS = {"sql", "aws", "gcp", "sap", "erp", "crm", "seo", "sem", "ifrs", "gaap", "kyc", "aml", "hse", "qhse", "gdpr", "rgpd", "api", "etl", "nlp", "llm",
             "rag", "ci/cd", "mlops", "hris", "lms", "plc", "scada", "hvac", "pmp", "b2b", "b2c", "cad", "ux", "ui", "dbt", "onnx", "cuda", "gcp", "pcr", "iso 9001"}


def _pretty(term, mine=()):
    """Nom affiché : ta propre graphie si tu as la compétence, sinon majuscules pour les sigles, majuscule initiale sinon."""
    for m in mine:
        if _canon(m) == _canon(term):
            return m
    t = term.strip()
    if t.lower() in _ACRONYMS:
        return t.upper()
    return t[:1].upper() + t[1:]


def term_weights(job, candidate, profile):
    """Poids de chaque compétence citée dans l'offre : fréquence + titre + section « profil recherché »."""
    title = job.get("title") or ""
    desc = job.get("description") or ""
    tags = " ".join(job.get("tags") or [])
    text = f"{title}\n{desc}\n{tags}"
    m = _REQ_HEAD.search(desc)
    req = desc[m.start():] if m else ""
    vocab = list(SKILL_VOCAB) + SKILL_VOCAB_EXTRA + list(candidate.get("skills") or []) + list(profile.get("must") or []) + list(profile.get("nice") or [])
    out, seen = {}, set()
    for term in vocab:
        c = _canon(term)
        if c in seen or len(c) < 2:
            continue
        variants = [term] + ([c] if c != term.lower() else [])
        n = max(len(re.findall(r"(?<![\w+#.])" + re.escape(_fold(v)) + r"(?![\w+#])", _fold(text))) for v in variants)
        if not n:
            continue
        seen.add(c)
        w = min(n, 4) + (3 if any(_has(title, v) for v in variants) else 0) + (1.5 if req and any(_has(req, v) for v in variants) else 0)
        out[_pretty(term, list(candidate.get('skills') or []) + list(profile.get('must') or []))] = w
    return out


def offer_terms(job, candidate, profile):
    """Compétences citées dans l'offre, de la plus importante à la moins importante."""
    w = term_weights(job, candidate, profile)
    return sorted(w, key=lambda t: -w[t])[:14]


def gap(job, candidate, profile):
    weights = term_weights(job, candidate, profile)
    terms = sorted(weights, key=lambda t: -weights[t])[:14]
    mine = {_canon(s) for s in candidate.get("skills") or []} | {_canon(s) for s in profile.get("must") or []}
    have = [t for t in terms if _canon(t) in mine]
    missing = [t for t in terms if _canon(t) not in mine]
    total = sum(weights[t] for t in terms)
    cover = round(100 * sum(weights[t] for t in have) / total) if total else None
    return {"offer": terms, "have": have, "missing": missing, "coverage": cover, "priority_missing": missing[:3], "weights": {t: weights[t] for t in terms}}


def _bullet_score(bullet, terms, weights=None):
    base = sum((weights or {}).get(t, 1) if weights else 1 for t in terms if _has(bullet, t))
    if base and re.search(r"\d", bullet):      # un résultat chiffré convainc davantage
        base += 0.5
    return base


def ranked_bullets(candidate, terms, weights=None):
    """Toutes tes réalisations, de la plus pertinente pour l'offre à la moins pertinente."""
    out = []
    for e in candidate.get("experiences") or []:
        for b in e.get("bullets") or []:
            out.append((_bullet_score(b, terms, weights), b, e))
    out.sort(key=lambda x: -x[0])
    return out


# --- Gabarits -----------------------------------------------------------------------

T = {
    "fr": {
        "subject": "Candidature – {title}",
        "hello": "Madame, Monsieur,",
        "p1": "Je souhaite vous proposer ma candidature au poste de {title} au sein de {company}.",
        "p1_head": "{headline}. ",
        "p2": "Votre annonce met en avant {terms}. {mine}",
        "p2_have": "Ces sujets font partie de mon quotidien : {have}.",
        "p2_nohave": "",
        "p3": "Concrètement : {items}",
        "item": "chez {company} ({role}), {bullet}",
        "item_nocompany": "{bullet}",
        "p4": "Je serais heureux d'échanger avec vous sur la façon dont je peux contribuer à vos projets.",
        "bye": "Cordialement,",
        "contact": "Contact",
        "summary": "Profil", "skills": "Compétences", "exp": "Expérience", "edu": "Formation", "lang": "Langues",
        "mail_body": "Bonjour,\n\nJe vous écris au sujet du poste de {title} chez {company}. Vous trouverez ci-joint ma candidature (CV et lettre de motivation).\n\n{pitch}\n\nJe reste disponible pour un échange à votre convenance.\n\nCordialement,\n{name}",
        "follow_subject": "Relance – candidature {title}",
        "follow_body": "Bonjour,\n\nJe me permets de revenir vers vous au sujet de ma candidature au poste de {title} chez {company}{when}. Je reste très motivé par ce poste et serais ravi d'échanger si votre agenda le permet.\n\nBien cordialement,\n{name}",
        "when": ", envoyée le {d}",
    },
    "en": {
        "subject": "Application – {title}",
        "hello": "Dear Hiring Team,",
        "p1": "I am writing to apply for the {title} position at {company}.",
        "p1_head": "{headline}. ",
        "p2": "Your posting highlights {terms}. {mine}",
        "p2_have": "These are part of my day-to-day work: {have}.",
        "p2_nohave": "",
        "p3": "In practice: {items}",
        "item": "at {company} ({role}), {bullet}",
        "item_nocompany": "{bullet}",
        "p4": "I would welcome the chance to discuss how I can contribute to your team.",
        "bye": "Kind regards,",
        "contact": "Contact",
        "summary": "Profile", "skills": "Skills", "exp": "Experience", "edu": "Education", "lang": "Languages",
        "mail_body": "Hello,\n\nI am writing about the {title} role at {company}. Please find my application (CV and cover letter) attached.\n\n{pitch}\n\nI am available to talk at your convenience.\n\nBest regards,\n{name}",
        "follow_subject": "Following up – {title} application",
        "follow_body": "Hello,\n\nI wanted to follow up on my application for the {title} position at {company}{when}. I remain very interested in the role and would be glad to talk if your schedule allows.\n\nBest regards,\n{name}",
        "when": ", sent on {d}",
    },
}


# Tons de la lettre (Formel par défaut = le texte historique).
TONES = {
    "fr": {
        "formal": {"hello": "Madame, Monsieur,", "p1": "Je souhaite vous proposer ma candidature au poste de {title} au sein de {company}.",
                   "p4": "Je serais heureux d'échanger avec vous sur la façon dont je peux contribuer à vos projets.", "bye": "Cordialement,"},
        "direct": {"hello": "Bonjour,", "p1": "Je candidate au poste de {title} chez {company}.",
                   "p4": "Je suis disponible pour en discuter quand vous le souhaitez.", "bye": "Bien à vous,"},
        "warm": {"hello": "Bonjour,", "p1": "Votre offre de {title} chez {company} a retenu toute mon attention et je souhaite vous proposer ma candidature.",
                 "p4": "J'aimerais beaucoup échanger avec vous et vous en dire plus sur mon parcours.", "bye": "Bien cordialement,"},
    },
    "en": {
        "formal": {"hello": "Dear Hiring Team,", "p1": "I am writing to apply for the {title} position at {company}.",
                   "p4": "I would welcome the chance to discuss how I can contribute to your team.", "bye": "Kind regards,"},
        "direct": {"hello": "Hello,", "p1": "I am applying for the {title} role at {company}.",
                   "p4": "I am available to talk whenever suits you.", "bye": "Best,"},
        "warm": {"hello": "Hello,", "p1": "Your {title} opening at {company} caught my attention and I would love to apply.",
                 "p4": "I would be glad to talk and share more about my background.", "bye": "Warm regards,"},
    },
}
LENGTH_BULLETS = {"short": 1, "standard": 2, "long": 3}


def achievements(c, terms, length="standard", picks=None, weights=None):
    """Toutes tes réalisations classées par pertinence pour l'offre ; `picked` = celles citées dans la lettre.

    Par défaut on varie les expériences citées avant de reprendre deux fois la même."""
    n = LENGTH_BULLETS.get(length, 2)
    out = []
    for score, bullet, exp in ranked_bullets(c, terms, weights):
        if bullet and bullet.strip():
            out.append({"text": bullet, "company": exp.get("company") or "", "role": exp.get("role") or "", "score": score})
    chosen, seen = set(), set()
    for i, a in enumerate(out):                      # 1re passe : la meilleure réalisation de chaque expérience
        key = (a["company"], a["role"])
        if len(chosen) < n and key not in seen and (a["score"] > 0 or not seen):
            chosen.add(i); seen.add(key)
    for i, a in enumerate(out):                      # 2e passe : complète par ordre de pertinence
        if len(chosen) < n and i not in chosen:
            chosen.add(i)
    for i, a in enumerate(out):
        a["picked"] = (a["text"] in picks) if isinstance(picks, list) else i in chosen
    return out


def _lower_first(s):
    return s[:1].lower() + s[1:] if s and not s[:2].isupper() else s


def _join(items, lang):
    items = [i for i in items if i]
    if len(items) <= 1:
        return "".join(items)
    sep = " et " if lang == "fr" else " and "
    return ", ".join(items[:-1]) + sep + items[-1]


_FR_WORDS = {"le", "la", "les", "des", "une", "vous", "nous", "pour", "avec", "dans", "est", "sur", "notre", "votre", "et", "du", "au", "aux", "poste", "expérience"}
_EN_WORDS = {"the", "and", "you", "with", "for", "our", "your", "will", "are", "to", "of", "in", "experience", "team", "we"}


def _guess_lang(text):
    words = re.findall(r"[a-zà-ÿ']+", str(text or "").lower())[:400]
    fr, en = sum(w in _FR_WORDS for w in words), sum(w in _EN_WORDS for w in words)
    return "fr" if fr > en else "en"


def _pick_lang(job, lang):
    if lang in ("fr", "en"):
        return lang
    if job.get("text_lang") in ("fr", "en"):
        return job["text_lang"]
    return _guess_lang(f"{job.get('title') or ''} {job.get('description') or ''}")


def _name(c, lang):
    return c.get("name") or ("[Ton nom]" if lang == "fr" else "[Your name]")


def build_letter(job, c, g, lang, tone="formal", length="standard", picks=None):
    t = T[lang]
    tn = TONES[lang].get(tone) or TONES[lang]["formal"]
    title, company = job.get("title") or "", job.get("company") or ""
    if company in ("", "?") or company.startswith("(slug"):
        company = "votre entreprise" if lang == "fr" else "your company"
    head = t["p1_head"].format(headline=c["headline"].rstrip(".")) if c.get("headline") and tone == "formal" else ""
    paras = [tn["hello"], head + tn["p1"].format(title=title, company=company)]
    if length == "long" and c.get("summary"):
        paras.append(c["summary"])
    if g["offer"] and length != "short":
        mine = t["p2_have"].format(have=_join(g["have"][:5], lang)) if g["have"] else ""
        paras.append(t["p2"].format(terms=_join(g["offer"][:5], lang), mine=mine).strip())
    elif g["have"] and length == "short":
        paras.append(("Mon profil correspond sur : " if lang == "fr" else "My background matches on: ") + _join(g["have"][:4], lang) + ".")
    best = [a for a in achievements(c, g["offer"], length, picks, g.get("weights")) if a["picked"]]
    if best:
        items = []
        for a in best:
            if a["company"]:
                items.append(t["item"].format(company=a["company"], role=a["role"], bullet=_lower_first(a["text"].rstrip("."))).replace("() ", "").replace(" ()", ""))
            else:
                items.append(_lower_first(a["text"].rstrip(".")))
        paras.append(t["p3"].format(items="; ".join(items)) + ".")
    elif c.get("summary"):
        paras.append(c["summary"])
    paras.append(tn["p4"])
    contact = " · ".join(x for x in (c.get("email"), c.get("phone"), c.get("linkedin")) if x)
    paras.append(f"{tn['bye']}\n{_name(c, lang)}" + (f"\n{contact}" if contact else ""))
    return "\n\n".join(paras)


def build_cv(job, c, g, lang):
    t = T[lang]
    terms = g["offer"]
    lines = [f"# {_name(c, lang)}"]
    if c.get("headline"):
        lines.append(f"**{c['headline']}**")
    contact = " · ".join(x for x in (c.get("email"), c.get("phone"), c.get("location"), c.get("linkedin"), c.get("github"), c.get("website")) if x)
    if contact:
        lines.append(contact)
    if c.get("summary"):
        lines += ["", f"## {t['summary']}", c["summary"]]
    if c.get("skills"):
        rel = lambda s: 0 if any(_canon(s) == _canon(x) for x in g["have"]) else 1
        skills = sorted(c["skills"], key=lambda s: (rel(s), -(g.get("weights") or {}).get(next((x for x in g["have"] if _canon(x) == _canon(s)), ""), 0)))[:24]
        lines += ["", f"## {t['skills']}", ", ".join(skills)]   # compétences demandées par l'offre en premier
    if c.get("experiences"):
        lines += ["", f"## {t['exp']}"]
        for e in c["experiences"]:
            head = " — ".join(x for x in (e.get("role"), e.get("company")) if x)
            lines.append(f"### {head}" + (f" ({e['period']})" if e.get("period") else ""))
            bullets = sorted(e.get("bullets") or [], key=lambda b: -_bullet_score(b, terms, g.get("weights")))   # le plus pertinent d'abord
            lines += [f"- {b}" for b in bullets[:5]]
    if c.get("education"):
        lines += ["", f"## {t['edu']}"]
        for e in c["education"]:
            lines.append("- " + " — ".join(x for x in (e.get("degree"), e.get("school")) if x) + (f" ({e['period']})" if e.get("period") else ""))
    if c.get("languages"):
        lines += ["", f"## {t['lang']}", ", ".join(c["languages"])]
    return "\n".join(lines)


def build_emails(job, c, g, lang, sent_on=None):
    t = T[lang]
    title, company = job.get("title") or "", job.get("company") or ""
    if company in ("", "?") or company.startswith("(slug"):
        company = "votre entreprise" if lang == "fr" else "your company"
    pitch = ""
    if g["have"]:
        pitch = ("Mon profil correspond notamment sur : " if lang == "fr" else "My background matches in particular on: ") + _join(g["have"][:5], lang) + "."
    when = t["when"].format(d=sent_on) if sent_on else ""
    return {
        "subject": t["subject"].format(title=title),
        "body": t["mail_body"].format(title=title, company=company, pitch=pitch, name=_name(c, lang)).replace("\n\n\n", "\n\n"),
        "follow_subject": t["follow_subject"].format(title=title),
        "follow_body": t["follow_body"].format(title=title, company=company, when=when, name=_name(c, lang)),
    }


def tips(c, g, lang):
    """Conseils concrets pour compléter la fiche (aucune invention : on ne fait que signaler ce qui manque)."""
    fr = lang == "fr"
    out = []
    if not c.get("name"):
        out.append("Ajoute ton nom dans ta fiche : il apparaît en tête du CV et en signature." if fr else "Add your name to your profile: it heads the CV and signs the letter.")
    if not (c.get("email") or c.get("phone")):
        out.append("Ajoute un e-mail ou un téléphone pour que le recruteur puisse te répondre." if fr else "Add an email or phone number so recruiters can reply.")
    if not c.get("headline"):
        out.append("Ajoute un titre court (ex. « Analyste de données ») : il ouvre la lettre." if fr else "Add a short headline: it opens the letter.")
    if len(c.get("skills") or []) < 5:
        out.append("Liste au moins 5 compétences : c'est ce que les offres cherchent en premier." if fr else "List at least 5 skills: that is what postings look for first.")
    bullets = [b for e in c.get("experiences") or [] for b in e.get("bullets") or []]
    if not bullets:
        out.append("Décris 2 ou 3 réalisations par expérience : la lettre en cite les plus pertinentes." if fr else "Describe 2-3 achievements per job: the letter quotes the most relevant.")
    elif not any(re.search(r"\d", b) for b in bullets):
        out.append("Ajoute des chiffres à tes réalisations (%, durées, volumes) : elles convainquent davantage." if fr else "Add numbers to your achievements (%, time, volume): they convince more.")
    if g.get("priority_missing"):
        m = ", ".join(g["priority_missing"])
        out.append((f"L'offre insiste sur : {m}. Si tu maîtrises ces points, ajoute-les à tes compétences ; sinon, ne les mets pas." if fr else f"The posting stresses: {m}. If you do have them, add them to your skills; if not, leave them out."))
    return out[:5]


def build(job, lang=None, sent_on=None, tone="formal", length="standard", picks=None):
    c, profile = get_candidate(), tracking.get_profile()
    lang = _pick_lang(job, lang)
    tone = tone if tone in ("formal", "direct", "warm") else "formal"
    length = length if length in LENGTH_BULLETS else "standard"
    g = gap(job, c, profile)
    mail = build_emails(job, c, g, lang, sent_on)
    return {
        "lang": lang, "tone": tone, "length": length, "empty": is_empty(c), "gap": g,
        "achievements": achievements(c, g["offer"], length, picks, g.get("weights")), "tips": tips(c, g, lang),
        "letter": build_letter(job, c, g, lang, tone, length, picks),
        "cv": build_cv(job, c, g, lang),
        "email_subject": mail["subject"], "email": mail["body"],
        "follow_subject": mail["follow_subject"], "follow": mail["follow_body"],
    }


# --- Claude (facultatif) -------------------------------------------------------------

DEFAULT_MODEL = "claude-sonnet-5-5"


def get_settings():
    s = tracking.kv_get("anthropic", {}) or {}
    return {"key": s.get("key", ""), "model": s.get("model") or DEFAULT_MODEL}


def public_settings():
    s = get_settings()
    return {"has_key": bool(s["key"]), "model": s["model"]}


def set_settings(data):
    cur = get_settings()
    if data.get("key"):
        cur["key"] = str(data["key"]).strip()
    if data.get("clear_key"):
        cur["key"] = ""
    if data.get("model"):
        cur["model"] = str(data["model"]).strip()
    tracking.kv_set("anthropic", cur)
    return public_settings()


KIND_HINT = {
    "letter": "une lettre de motivation (200 à 300 mots)",
    "cv": "un CV au format Markdown (mêmes sections que le brouillon)",
    "email": "un e-mail de candidature court",
    "follow": "un e-mail de relance court et poli",
}


def improve(kind, draft, job, lang, instruction="", opener=urllib.request.urlopen):
    """Réécriture par Claude. Lève ValueError (message lisible) en cas de problème."""
    s = get_settings()
    if not s["key"]:
        raise ValueError("Aucune clé API Claude enregistrée.")
    if kind not in KIND_HINT:
        raise ValueError("Type de document inconnu.")
    c = get_candidate()
    system = (
        "Tu aides un candidat à postuler. Tu réécris le brouillon fourni pour qu'il soit plus naturel, précis et "
        "adapté à l'offre. RÈGLES STRICTES : n'utilise que les faits présents dans la FICHE CANDIDAT ; n'invente aucune "
        "expérience, entreprise, diplôme, date, chiffre ni compétence ; si une information manque, garde un "
        "[champ à compléter]. Écris en " + ("français" if lang == "fr" else "anglais") + ". "
        "Réponds uniquement par le texte final, sans commentaire ni introduction."
    )
    user = (
        f"Document à produire : {KIND_HINT[kind]}.\n\n"
        f"OFFRE\nTitre : {job.get('title')}\nEntreprise : {job.get('company')}\nLieu : {job.get('location')}\n"
        f"Description :\n{(job.get('description') or '')[:6000]}\n\n"
        f"FICHE CANDIDAT (seule source de faits)\n{json.dumps(c, ensure_ascii=False)}\n\n"
        f"BROUILLON À AMÉLIORER\n{draft}\n"
        + (f"\nCONSIGNE SUPPLÉMENTAIRE : {instruction}\n" if instruction else "")
    )
    body = json.dumps({"model": s["model"], "max_tokens": 2000, "system": system,
                       "messages": [{"role": "user", "content": user}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
        "content-type": "application/json", "x-api-key": s["key"], "anthropic-version": "2023-06-01"})
    try:
        with opener(req, timeout=90) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = json.loads(e.read().decode()).get("error", {}).get("message", "")
        except Exception:
            pass
        if e.code in (401, 403):
            raise ValueError("Clé API refusée par Anthropic : vérifie-la.")
        raise ValueError(f"Erreur Anthropic ({e.code}) {detail}".strip())
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ValueError(f"Impossible de joindre l'API Claude : {e}")
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
    if not text:
        raise ValueError("Réponse vide de Claude.")
    return text


# --- Brouillons enregistrés ----------------------------------------------------------

def get_drafts(url):
    return tracking.kv_get("kit:" + url, {}) or {}


def set_drafts(url, drafts):
    keep = {k: str(v)[:20000] for k, v in (drafts or {}).items()
            if k in ("lang", "letter", "cv", "email_subject", "email", "follow_subject", "follow") and v is not None}
    keep["updated"] = date.today().isoformat()
    tracking.kv_set("kit:" + url, keep)
    return keep