# Feegea 🎓 — Orientation scolaire et universitaire au Cameroun

Feegea aide les élèves et étudiants camerounais à trouver **l'école et la filière** qui leur correspondent, selon leur
**niveau** (sans diplôme, CEP, BEPC, Probatoire, Bac, BTS/HND, Licence), leur **série** (A, C, D, E, TI, techniques,
GCE A Level), leur **domaine d'intérêt**, leur **ville** et le **type d'établissement**.

Elle met en avant les grandes écoles à concours, mais aussi les universités d'État, les **IPES** et les formations
professionnelles (**CQP, DQP, CAP, BTS, HND**), souvent moins visibles.

## Fonctionnalités (MVP)

- **Conseiller (chatbot)** : questions en langage naturel, réponses générées par Claude (API Anthropic) à partir de
  la base de connaissances Feegea, en streaming. Sans clé API, un **mode hors-ligne** répond avec le moteur de recherche local.
- **Explorer** : recherche et filtres (niveau, série, domaine, ville, statut, catégorie) sur toutes les écoles, avec une fiche détaillée par établissement.
- **Comparer** : jusqu'à 4 écoles côte à côte (admission, niveau, séries, diplômes, frais, filières accessibles pour mon profil), lien partageable et avis du conseiller.
- **Profil élève** mémorisé dans le navigateur et transmis au conseiller.
- Interface mobile d'abord, mode sombre, sans étape de build.

## Lancer en local

```bash
npm install
cp .env.example .env      # puis renseigner ANTHROPIC_API_KEY (facultatif)
npm run dev               # http://localhost:3000
npm test
```

## Structure

| Chemin | Rôle |
|---|---|
| `data/ecoles.json` | Base des écoles et filières (à enrichir) |
| `data/referentiel.json` | Niveaux, séries, domaines, diplômes, conseils |
| `src/kb.js` | Chargement des données + moteur de recherche (compatibilité niveau/série) |
| `src/chat.js` | Chatbot : Claude + mode hors-ligne |
| `src/server.js` | API Express (`/api/chat`, `/api/ecoles`, `/api/comparer`, `/api/referentiel`, `/api/health`) |
| `public/` | Interface web (HTML/CSS/JS) |
| `render.yaml` | Déploiement Render (Blueprint) |

## Ajouter ou corriger une école

Éditer `data/ecoles.json` : chaque école a des `filieres` avec un `niveau` d'entrée (code du référentiel), les `series`
acceptées (liste vide = toutes), un `domaine`, des `diplomes`, un mode d'`admission` (`concours`, `dossier`, `test`, `libre`)
et une `duree`. Passer `verifie` à `true` une fois la fiche contrôlée. `npm test` vérifie la cohérence des codes.

⚠️ Les données actuelles sont une **base de démarrage** : frais, dates et filières doivent être vérifiés auprès des établissements.

## Déploiement sur Render

1. Sur [render.com](https://render.com) : **New → Blueprint**, choisir ce dépôt GitHub (le fichier `render.yaml` est détecté).
2. Renseigner la variable secrète `ANTHROPIC_API_KEY` quand Render la demande.
3. Valider : l'application est en ligne sur `https://feegea.onrender.com` (ou un nom proche).

Variables optionnelles : `FEEGEA_MODEL` (défaut `claude-opus-5-5`), `FEEGEA_EFFORT` (défaut `low`),
`FEEGEA_FALLBACKS` (`off` pour désactiver le repli automatique de modèle), `FEEGEA_RATE_LIMIT` (questions par heure et par IP, défaut 30).
