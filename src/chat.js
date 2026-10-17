// Chatbot Figea : réponses générées par Claude à partir de la base de connaissances,
// avec un mode local (sans clé API) basé sur le moteur de recherche.
import Anthropic from "@anthropic-ai/sdk";
import {
  avertissement,
  baseCompacte,
  CATEGORIES,
  libelleNiveau,
  libelleSerie,
  rechercher,
  referentiel,
} from "./kb.js";

const MODEL = process.env.FIGEA_MODEL || "claude-opus-5-5";
const EFFORT = process.env.FIGEA_EFFORT || "low";
const FALLBACKS = process.env.FIGEA_FALLBACKS !== "off";

export const iaActive = Boolean(process.env.ANTHROPIC_API_KEY);
const client = iaActive ? new Anthropic() : null;

// Le prompt système est figé au démarrage : il est mis en cache par l'API (prompt caching).
const SYSTEME = `Tu es Figea, un conseiller d'orientation scolaire et universitaire pour les élèves et étudiants du Cameroun.

Ta mission : aider chaque personne à trouver les écoles et filières adaptées à son niveau (sans diplôme, CEP, BEPC, Probatoire, Bac, BTS/HND, Licence…), à sa série (A, C, D, E, TI, techniques industrielles ou tertiaires, GCE A Level Science/Arts/Commercial), à ses centres d'intérêt, à sa ville et à son budget. Tu fais connaître non seulement les grandes écoles à concours, mais aussi les universités d'État, les IPES (instituts privés d'enseignement supérieur) et les formations professionnelles (CQP, DQP, CAP, BTS, HND) qui sont souvent moins visibles.

Règles :
- Appuie-toi en priorité sur la BASE DE CONNAISSANCES ci-dessous. Cite les écoles par leur nom et leur sigle.
- Vérifie la compatibilité : niveau d'entrée requis, séries acceptées, mode d'admission (concours, dossier, test).
- Propose toujours plusieurs options : au moins une option sélective (concours) et une option plus accessible (faculté, IPES, BTS/HND ou formation professionnelle) quand elles existent.
- Si une information n'est pas dans la base (dates de concours de l'année, frais exacts, nouvelles filières), dis-le clairement et conseille de vérifier auprès de l'établissement, du MINESUP, du MINEFOP ou du MINESEC. N'invente jamais de frais, de dates ou de noms d'écoles.
- Les frais indiqués sont indicatifs ; précise-le quand tu les donnes.
- Si le profil de l'élève est incomplet et que cela change la réponse (niveau, série), pose une question courte à la fin.
- Réponds dans la langue de l'utilisateur (français par défaut, anglais si on t'écrit en anglais).
- Format : réponse claire et chaleureuse, en Markdown simple (titres courts, listes à puces, **gras**). Pas de tableaux. Reste concis : 250 mots maximum sauf si on te demande plus de détails.
- Tu ne parles que d'orientation, d'études et de formations. Pour les autres sujets, ramène poliment la conversation à l'orientation.

Avertissement sur les données : ${avertissement}

## RÉFÉRENTIEL
Diplômes :
${Object.entries(referentiel.diplomes)
  .map(([k, v]) => `- ${k} : ${v}`)
  .join("\n")}

Conseils généraux :
${referentiel.conseils_generaux.map((c) => `- ${c}`).join("\n")}

## BASE DE CONNAISSANCES (écoles et filières)
${baseCompacte()}`;

export function decrireProfil(profil = {}) {
  const parts = [];
  if (profil.niveau) parts.push(`niveau : ${libelleNiveau(profil.niveau)}`);
  if (profil.serie) parts.push(`série : ${libelleSerie(profil.serie)}`);
  if (profil.domaine) parts.push(`domaine d'intérêt : ${profil.domaine}`);
  if (profil.ville) parts.push(`ville souhaitée : ${profil.ville}`);
  if (profil.statut) parts.push(`préférence : établissement ${profil.statut}`);
  if (profil.budget) parts.push(`budget annuel : ${profil.budget}`);
  return parts.length ? parts.join(" ; ") : "non renseigné";
}

/**
 * Génère une réponse en streaming. `onTexte` reçoit chaque morceau de texte.
 * `historique` : [{ role: "user" | "assistant", content: string }], dernier message = question.
 */
export async function repondre({ historique, profil }, onTexte) {
  if (!client) return repondreLocal({ historique, profil }, onTexte);

  // Le profil est ajouté au dernier message (et non au prompt système) pour garder le cache valide.
  const messages = historique.map((m, i) =>
    i === historique.length - 1
      ? { role: "user", content: `[Profil de l'élève — ${decrireProfil(profil)}]\n\n${m.content}` }
      : m,
  );

  const params = {
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: EFFORT },
    cache_control: { type: "ephemeral" },
    system: SYSTEME,
    messages,
  };
  if (FALLBACKS) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }

  const stream = FALLBACKS ? client.beta.messages.stream(params) : client.messages.stream(params);
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      onTexte(event.delta.text);
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    onTexte("\n\nJe ne peux pas répondre à cette demande. Pose-moi plutôt une question sur ton orientation 🙂");
  }
}

// ---- Mode local (sans IA) : réponse construite à partir du moteur de recherche ----

const NIVEAU_RE = [
  [/\b(master|bac ?\+ ?5)\b/, "MASTER"],
  [/\b(licence|bachelor|bac ?\+ ?3)\b/, "LICENCE"],
  [/\b(bts|hnd|dut|bac ?\+ ?2)\b/, "BAC2"],
  [/\b(bac|baccalaureat|a level|gce a)\b/, "BAC"],
  [/\bprobatoire\b/, "PROBATOIRE"],
  [/\b(bepc|cap|o level)\b/, "BEPC"],
  [/\b(cep|fslc)\b/, "CEP"],
];

const SERIE_RE = [
  [/\b(serie|bac) ?c\b/, "C"],
  [/\b(serie|bac) ?d\b/, "D"],
  [/\b(serie|bac) ?e\b/, "E"],
  [/\b(serie|bac) ?ti\b/, "TI"],
  [/\b(serie|bac) ?a[1-5]?\b/, "A"],
  [/\b(serie|bac) ?f[1-8]?\b/, "TECH_IND"],
  [/\b(serie|bac) ?g[1-3]?\b/, "TECH_TERT"],
  [/\b(gce|a level)\b.*\bscience/, "GCE_SCI"],
  [/\b(gce|a level)\b.*\barts?\b/, "GCE_ARTS"],
];

function deviner(texte, regles) {
  const t = texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return regles.find(([re]) => re.test(t))?.[1];
}

export async function repondreLocal({ historique, profil = {} }, onTexte) {
  const question = historique[historique.length - 1]?.content || "";
  const niveau = profil.niveau || deviner(question, NIVEAU_RE);
  const serie = profil.serie || deviner(question, SERIE_RE);
  const filtre = { q: question, niveau, serie, domaine: profil.domaine, ville: profil.ville, statut: profil.statut };

  let resultats = rechercher({ ...filtre, limite: 6 });
  if (!resultats.length) resultats = rechercher({ ...filtre, q: "", limite: 6 });

  let texte = `_Mode hors-ligne : réponse générée à partir de la base Figea, sans IA._\n\n`;
  if (!resultats.length) {
    texte +=
      "Je n'ai trouvé aucune formation correspondant exactement à ce profil. Essaie d'élargir ta recherche (autre ville, autre domaine) ou précise ton niveau et ta série.";
  } else {
    texte += `Voici des établissements qui correspondent à ta recherche (profil : ${decrireProfil({ ...profil, niveau, serie })}) :\n\n`;
    for (const { ecole, filieres } of resultats) {
      texte += `### ${ecole.sigle} – ${ecole.nom}\n`;
      texte += `${CATEGORIES[ecole.categorie]} · ${ecole.ville} · Admission : ${ecole.admission}\n`;
      for (const f of filieres.slice(0, 3)) {
        texte += `- **${f.nom}** (${f.diplomes.join(", ")}, ${f.duree})\n`;
      }
      texte += `- Frais : ${ecole.frais_indicatifs}\n\n`;
    }
    texte += "Ces informations sont indicatives : vérifie toujours auprès de l'établissement avant de t'inscrire.";
  }

  // Petit effet de streaming pour garder la même expérience que le mode IA.
  for (const morceau of texte.match(/[\s\S]{1,40}/g)) {
    onTexte(morceau);
    await new Promise((r) => setTimeout(r, 10));
  }
}
