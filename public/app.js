const $ = (s) => document.querySelector(s);
const STOCKAGE = "figea-profil";

let referentiel = null;
const conversation = [];

// ---------- Utilitaires ----------
function echapper(t) {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Rendu Markdown minimal et sûr (le texte est échappé avant toute mise en forme).
function markdown(src) {
  const enLigne = (t) =>
    echapper(t)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])_(.+?)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const html = [];
  let liste = null;
  const fermerListe = () => {
    if (liste) html.push(`</${liste}>`);
    liste = null;
  };
  for (const ligne of src.split("\n")) {
    const l = ligne.trimEnd();
    let m;
    if ((m = l.match(/^#{1,4}\s+(.*)/))) {
      fermerListe();
      html.push(`<h3>${enLigne(m[1])}</h3>`);
    } else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) {
      if (liste !== "ul") { fermerListe(); html.push("<ul>"); liste = "ul"; }
      html.push(`<li>${enLigne(m[1])}</li>`);
    } else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) {
      if (liste !== "ol") { fermerListe(); html.push("<ol>"); liste = "ol"; }
      html.push(`<li>${enLigne(m[1])}</li>`);
    } else if (!l.trim()) {
      fermerListe();
    } else {
      fermerListe();
      html.push(`<p>${enLigne(l)}</p>`);
    }
  }
  fermerListe();
  return html.join("");
}

function remplir(select, options) {
  for (const [valeur, label] of options) {
    const o = document.createElement("option");
    o.value = valeur;
    o.textContent = label;
    select.append(o);
  }
}

// ---------- Profil ----------
function lireProfil() {
  const data = Object.fromEntries(new FormData($("#form-profil")));
  for (const k of Object.keys(data)) if (!data[k]) delete data[k];
  return data;
}

function majResume() {
  const p = lireProfil();
  const niveau = referentiel.niveaux.find((n) => n.code === p.niveau);
  const morceaux = [niveau && niveau.label.split(" ")[0], p.serie && `série ${p.serie.replace("_", " ")}`, p.domaine, p.ville];
  $("#resume-profil").textContent = morceaux.filter(Boolean).join(" · ");
  const montrerSerie = !p.niveau || p.niveau === "BAC";
  $("#champ-serie").style.display = montrerSerie ? "" : "none";
  if (!montrerSerie) $("#serie").value = "";
  try { localStorage.setItem(STOCKAGE, JSON.stringify(lireProfil())); } catch {}
}

function restaurerProfil() {
  try {
    const p = JSON.parse(localStorage.getItem(STOCKAGE) || "{}");
    for (const [k, v] of Object.entries(p)) {
      const champ = $("#form-profil").elements[k];
      if (champ) champ.value = v;
    }
    if (Object.keys(p).length) $("#profil").open = false;
  } catch {}
}

// ---------- Chat ----------
function ajouterBulle(role, html) {
  const div = document.createElement("div");
  div.className = `bulle ${role}`;
  div.innerHTML = html;
  $("#messages").append(div);
  div.scrollIntoView({ behavior: "smooth", block: "end" });
  return div;
}

async function poser(question) {
  question = question.trim();
  if (!question) return;
  $("#suggestions").style.display = "none";
  ajouterBulle("user", `<p>${echapper(question)}</p>`);
  conversation.push({ role: "user", content: question });

  const bulle = ajouterBulle("assistant", "");
  bulle.classList.add("curseur");
  $("#envoyer").disabled = true;
  let texte = "";

  try {
    const rep = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversation, profil: lireProfil() }),
    });
    if (!rep.ok) {
      const err = await rep.json().catch(() => ({}));
      throw new Error(err.erreur || "Erreur réseau");
    }
    const lecteur = rep.body.getReader();
    const decodeur = new TextDecoder();
    let tampon = "";
    for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      tampon += decodeur.decode(value, { stream: true });
      const evenements = tampon.split("\n\n");
      tampon = evenements.pop();
      for (const ev of evenements) {
        if (!ev.startsWith("data: ")) continue;
        const data = JSON.parse(ev.slice(6));
        if (data.erreur) throw new Error(data.erreur);
        if (data.texte) {
          texte += data.texte;
          bulle.innerHTML = markdown(texte);
        }
      }
    }
    conversation.push({ role: "assistant", content: texte });
  } catch (e) {
    bulle.classList.add("erreur");
    bulle.innerHTML = `<p>${echapper(e.message)}</p>`;
    conversation.pop(); // la question pourra être reposée
  } finally {
    bulle.classList.remove("curseur");
    $("#envoyer").disabled = false;
    bulle.scrollIntoView({ behavior: "smooth", block: "end" });
  }
}

// ---------- Explorer ----------
let minuteur;
async function chercher() {
  const params = new URLSearchParams({ ...lireProfil(), q: $("#recherche").value, categorie: $("#categorie").value });
  for (const [k, v] of [...params]) if (!v) params.delete(k);
  const ecoles = await (await fetch(`/api/ecoles?${params}`)).json();
  $("#compteur").textContent = `${ecoles.length} établissement(s) / réseau(x) correspondant à ta recherche`;
  const conteneur = $("#resultats");
  conteneur.replaceChildren();
  for (const e of ecoles) {
    const carte = document.createElement("button");
    carte.className = "carte";
    const concours = e.filieres.some((f) => f.admission === "concours");
    carte.innerHTML = `
      <div><span class="badge">${echapper(referentiel.categories[e.categorie])}</span>${concours ? '<span class="badge concours">concours</span>' : ""}</div>
      <h3><span class="sigle">${echapper(e.sigle)}</span> · ${echapper(e.nom)}</h3>
      <div class="meta">📍 ${echapper(e.ville)} · ${echapper(e.statut)}</div>
      <ul>${e.filieres.slice(0, 4).map((f) => `<li>${echapper(f.nom)}</li>`).join("")}</ul>
      ${e.filieres.length > 4 ? `<div class="meta">+ ${e.filieres.length - 4} autre(s) filière(s)</div>` : ""}`;
    carte.addEventListener("click", () => ouvrirFiche(e.id));
    conteneur.append(carte);
  }
}

async function ouvrirFiche(id) {
  const e = await (await fetch(`/api/ecoles/${encodeURIComponent(id)}`)).json();
  const niveau = (c) => referentiel.niveaux.find((n) => n.code === c)?.label.split(" (")[0] || c;
  $("#fiche-contenu").innerHTML = `
    <h2>${echapper(e.nom)} (${echapper(e.sigle)})</h2>
    <p><span class="badge">${echapper(referentiel.categories[e.categorie])}</span><span class="badge">${echapper(e.statut)}</span></p>
    <p>${echapper(e.description)}</p>
    <p><strong>📍 Ville :</strong> ${echapper(e.ville)} (${echapper(e.region)})<br>
       <strong>🏛️ Tutelle :</strong> ${echapper(e.tutelle)}<br>
       <strong>📝 Admission :</strong> ${echapper(e.admission)}<br>
       <strong>💰 Frais indicatifs :</strong> ${echapper(e.frais_indicatifs)}
       ${e.site ? `<br><strong>🌐 Site :</strong> <a href="${echapper(e.site)}" target="_blank" rel="noopener">${echapper(e.site)}</a>` : ""}</p>
    <table>
      <thead><tr><th>Filière</th><th>Diplômes</th><th>Entrée</th><th>Séries</th></tr></thead>
      <tbody>${e.filieres.map((f) => `<tr>
        <td>${echapper(f.nom)}<br><small>${echapper(f.duree)} · ${echapper(f.admission)}</small></td>
        <td>${echapper(f.diplomes.join(", "))}</td>
        <td>${echapper(niveau(f.niveau))}</td>
        <td>${echapper(f.series.length ? f.series.join(", ").replaceAll("_", " ") : "Toutes")}</td></tr>`).join("")}
      </tbody>
    </table>
    ${e.verifie ? "" : "<p><small>⚠️ Fiche en cours de vérification : confirme les informations auprès de l'établissement.</small></p>"}
    <div class="actions-fiche"><button id="demander">💬 Demander conseil sur cette école</button></div>`;
  $("#demander").addEventListener("click", () => {
    $("#fiche").close();
    basculer("chat");
    poser(`Parle-moi de ${e.nom} (${e.sigle}) : est-ce adapté à mon profil, et comment y entrer ?`);
  });
  $("#fiche").showModal();
}

// ---------- Navigation ----------
function basculer(vue) {
  document.querySelectorAll(".onglet").forEach((b) => {
    const actif = b.dataset.vue === vue;
    b.classList.toggle("actif", actif);
    b.setAttribute("aria-selected", actif);
  });
  document.querySelectorAll(".vue").forEach((v) => v.classList.toggle("active", v.id === `vue-${vue}`));
  if (vue === "explorer") chercher();
}

// ---------- Initialisation ----------
async function init() {
  referentiel = await (await fetch("/api/referentiel")).json();
  remplir($("#niveau"), referentiel.niveaux.map((n) => [n.code, n.label]));
  remplir($("#serie"), referentiel.series.map((s) => [s.code, s.label]));
  remplir($("#domaine"), referentiel.domaines.map((d) => [d, d]));
  remplir($("#categorie"), Object.entries(referentiel.categories));
  const villes = ["Yaoundé", "Douala", "Dschang", "Buea", "Bamenda", "Ngaoundéré", "Maroua", "Bafoussam", "Garoua", "Bertoua", "Ebolowa", "Limbé", "Bangangté"];
  $("#villes").innerHTML = villes.map((v) => `<option value="${v}">`).join("");
  $("#avertissement").textContent = referentiel.avertissement;
  $("#mode").textContent = referentiel.ia
    ? "Réponses générées par IA à partir de la base Figea — vérifie toujours auprès des écoles."
    : "Mode hors-ligne : l'IA n'est pas configurée, les réponses viennent directement de la base Figea.";

  restaurerProfil();
  majResume();
  $("#form-profil").addEventListener("change", () => {
    majResume();
    if ($("#vue-explorer").classList.contains("active")) chercher();
  });
  $("#form-profil").addEventListener("input", () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => { majResume(); if ($("#vue-explorer").classList.contains("active")) chercher(); }, 300);
  });

  document.querySelectorAll(".onglet").forEach((b) => b.addEventListener("click", () => basculer(b.dataset.vue)));
  $("#suggestions").addEventListener("click", (e) => { if (e.target.tagName === "BUTTON") poser(e.target.textContent); });

  const zone = $("#question");
  $("#form-chat").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = zone.value;
    zone.value = "";
    zone.style.height = "";
    poser(q);
  });
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#form-chat").requestSubmit(); }
  });
  zone.addEventListener("input", () => { zone.style.height = ""; zone.style.height = `${zone.scrollHeight}px`; });

  $("#recherche").addEventListener("input", () => { clearTimeout(minuteur); minuteur = setTimeout(chercher, 250); });
  $("#categorie").addEventListener("change", chercher);
}

init();
