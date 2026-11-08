<div align="center">

# 🪨 Cairn

### Ta recherche d'emploi, enfin au même endroit.

**Cairn cherche les offres pour toi, les trie selon ton profil, prépare tes candidatures et suit chaque réponse.**
Gratuit · auto-hébergé · tes données restent chez toi.

[Démarrer en 5 minutes](#-démarrer-en-5-minutes) · [Fonctionnalités](#-ce-que-cairn-fait-pour-toi) · [Comment ça marche](#-comment-ça-marche) · [Questions fréquentes](#-questions-fréquentes)

</div>

<!-- Ajoute ici une capture de la page « Offres » : docs/offres.png -->

---

## Le problème

Chercher un emploi, c'est ouvrir dix sites, retaper les mêmes mots-clés, retrouver la même annonce trois fois, oublier à qui on a écrit, et réécrire une lettre de motivation à chaque offre.

## La réponse

**Cairn rassemble tout dans une seule application.** Tu choisis un pays et les postes qui t'intéressent. Cairn interroge les sites d'emploi, supprime les doublons, note chaque offre selon ton profil, et te dit où tu en es dans chaque candidature.

> Pas de compte à créer. Pas d'abonnement. Pas de publicité. Tes offres, ton CV et tes notes restent sur ta machine.

---

## ✨ Ce que Cairn fait pour toi

### 🔎 Il cherche, partout, pour toi
- **LinkedIn, Indeed et d'autres grands sites d'emploi**, les **sites d'emploi à distance** et les **pages carrières d'entreprises**, en une seule recherche.
- **Deux modes au choix** : *Rapide* (quelques minutes) ou *Approfondie* (en plus, une très grande archive d'offres, plus longue).
- **Les offres apparaissent au fur et à mesure** dans ta liste, avec une barre de progression et le détail source par source. Tu n'attends pas la fin pour commencer à lire.
- **183 pays** dans une liste déroulante, **22 domaines** et **159 métiers** proposés en français, anglais, allemand et espagnol : tech, finance, marketing, santé, industrie, juridique, éducation, hôtellerie…

### 🎯 Il trie : tu vois d'abord ce qui te correspond
- Un **score de compatibilité de 0 à 100** (Excellente, Bonne, Moyenne, Faible) calculé selon tes postes visés, tes mots-clés, ton pays et ton télétravail, avec **la raison** affichée sous chaque offre.
- **Calcul transparent, sans IA** : des règles claires, instantanées, gratuites, que tu peux comprendre et ajuster.
- **Doublons supprimés** : la même annonce trouvée sur plusieurs sites n'apparaît qu'une fois.

### 🗂️ Il organise : une vue par poste
- Les vues **Pour toi · Nouvelles · Local · Remote · Toutes**.
- La vue **Par poste** regroupe tes offres par poste recherché (ou par famille de métiers) et te montre pour chacun : combien d'offres, combien de nouvelles, la répartition des compatibilités, la meilleure offre, le salaire, le niveau et les langues.
- **Filtres précis** : pays, ville, date de publication (24 h, 3 jours, une semaine…), niveau, langue, salaire minimum, visa, compatibilité minimale, site d'origine.

### ✍️ Il prépare tes candidatures
Pour chaque offre, un clic suffit pour obtenir :
- l'**écart entre l'offre et ton profil** : les compétences que tu as, celles qui manquent, et un pourcentage de couverture ;
- une **lettre de motivation** qui cite tes réalisations les plus pertinentes (ton formel, direct ou chaleureux ; court, standard ou long) ;
- un **CV adapté** qui met en avant ce que l'offre demande ;
- l'**e-mail d'envoi** et l'**e-mail de relance**.

**Cairn n'invente rien** : tout vient de ta fiche. Ce qui manque est signalé, jamais inventé. Et si tu le souhaites, une clé API Claude (facultative) permet de réécrire les textes plus naturellement.

### 📌 Il suit où tu en es
Un tableau de suivi du premier coup d'œil à l'offre : **À voir → Postulé → Entretien → Offre → Refusé**, avec notes et **rappels de relance** pour ne plus jamais oublier un contact.

### 🔔 Il te prévient
Des **alertes** (Telegram, e-mail) quand de nouvelles offres correspondent à ton profil, et une **actualisation en un clic** de toutes tes recherches enregistrées.

### 🧹 Il reste propre
À chaque nouvelle recherche, **les offres non suivies sont retirées** et **celles que tu suis sont conservées**. Ta liste ne grossit pas indéfiniment.

### 📱 Il est agréable
Interface moderne en français, **clair et sombre**, **sur ordinateur et sur mobile**, navigable au clavier.

---

## 🔒 Ta vie privée d'abord

| | |
|---|---|
| **Auto-hébergé** | L'application tourne sur ta machine. Aucun compte, aucun serveur Cairn. |
| **Tes données chez toi** | Offres, suivi, profil et CV sont dans un seul fichier local : `tracking.db`. |
| **Aucune IA obligatoire** | Le score et les documents fonctionnent hors ligne. L'IA est une option, avec ta propre clé. |
| **Respect des sites** | Cairn respecte les règles de chaque site (`robots.txt`). Un site qui refuse l'accès est ignoré, **jamais contourné**. |

---

## 🚀 Démarrer en 5 minutes

**Ce qu'il te faut** : Python 3.10 ou plus récent, et Node.js.

```bash
# 1. Le moteur (dans le dossier job_discovery)
pip install -r requirements_server.txt
python server.py            # écoute sur http://localhost:5000

# 2. L'interface (dans un second terminal)
cd web
npm install
npm run dev                 # ouvre http://localhost:5173
```

Au premier lancement, Cairn te guide en trois étapes : **où veux-tu travailler**, **ton CV** (facultatif) puis **lancer la première recherche**. Les premières offres s'affichent en quelques secondes.

> **Windows** : si `vite` n'est pas reconnu, lance d'abord `npm install` dans le dossier `web`.

**Pour une version compilée** : `npm run build` crée le dossier `web/dist`.

---

## 🧭 Comment ça marche

```
        ┌──────────── Sources ─────────────┐
        │ Grands sites · Sites à distance  │
        │ Pages carrières · Grande archive │
        └───────────────┬──────────────────┘
                        │  en parallèle, offre par offre
                        ▼
              ┌───────────────────┐
              │  Moteur de        │   normalise · déduplique
              │  recherche (Python)│  note chaque offre
              └─────────┬─────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
  Stock local (SQLite)          Interface web (React)
  offres · suivi · profil       offres en direct · suivi
                                kit de candidature
```

- **Une structure commune** : chaque source convertit ses offres au même format avant qu'elles entrent dans ta liste. Ajouter une source, c'est écrire un seul convertisseur.
- **Flux en direct** : chaque offre trouvée s'affiche tout de suite, la progression est mise à jour chaque seconde.
- **Tolérant aux pannes** : si un site est en panne ou change de format, la recherche continue avec les autres.

### Organisation du code

```
job_discovery/
├── server.py            API (Flask) : recherche, suivi, profil, alertes
├── search_engine.py     lance les sources en parallèle
├── store.py             stock permanent d'offres (SQLite)
├── kit.py               lettre, CV adapté, e-mails, écart profil/offre
├── schema.py            la structure commune d'une offre
├── config.py            réglages (mots-clés, entreprises…)
├── sources/             un fichier par famille de sources
└── web/                 l'interface (React 19 + Vite)
```

---

## ❓ Questions fréquentes

**Est-ce vraiment gratuit ?**
Oui. Tu l'installes toi-même, sans abonnement. Seule l'IA facultative utilise ta propre clé.

**Faut-il de l'IA pour que ça marche ?**
Non. Le tri et les documents fonctionnent sans, hors ligne.

**Et si je ne suis pas dans la tech ?**
Cairn propose 22 domaines (finance, marketing, santé, industrie, éducation…). La couverture hors tech dépend surtout de LinkedIn et d'Indeed ; elle est meilleure dans les pays gérés par Indeed.

**Mes données sont-elles envoyées quelque part ?**
Non, sauf vers les sites d'emploi interrogés et, si tu renseignes une clé, vers Anthropic pour réécrire un texte. Pense à sauvegarder `tracking.db`.

**Puis-je le mettre en ligne ?**
Possible avec un petit serveur, mais l'interface contient ton CV : protège-la par un mot de passe. Cloudflare Pages ne peut héberger que l'interface, pas le moteur Python.

**Un site ne renvoie plus d'offres, que faire ?**
Cairn l'ignore et continue avec les autres. Relance plus tard ou utilise l'autre mode de recherche.

---

## 🗺️ Prochaines étapes

- Version prête à déployer sur un seul serveur, avec mot de passe.
- Export de ta liste et de ton suivi.
- Plus de sources et de pays couverts.
- Meilleure extraction automatique du CV.

Une idée, un bug, un site à ajouter ? Ouvre une *issue* ou propose une amélioration.

---

## 🤝 Contribuer

1. Fais un *fork* du projet.
2. Crée une branche : `git checkout -b ma-fonctionnalite`.
3. Teste, puis ouvre une *pull request* en expliquant le besoin.

Ajouter une source d'offres : crée un fichier dans `sources/` qui renvoie des offres au format commun, puis déclare-le dans le moteur de recherche.

## Remerciements

Cairn s'appuie sur de superbes projets ouverts : [python-jobspy](https://github.com/speedyapply/JobSpy), [Flask](https://flask.palletsprojects.com), [React](https://react.dev) et [Vite](https://vite.dev), ainsi que les API publiques de RemoteOK, Remotive, We Work Remotely, Himalayas et Jobicy.

## Licence

À définir avant publication (MIT est un choix courant pour un projet ouvert).

---

<div align="center">

**Cairn : une pierre après l'autre, jusqu'au prochain poste.** 🪨

</div>