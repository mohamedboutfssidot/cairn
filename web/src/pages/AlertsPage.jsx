import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAlerts, saveAlerts, testAlerts, runAlertsNow } from "../api";
import { Segmented, StepSlider } from "../ui";

const FREQ = [
  { value: 6, label: "6 h" },
  { value: 12, label: "12 h" },
  { value: 24, label: "24 h" },
  { value: 48, label: "48 h" },
];
const SCORE_STEPS = [
  { value: 0, label: "Toutes" },
  { value: 45, label: "≥ 45" },
  { value: 70, label: "≥ 70" },
];

const fmt = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function AlertsPage() {
  const [cfg, setCfg] = useState(null);
  const [error, setError] = useState(null);
  const [tg, setTg] = useState({ token: "", chat_id: "" });
  const [mail, setMail] = useState({ host: "", port: 587, user: "", password: "", to: "" });
  const [msg, setMsg] = useState(null); // {type: "ok"|"error", text}

  const load = useCallback(async () => {
    try {
      const c = await fetchAlerts();
      setCfg(c);
      setError(null);
      return c;
    } catch (e) {
      setError(e.message || "Le serveur local ne répond pas.");
      return null;
    }
  }, []);

  // Première charge : remplit aussi les champs non secrets des canaux.
  useEffect(() => {
    load().then((c) => {
      if (!c) return;
      setTg((t) => ({ ...t, chat_id: c.telegram.chat_id || "" }));
      setMail((m) => ({ ...m, host: c.email.host || "", port: c.email.port || 587, user: c.email.user || "", to: c.email.to || "" }));
    });
  }, [load]);

  // Pendant une exécution, on rafraîchit l'état toutes les 4 s.
  const running = cfg?.state?.running;
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  async function patch(partial) {
    try {
      setCfg(await saveAlerts(partial));
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  }

  async function saveChannels() {
    setMsg(null);
    try {
      setCfg(await saveAlerts({ telegram: tg, email: mail }));
      setTg((t) => ({ ...t, token: "" }));
      setMail((m) => ({ ...m, password: "" }));
      setMsg({ type: "ok", text: "Canaux enregistrés." });
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  }

  async function sendTest() {
    setMsg(null);
    try {
      await saveAlerts({ telegram: tg, email: mail });
      setTg((t) => ({ ...t, token: "" }));
      setMail((m) => ({ ...m, password: "" }));
      const { results } = await testAlerts();
      const bad = results.filter((r) => !r.ok);
      setMsg(bad.length
        ? { type: "error", text: bad.map((r) => `${r.channel} : ${r.error}`).join(" — ") }
        : { type: "ok", text: `Message de test envoyé (${results.map((r) => r.channel).join(", ")}).` });
      load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  }

  async function runNow() {
    setMsg(null);
    try {
      await runAlertsNow();
      setMsg({ type: "ok", text: "Recherche lancée. Le résultat apparaîtra ici." });
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  }

  if (!cfg) {
    return (
      <div className="page page--alerts">
        <header className="page__header"><h1>Alertes</h1></header>
        {error ? <div className="page__error">{error}</div> : <div className="job-list__loading">Chargement…</div>}
      </div>
    );
  }

  const st = cfg.state;
  const list = cfg.searches || [];
  const hasSearch = list.length > 0;
  const hasChannel = cfg.channels.length > 0;

  return (
    <div className="page page--alerts">
      <header className="page__header">
        <div>
          <h1>Alertes</h1>
          <p className="page__subtitle">
            Le serveur actualise tes recherches enregistrées tout seul, met le stock à jour et te prévient des nouvelles offres. Il doit rester lancé (python server.py).
          </p>
        </div>
        <div className={`alertpill ${cfg.enabled ? "alertpill--on" : ""}`}>
          <span className="alertpill__dot" />{st.running ? "Recherche en cours" : cfg.enabled ? "Actives" : "En pause"}
        </div>
      </header>

      {error && <div className="page__error">{error}</div>}
      {msg && <div className={`alertmsg alertmsg--${msg.type}`}>{msg.text}</div>}

      <div className="profile-grid">
        <section className="sx-card">
          <h2 className="sx-card__title">1 · Recherches à actualiser</h2>
          {hasSearch ? (
            <ul className="saved-list">
              {list.map((x) => (
                <li key={x.id} className="saved-item">
                  <div className="saved-item__main">
                    <strong>{x.label}</strong>
                    <span>{x.last_run ? `${x.last_total ?? 0} offres · ${x.last_new ?? 0} nouvelles` : "jamais lancée"}</span>
                  </div>
                </li>
              ))}
              <li className="sx-note">Gère-les depuis la page <Link to="/search">Recherche</Link> (« Mes recherches »).</li>
            </ul>
          ) : (
            <p className="sx-note">
              Aucune recherche enregistrée. Configure une recherche dans <Link to="/search">Recherche</Link>, puis clique sur « ＋ Enregistrer ».
            </p>
          )}
          <button type="button" className="sx-mini sx-mini--accent alert-run" disabled={!hasSearch || st.running} onClick={runNow}>
            {st.running ? "En cours…" : "Tout actualiser et me prévenir"}
          </button>
        </section>

        <section className="sx-card">
          <h2 className="sx-card__title">2 · Quand</h2>
          <label className="visa-toggle">
            <input type="checkbox" checked={cfg.enabled} disabled={!hasSearch} onChange={(e) => patch({ enabled: e.target.checked })} />
            <span className="visa-toggle__track" aria-hidden="true"><span /></span>
            <span>Alertes automatiques {hasSearch ? "" : "(planifie d'abord une recherche)"}</span>
          </label>
          <span className="ro-label alert-label">Toutes les</span>
          <Segmented options={FREQ} value={cfg.every_hours} onChange={(every_hours) => patch({ every_hours })} ariaLabel="Fréquence" />
          <span className="ro-label alert-label">Me prévenir pour les offres</span>
          <StepSlider steps={SCORE_STEPS} value={cfg.min_score} onChange={(min_score) => patch({ min_score })} ariaLabel="Pertinence minimale" />
          <p className="sx-note">Le seuil utilise le score de ton <Link to="/profile">profil</Link>. Sans profil, toutes les nouveautés sont envoyées.</p>
        </section>

        <section className="sx-card sx-card--wide">
          <h2 className="sx-card__title">3 · Où être prévenu</h2>
          <div className="channels">
            <div className="channel">
              <h3 className="sx-card__sub">Telegram {cfg.channels.includes("telegram") && <span className="langtag">OK</span>}</h3>
              <input className="sx-input" type="password" autoComplete="off" placeholder={cfg.telegram.token_set ? "Token enregistré (laisser vide pour le garder)" : "Token du bot (BotFather)"}
                value={tg.token} onChange={(e) => setTg({ ...tg, token: e.target.value })} />
              <input className="sx-input" type="text" placeholder="Chat ID" value={tg.chat_id} onChange={(e) => setTg({ ...tg, chat_id: e.target.value })} />
              <p className="sx-note">Crée un bot avec @BotFather, écris-lui un message, puis ton Chat ID s'obtient via @userinfobot.</p>
            </div>
            <div className="channel">
              <h3 className="sx-card__sub">E-mail (SMTP) {cfg.channels.includes("email") && <span className="langtag">OK</span>}</h3>
              <div className="channel__row">
                <input className="sx-input" type="text" placeholder="Serveur (smtp.gmail.com)" value={mail.host} onChange={(e) => setMail({ ...mail, host: e.target.value })} />
                <input className="sx-input channel__port" type="number" placeholder="587" value={mail.port} onChange={(e) => setMail({ ...mail, port: e.target.value })} />
              </div>
              <input className="sx-input" type="text" autoComplete="off" placeholder="Identifiant" value={mail.user} onChange={(e) => setMail({ ...mail, user: e.target.value })} />
              <input className="sx-input" type="password" autoComplete="off" placeholder={cfg.email.password_set ? "Mot de passe enregistré (laisser vide pour le garder)" : "Mot de passe d'application"} value={mail.password} onChange={(e) => setMail({ ...mail, password: e.target.value })} />
              <input className="sx-input" type="email" placeholder="Envoyer à" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} />
            </div>
          </div>
          <div className="channel__actions">
            <button type="button" className="sx-mini" onClick={saveChannels}>Enregistrer</button>
            <button type="button" className="sx-mini sx-mini--accent" onClick={sendTest}>Enregistrer et envoyer un test</button>
          </div>
          <p className="sx-note">Les identifiants restent dans tracking.db sur ta machine et ne sont jamais renvoyés à l'interface.</p>
        </section>

        <section className="sx-card sx-card--wide">
          <h2 className="sx-card__title">Dernière exécution</h2>
          <dl className="alertstats">
            <div><dt>Dernière</dt><dd>{fmt(st.last_run)}</dd></div>
            <div><dt>Prochaine</dt><dd>{cfg.enabled && hasSearch ? fmt(st.next_run) : "—"}</dd></div>
            <div><dt>Offres</dt><dd>{st.last_total ?? "—"}</dd></div>
            <div><dt>Nouvelles</dt><dd>{st.last_new ?? "—"}</dd></div>
            <div><dt>Dernier envoi</dt><dd>{fmt(st.last_notified)}</dd></div>
          </dl>
          {st.last_error && <div className="alertmsg alertmsg--error">{st.last_error}</div>}
          {cfg.enabled && !hasChannel && <div className="alertmsg alertmsg--warn">Aucun canal configuré : les nouveautés seront repérées (badge « Nouveau ») mais aucun message ne sera envoyé.</div>}
        </section>
      </div>
    </div>
  );
}