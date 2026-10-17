// Base de connaissances Figea : chargement des données et moteur de recherche local.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "data");

export const referentiel = JSON.parse(readFileSync(path.join(dataDir, "referentiel.json"), "utf8"));
const ecolesData = JSON.parse(readFileSync(path.join(dataDir, "ecoles.json"), "utf8"));
export const ecoles = ecolesData.ecoles;
export const avertissement = ecolesData.avertissement;

export const CATEGORIES = {
  universite_publique: "Université d'État",
  grande_ecole_publique: "Grande école / école publique",
  ipes: "IPES (privé / confessionnel)",
  formation_professionnelle: "Formation professionnelle",
};

const rangNiveau = Object.fromEntries(referentiel.niveaux.map((n) => [n.code, n.rang]));
const equivalences = Object.fromEntries(
  referentiel.series.map((s) => [s.code, [s.code, ...(s.equivalent || [])]]),
);

export function normaliser(texte = "") {
  return String(texte)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

const MOTS_VIDES = new Set(
  "je tu il elle nous vous ils le la les un une des de du d l a au aux et ou en dans pour par sur avec sans que qui quoi quel quelle quels quelles est sont suis ai as veux voudrais aimerais faire etudier etudes ecole ecoles filiere filieres cameroun mon ma mes ce cette ces se ne pas plus comment ou the of and in to i want study school".split(
    " ",
  ),
);

// Synonymes courants : un mot de la question active des mots-clés supplémentaires.
const SYNONYMES = {
  medecin: ["medecine", "sante"],
  docteur: ["medecine"],
  infirmier: ["infirmieres", "nursing", "sante"],
  infirmiere: ["infirmieres", "nursing", "sante"],
  ingenieur: ["genie", "ingenierie"],
  informaticien: ["informatique", "logiciel"],
  developpeur: ["informatique", "logiciel", "web"],
  programmation: ["informatique", "logiciel"],
  code: ["informatique", "logiciel"],
  reseau: ["reseaux", "telecoms"],
  telecom: ["telecommunications", "telecoms"],
  btp: ["genie civil", "travaux publics", "batiment"],
  construction: ["genie civil", "batiment"],
  architecte: ["architecture"],
  avocat: ["droit"],
  juge: ["magistrature", "droit"],
  magistrat: ["magistrature"],
  juriste: ["droit"],
  diplomate: ["diplomatie", "relations internationales"],
  journaliste: ["journalisme"],
  comptable: ["comptabilite"],
  banquier: ["banque"],
  commercial: ["commerce", "marketing"],
  enseignant: ["enseignement", "professeur", "instituteur"],
  professeur: ["enseignement", "professeur"],
  instituteur: ["instituteur"],
  agronome: ["agronomie", "agriculture"],
  agriculture: ["agronomie", "agriculture", "elevage"],
  veterinaire: ["veterinaire"],
  pharmacien: ["pharmacie"],
  dentiste: ["odontostomatologie"],
  mecanicien: ["mecanique"],
  electricien: ["electricite", "electrique", "electrotechnique"],
  coiffeuse: ["coiffure"],
  coiffeur: ["coiffure"],
  couturier: ["couture"],
  couturiere: ["couture"],
  cuisinier: ["cuisine", "patisserie"],
  hotel: ["hotellerie"],
  sport: ["eps", "sport"],
  artiste: ["arts"],
  mines: ["minier", "miniere", "geologie"],
  petrole: ["genie des procedes", "chimique"],
};

export function motsCles(question = "") {
  const mots = normaliser(question)
    .split(" ")
    .filter((m) => m.length > 2 && !MOTS_VIDES.has(m));
  const extra = mots.flatMap((m) => SYNONYMES[m] || []);
  return [...new Set([...mots, ...extra])];
}

// Réseaux présents partout (BTS, CFP, ENIEG…) : ne pas les exclure par un filtre de ville.
function estNational(e) {
  return /toutes|chaque|national/.test(normaliser(e.ville));
}

function texteEcole(e) {
  return normaliser([e.nom, e.sigle, e.description, e.ville, e.region, e.tutelle].join(" "));
}

function texteFiliere(f) {
  return normaliser([f.nom, f.domaine, ...(f.diplomes || [])].join(" "));
}

export function filiereCompatible(f, { niveau, serie } = {}) {
  if (niveau && rangNiveau[niveau] !== undefined) {
    const requis = rangNiveau[f.niveau] ?? 0;
    if (rangNiveau[niveau] < requis) return false;
  }
  // La série ne compte que pour les formations accessibles directement après le Bac.
  if (serie && f.niveau === "BAC" && f.series?.length && (!niveau || niveau === "BAC")) {
    const acceptees = new Set(f.series.flatMap((s) => equivalences[s] || [s]));
    const candidat = equivalences[serie] || [serie];
    if (!candidat.some((s) => acceptees.has(s))) return false;
  }
  return true;
}

/**
 * Recherche des écoles et filières correspondant à un profil et/ou une question.
 * Retourne une liste triée d'écoles avec leurs filières pertinentes.
 */
export function rechercher({ q = "", niveau, serie, domaine, ville, statut, categorie, limite = 50 } = {}) {
  const cles = motsCles(q);
  const villeN = normaliser(ville);
  const resultats = [];

  for (const e of ecoles) {
    if (statut && e.statut !== statut) continue;
    if (categorie && e.categorie !== categorie) continue;
    const tEcole = texteEcole(e);
    if (villeN && !tEcole.includes(villeN) && !estNational(e)) continue;

    let filieres = e.filieres.filter((f) => filiereCompatible(f, { niveau, serie }));
    if (domaine) filieres = filieres.filter((f) => f.domaine === domaine);
    if (!filieres.length) continue;

    let score = 0;
    if (cles.length) {
      const notees = filieres.map((f) => {
        const t = texteFiliere(f);
        const s = cles.reduce((acc, c) => acc + (t.includes(c) ? 3 : 0), 0);
        return { f, s };
      });
      const scoreEcole = cles.reduce((acc, c) => acc + (tEcole.includes(c) ? 1 : 0), 0);
      const pertinentes = notees.filter((n) => n.s > 0);
      if (!pertinentes.length && scoreEcole === 0) continue;
      if (pertinentes.length) filieres = pertinentes.sort((a, b) => b.s - a.s).map((n) => n.f);
      score = scoreEcole + pertinentes.reduce((acc, n) => acc + n.s, 0);
    }
    resultats.push({ ecole: e, filieres, score });
  }

  resultats.sort((a, b) => b.score - a.score || a.ecole.nom.localeCompare(b.ecole.nom, "fr"));
  return resultats.slice(0, limite);
}

/** Version compacte de la base pour le prompt du chatbot. */
export function baseCompacte() {
  return ecoles
    .map((e) => {
      const lignes = [
        `### ${e.nom} (${e.sigle}) [id: ${e.id}]`,
        `Type : ${CATEGORIES[e.categorie]} – ${e.statut} | Ville : ${e.ville} (${e.region}) | Tutelle : ${e.tutelle}`,
        e.description,
        `Admission : ${e.admission}`,
        `Frais : ${e.frais_indicatifs}`,
        e.site ? `Site : ${e.site}` : null,
        "Filières :",
        ...e.filieres.map(
          (f) =>
            `- ${f.nom} | ${f.domaine} | diplômes : ${f.diplomes.join(", ")} | niveau d'entrée : ${f.niveau}` +
            ` | séries : ${f.series.length ? f.series.join(", ") : "toutes"} | admission : ${f.admission} | durée : ${f.duree}`,
        ),
      ];
      return lignes.filter(Boolean).join("\n");
    })
    .join("\n\n");
}

export function libelleNiveau(code) {
  return referentiel.niveaux.find((n) => n.code === code)?.label || code;
}

export function libelleSerie(code) {
  return referentiel.series.find((s) => s.code === code)?.label || code;
}
