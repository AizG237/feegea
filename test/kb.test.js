import { test } from "node:test";
import assert from "node:assert/strict";
import { ecoles, filiereCompatible, rechercher, referentiel } from "../src/kb.js";

const ids = (r) => r.map((x) => x.ecole.id);

test("les données sont cohérentes avec le référentiel", () => {
  const niveaux = new Set(referentiel.niveaux.map((n) => n.code));
  const series = new Set(referentiel.series.map((s) => s.code));
  const domaines = new Set(referentiel.domaines);
  const vus = new Set();
  for (const e of ecoles) {
    assert.ok(!vus.has(e.id), `id en double : ${e.id}`);
    vus.add(e.id);
    for (const f of e.filieres) {
      assert.ok(niveaux.has(f.niveau), `${e.id} / ${f.nom} : niveau ${f.niveau}`);
      assert.ok(domaines.has(f.domaine), `${e.id} / ${f.nom} : domaine ${f.domaine}`);
      for (const s of f.series) assert.ok(series.has(s), `${e.id} / ${f.nom} : série ${s}`);
    }
  }
});

test("un Bac A n'a pas accès à Polytechnique mais un Bac C oui", () => {
  assert.ok(!ids(rechercher({ niveau: "BAC", serie: "A" })).includes("ensp-yaounde"));
  assert.ok(ids(rechercher({ niveau: "BAC", serie: "C" })).includes("ensp-yaounde"));
});

test("le GCE A Level Science est équivalent aux séries C/D", () => {
  const f = { niveau: "BAC", series: ["C", "D"] };
  assert.ok(filiereCompatible(f, { niveau: "BAC", serie: "GCE_SCI" }));
  assert.ok(!filiereCompatible(f, { niveau: "BAC", serie: "GCE_ARTS" }));
});

test("avec le BEPC on obtient des formations professionnelles, pas l'université", () => {
  const r = rechercher({ niveau: "BEPC" });
  assert.ok(r.length > 0);
  for (const { ecole } of r) assert.notEqual(ecole.categorie, "universite_publique");
  assert.ok(ids(r).includes("cfp-agrees"));
});

test("la recherche par mot-clé trouve la médecine", () => {
  const r = rechercher({ q: "je veux devenir medecin", niveau: "BAC", serie: "D" });
  assert.ok(ids(r.slice(0, 5)).includes("fmsb-yaounde"));
});

test("le filtre ville garde les réseaux nationaux", () => {
  const r = ids(rechercher({ ville: "Douala" }));
  assert.ok(r.includes("essec-douala"));
  assert.ok(r.includes("ipes-bts-general"));
  assert.ok(!r.includes("uy1"));
});
