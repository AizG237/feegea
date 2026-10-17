import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, ecoles, rechercher, referentiel, avertissement, syntheseComparaison } from "./kb.js";
import { iaActive, repondre } from "./chat.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1); // Render place l'application derrière un proxy
app.use(express.json({ limit: "64kb" }));
app.use(express.static(path.join(here, "..", "public"), { maxAge: "1h" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, ia: iaActive, ecoles: ecoles.length }));

app.get("/api/referentiel", (_req, res) =>
  res.json({ ...referentiel, categories: CATEGORIES, avertissement, ia: iaActive }),
);

app.get("/api/ecoles", (req, res) => {
  const { q, niveau, serie, domaine, ville, statut, categorie } = req.query;
  const resultats = rechercher({ q, niveau, serie, domaine, ville, statut, categorie, limite: 100 });
  res.json(resultats.map(({ ecole, filieres }) => ({ ...ecole, filieres })));
});

export const MAX_COMPARAISON = 4;

app.get("/api/comparer", (req, res) => {
  const ids = String(req.query.ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_COMPARAISON);
  const { niveau, serie } = req.query;
  const choisies = ids.map((id) => ecoles.find((e) => e.id === id)).filter(Boolean);
  if (choisies.length < 2) return res.status(400).json({ erreur: "Choisis au moins deux écoles à comparer." });
  res.json(choisies.map((e) => syntheseComparaison(e, { niveau, serie })));
});

app.get("/api/ecoles/:id", (req, res) => {
  const ecole = ecoles.find((e) => e.id === req.params.id);
  if (!ecole) return res.status(404).json({ erreur: "École introuvable" });
  res.json(ecole);
});

// Limitation simple du nombre de questions par IP pour maîtriser le coût de l'IA.
const LIMITE_PAR_HEURE = Number(process.env.FEEGEA_RATE_LIMIT || 30);
const compteurs = new Map();
function limiter(req, res, next) {
  const maintenant = Date.now();
  const c = compteurs.get(req.ip);
  if (!c || maintenant - c.debut > 3_600_000) {
    compteurs.set(req.ip, { debut: maintenant, n: 1 });
    return next();
  }
  if (++c.n > LIMITE_PAR_HEURE) {
    return res.status(429).json({ erreur: "Trop de questions en peu de temps. Réessaie dans un moment." });
  }
  next();
}
setInterval(() => {
  const seuil = Date.now() - 3_600_000;
  for (const [ip, c] of compteurs) if (c.debut < seuil) compteurs.delete(ip);
}, 600_000).unref();

app.post("/api/chat", limiter, async (req, res) => {
  const { messages, profil } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ erreur: "Aucun message reçu." });
  }
  // On garde les 12 derniers échanges, en texte simple et de taille raisonnable.
  const historique = messages
    .slice(-12)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (historique.length && historique[0].role !== "user") historique.shift();
  if (!historique.length || historique[historique.length - 1].role !== "user") {
    return res.status(400).json({ erreur: "Le dernier message doit venir de l'utilisateur." });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const envoyer = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    await repondre({ historique, profil: typeof profil === "object" && profil ? profil : {} }, (texte) =>
      envoyer({ texte }),
    );
    envoyer({ fin: true });
  } catch (err) {
    console.error("Erreur chat :", err?.status || "", err?.message || err);
    envoyer({ erreur: "Le conseiller est momentanément indisponible. Réessaie dans quelques instants." });
  }
  res.end();
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Feegea démarré sur http://localhost:${PORT} (IA ${iaActive ? "activée" : "désactivée : mode hors-ligne"})`);
});
