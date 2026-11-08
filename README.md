<div align="center">

# 🪨 Cairn

### Your job search, finally in one place.

**Cairn searches for jobs on your behalf, ranks them against your profile, drafts your applications and tracks every reply.**
Free · self-hosted · your data stays with you.

[Français](README.md) · **English**

[Quick start](#-quick-start-in-5-minutes) · [Features](#-what-cairn-does-for-you) · [How it works](#-how-it-works) · [FAQ](#-faq)

</div>

<!-- Add a screenshot of the Offers page here:
![Offers page](docs/offers.png)
-->

---

## The problem

Looking for a job means opening ten websites, retyping the same keywords, finding the same posting three times, forgetting who you wrote to, and rewriting a cover letter for every offer.

## The answer

**Cairn puts everything in one app.** You pick a country and the roles you want. Cairn searches the job sites, removes duplicates, scores every offer against your profile, and tells you where you stand on each application.

> No account to create. No subscription. No ads. Your offers, your CV and your notes stay on your machine.

---

## ✨ What Cairn does for you

### 🔎 It searches everywhere, for you
- **LinkedIn, Indeed and other major job sites**, **remote job sites** and **company career pages**, in a single search.
- **Two modes**: *Fast* (a few minutes) or *Thorough* (adds a very large archive of offers, slower).
- **Offers appear as they are found**, with a progress bar and a source-by-source breakdown. You can start reading before the search ends.
- **183 countries** in a dropdown, **22 fields** and **159 job titles** offered in French, English, German and Spanish: tech, finance, marketing, health, industry, legal, education, hospitality…

### 🎯 It ranks: you see what fits you first
- A **match score from 0 to 100** (Excellent, Good, Fair, Low) based on your target roles, keywords, country and remote preference, with **the reason** shown under each offer.
- **Transparent and AI-free**: clear rules, instant and free, that you can understand and adjust.
- **Duplicates removed**: the same posting found on several sites shows up once.

### 🗂️ It organises: a view by role
- The views **For you · New · Local · Remote · All**.
- The **By role** view groups your offers by searched role (or by job family) and shows for each one: how many offers, how many are new, the match distribution, the best offer, salary, level and languages.
- **Precise filters**: country, city, publication date (24 hours, 3 days, one week…), level, language, minimum salary, visa, minimum match, source site.

### ✍️ It prepares your applications
For each offer, one click gives you:
- the **gap between the posting and your profile**: the skills you have, the ones missing, and a coverage percentage;
- a **cover letter** that quotes your most relevant achievements (formal, direct or warm tone; short, standard or long);
- a **tailored CV** that highlights what the posting asks for;
- the **sending email** and the **follow-up email**.

**Cairn never makes anything up**: everything comes from your own profile. Whatever is missing is flagged, never invented. If you wish, an optional Claude API key can rewrite the texts to sound more natural.

### 📌 It tracks where you stand
A tracking board from the first look to the offer: **To review → Applied → Interview → Offer → Rejected**, with notes and **follow-up reminders** so you never forget a contact.

### 🔔 It keeps you posted
**Alerts** (Telegram, email) when new offers match your profile, and a **one-click refresh** of all your saved searches.

### 🧹 It stays clean
On every new search, **untracked offers are removed** and **the ones you track are kept**. Your list never grows out of control.

### 📱 It feels good to use
A modern interface, **light and dark**, **on desktop and mobile**, usable with the keyboard.

---

## 🔒 Privacy first

| | |
|---|---|
| **Self-hosted** | The app runs on your machine. No account, no Cairn server. |
| **Your data stays with you** | Offers, tracking, profile and CV live in a single local file: `tracking.db`. |
| **No AI required** | Scoring and documents work offline. AI is an option, with your own key. |
| **Respect for websites** | Cairn follows each site's rules (`robots.txt`). A site that refuses access is skipped, **never bypassed**. |

---

## 🚀 Quick start in 5 minutes

**What you need**: Python 3.10 or newer, and Node.js.

```bash
# 1. The engine (inside the job_discovery folder)
pip install -r requirements_server.txt
python server.py            # listens on http://localhost:5000

# 2. The interface (in a second terminal)
cd web
npm install
npm run dev                 # opens http://localhost:5173
```

On first launch, Cairn walks you through three steps: **where do you want to work**, **your CV** (optional), then **run your first search**. The first offers appear within seconds.

> **Windows**: if `vite` is not recognised, run `npm install` in the `web` folder first.

**For a built version**: `npm run build` creates the `web/dist` folder.

> The interface is currently in French.

---

## 🧭 How it works

```
        ┌──────────── Sources ─────────────┐
        │ Major sites · Remote job sites   │
        │ Career pages · Large archive     │
        └───────────────┬──────────────────┘
                        │  in parallel, offer by offer
                        ▼
              ┌───────────────────┐
              │  Search engine    │   normalises · deduplicates
              │  (Python)         │   scores every offer
              └─────────┬─────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
  Local store (SQLite)           Web interface (React)
  offers · tracking · profile    live offers · tracking
                                 application kit
```

- **One common structure**: every source converts its offers to the same format before they enter your list. Adding a source means writing a single converter.
- **Live stream**: each offer shows up as soon as it is found, and progress updates every second.
- **Fault tolerant**: if a site is down or changes its format, the search carries on with the others.

### Code layout

```
job_discovery/
├── server.py            API (Flask): search, tracking, profile, alerts
├── search_engine.py     runs the sources in parallel
├── store.py             permanent offer store (SQLite)
├── kit.py               letter, tailored CV, emails, profile/posting gap
├── schema.py            the common structure of an offer
├── config.py            settings (keywords, companies…)
├── sources/             one file per family of sources
└── web/                 the interface (React 19 + Vite)
```

---

## ❓ FAQ

**Is it really free?**
Yes. You install it yourself, with no subscription. Only the optional AI uses your own key.

**Does it need AI to work?**
No. Scoring and documents work without it, offline.

**What if I am not in tech?**
Cairn offers 22 fields (finance, marketing, health, industry, education…). Coverage outside tech depends mostly on LinkedIn and Indeed, and is better in countries Indeed supports.

**Is my data sent anywhere?**
No, except to the job sites it queries and, if you provide a key, to Anthropic to rewrite a text. Remember to back up `tracking.db`.

**Can I put it online?**
Possible with a small server, but the interface holds your CV: protect it with a password. Cloudflare Pages can only host the interface, not the Python engine.

**A site no longer returns offers. What now?**
Cairn skips it and carries on with the others. Try again later or use the other search mode.

---

## 🗺️ What's next

- A version ready to deploy on a single server, with a password.
- Export of your list and tracking.
- More sources and countries covered.
- Better automatic CV extraction.
- An English interface.

An idea, a bug, a site to add? Open an *issue* or propose an improvement.

---

## 🤝 Contributing

1. *Fork* the project.
2. Create a branch: `git checkout -b my-feature`.
3. Test, then open a *pull request* explaining the need.

To add a job source: create a file in `sources/` that returns offers in the common format, then register it in the search engine.

## Acknowledgements

Cairn builds on great open projects: [python-jobspy](https://github.com/speedyapply/JobSpy), [Flask](https://flask.palletsprojects.com), [React](https://react.dev) and [Vite](https://vite.dev), as well as the public APIs of RemoteOK, Remotive, We Work Remotely, Himalayas and Jobicy.

## License

To be defined before publishing (MIT is a common choice for an open project).

---

<div align="center">

**Cairn: one stone at a time, until your next job.** 🪨

</div>