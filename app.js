const STORAGE_KEY = "calcolo_prodotto_prodotti_v1";
const CSV_PRODOTTI = "prodotti.csv";

const $ = (id) => document.getElementById(id);
const pagina = document.body.dataset.page;
const fmtKg = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtEuro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const fmtNum = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

let prodotti = [];
let prodottoCorrente = null;
let toastTimer = null;

const el = {
  messaggio: $("messaggio"),
  codiceInput: $("codiceInput"),
  prodottoInput: $("prodottoInput"),
  pesoInput: $("pesoInput"),
  sacchettoInput: $("sacchettoInput"),
  statoProdotto: $("statoProdotto"),
  taraImpostare: $("taraImpostare"),
  pesoNetto: $("pesoNetto"),
  prezzoApplicato: $("prezzoApplicato"),
  totaleStimato: $("totaleStimato"),
  glassatura: $("glassatura"),
  taraSacchetto: $("taraSacchetto"),
  taraEsatta: $("taraEsatta"),
  pulisciCalcolo: $("pulisciCalcolo"),
  idProdotto: $("idProdotto"),
  editCodice: $("editCodice"),
  editNome: $("editNome"),
  editGlassatura: $("editGlassatura"),
  editPrezzo: $("editPrezzo"),
  editNote: $("editNote"),
  nuovoProdotto: $("nuovoProdotto"),
  salvaProdotto: $("salvaProdotto"),
  eliminaProdotto: $("eliminaProdotto"),
  cercaProdotti: $("cercaProdotti"),
  tabellaProdotti: $("tabellaProdotti"),
  esportaProdotti: $("esportaProdotti"),
  importaProdotti: $("importaProdotti"),
  ripristinaProdotti: $("ripristinaProdotti")
};

inizializza();

async function inizializza() {
  prodotti = await caricaProdotti();
  if (pagina === "calcolo") inizializzaCalcolo();
  if (pagina === "prodotti") inizializzaProdotti();
}

function inizializzaCalcolo() {
  creaSuggerimenti(el.codiceInput, {
    min: 2,
    max: 5,
    cerca: (testo) => prodotti
      .filter((p) => p.codice && p.codice.includes(testo.trim()))
      .slice(0, 5),
    testo: (p) => `${p.codice} — ${p.nome}`,
    seleziona: (p) => selezionaProdotto(p)
  });

  creaSuggerimenti(el.prodottoInput, {
    min: 3,
    max: 5,
    cerca: (testo) => {
      const q = testo.trim().toLocaleLowerCase("it");
      return prodotti
        .filter((p) => p.nome.toLocaleLowerCase("it").includes(q))
        .slice(0, 5);
    },
    testo: (p) => p.codice ? `${p.nome} — ${p.codice}` : p.nome,
    seleziona: (p) => selezionaProdotto(p)
  });

  el.codiceInput.addEventListener("input", () => {
    const trovato = trovaPerCodice(el.codiceInput.value);
    if (trovato) selezionaProdotto(trovato, false);
    else {
      prodottoCorrente = null;
      el.prodottoInput.value = "";
      calcola();
    }
  });

  el.prodottoInput.addEventListener("input", () => {
    const trovato = trovaPerNome(el.prodottoInput.value);
    if (trovato) selezionaProdotto(trovato, false);
    else {
      prodottoCorrente = null;
      el.codiceInput.value = "";
      calcola();
    }
  });

  ["change", "input"].forEach((evento) => {
    el.pesoInput.addEventListener(evento, calcola);
    el.sacchettoInput.addEventListener(evento, calcola);
  });

  el.pulisciCalcolo.addEventListener("click", () => {
    prodottoCorrente = null;
    el.codiceInput.value = "";
    el.prodottoInput.value = "";
    el.pesoInput.value = "0.000";
    calcola();
  });

  calcola();
}

function inizializzaProdotti() {
  disegnaTabella();
  pulisciEditor();

  el.nuovoProdotto.addEventListener("click", pulisciEditor);
  el.salvaProdotto.addEventListener("click", salvaProdotto);
  el.eliminaProdotto.addEventListener("click", eliminaProdotto);
  el.cercaProdotti.addEventListener("input", disegnaTabella);
  el.esportaProdotti.addEventListener("click", esportaProdotti);
  el.importaProdotti.addEventListener("change", importaProdotti);
  el.ripristinaProdotti.addEventListener("click", ripristinaProdotti);
}

function creaSuggerimenti(input, opzioni) {
  const box = document.createElement("div");
  box.className = "suggestions";
  input.insertAdjacentElement("afterend", box);

  const chiudi = () => box.classList.remove("open");

  input.addEventListener("input", () => {
    const testo = input.value.trim();
    if (testo.length < opzioni.min) {
      chiudi();
      box.innerHTML = "";
      return;
    }

    const risultati = opzioni.cerca(testo).slice(0, opzioni.max);
    if (!risultati.length) {
      chiudi();
      box.innerHTML = "";
      return;
    }

    box.innerHTML = risultati.map((p) => `
      <button type="button" data-id="${p.id}">${escapeHtml(opzioni.testo(p))}</button>
    `).join("");
    box.classList.add("open");
  });

  box.addEventListener("click", (evento) => {
    const bottone = evento.target.closest("button[data-id]");
    if (!bottone) return;
    const prodotto = prodotti.find((p) => p.id === bottone.dataset.id);
    if (!prodotto) return;
    opzioni.seleziona(prodotto);
    chiudi();
  });

  document.addEventListener("click", (evento) => {
    if (!input.contains(evento.target) && !box.contains(evento.target)) chiudi();
  });
}

function selezionaProdotto(prodotto, aggiornaCampi = true) {
  prodottoCorrente = prodotto;
  if (aggiornaCampi) {
    el.codiceInput.value = prodotto.codice || "";
    el.prodottoInput.value = prodotto.nome || "";
  } else {
    if (document.activeElement === el.codiceInput) el.prodottoInput.value = prodotto.nome || "";
    if (document.activeElement === el.prodottoInput) el.codiceInput.value = prodotto.codice || "";
  }
  calcola();
}

async function caricaProdotti({ forzaCsv = false } = {}) {
  if (!forzaCsv) {
    try {
      const salvati = localStorage.getItem(STORAGE_KEY);
      if (salvati) return normalizzaProdotti(JSON.parse(salvati));
    } catch (errore) {}
  }

  try {
    const risposta = await fetch(CSV_PRODOTTI, { cache: "no-store" });
    if (!risposta.ok) throw new Error("CSV non disponibile");
    return normalizzaProdotti(parseCsv(await risposta.text()));
  } catch (errore) {
    mostraMessaggio("File prodotti non disponibile");
    return [];
  }
}

function salvaArchivio() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prodotti));
}

function normalizzaProdotti(lista) {
  return lista
    .filter((p) => p && p.nome)
    .map((p, indice) => ({
      id: p.id || creaId(),
      codice: String(p.codice ?? "").trim(),
      nome: String(p.nome ?? "").trim(),
      glassatura: numero(p.glassatura, 0),
      prezzo: numero(p.prezzo, 0),
      note: String(p.note ?? "").trim(),
      ordine: p.ordine ?? indice
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
}

function trovaPerCodice(codice) {
  const valore = String(codice || "").trim();
  if (!valore) return null;
  return prodotti.find((p) => p.codice === valore) || null;
}

function trovaPerNome(nome) {
  const valore = String(nome || "").trim().toLocaleLowerCase("it");
  if (!valore) return null;
  return prodotti.find((p) => p.nome.toLocaleLowerCase("it") === valore) || null;
}

function calcola() {
  const prodotto = prodottoCorrente || trovaPerCodice(el.codiceInput.value) || trovaPerNome(el.prodottoInput.value);
  const pesoBilancia = numero(el.pesoInput.value, 0);
  const taraSacchettoG = numero(el.sacchettoInput.value, 6);

  if (!prodotto) {
    impostaStato("Prodotto non selezionato");
    scriviRisultati(null);
    return;
  }

  const pesoSenzaSacchetto = Math.max(0, pesoBilancia - taraSacchettoG / 1000);
  const glassaKg = pesoSenzaSacchetto * prodotto.glassatura;
  const taraEsattaG = taraSacchettoG + glassaKg * 1000;
  const taraImpostareG = arrotondaPariSuperiore(taraEsattaG);
  const pesoNettoCassa = Math.max(0, pesoBilancia - taraImpostareG / 1000);
  const totale = pesoNettoCassa * prodotto.prezzo;

  impostaStato(prodotto.nome);
  scriviRisultati({ taraImpostareG, pesoNettoCassa, prezzo: prodotto.prezzo, totale, glassatura: prodotto.glassatura, taraSacchettoG, taraEsattaG });
}

function arrotondaPariSuperiore(valore) {
  let grammi = Math.ceil(numero(valore, 0));
  if (grammi % 2 !== 0) grammi += 1;
  return grammi;
}

function scriviRisultati(r) {
  el.taraImpostare.textContent = r ? `${r.taraImpostareG} g` : "—";
  el.pesoNetto.textContent = r ? `${fmtKg.format(r.pesoNettoCassa)} kg` : "—";
  el.prezzoApplicato.textContent = r ? `${fmtEuro.format(r.prezzo)} / kg` : "—";
  el.totaleStimato.textContent = r ? fmtEuro.format(r.totale) : "—";
  el.glassatura.textContent = r ? `${fmtNum.format(r.glassatura * 100)}%` : "—";
  el.taraSacchetto.textContent = r ? `${r.taraSacchettoG} g` : "—";
  el.taraEsatta.textContent = r ? `${fmtNum.format(r.taraEsattaG)} g` : "—";
}

function impostaStato(testo) {
  el.statoProdotto.textContent = testo;
}

function disegnaTabella() {
  const filtro = el.cercaProdotti.value.trim().toLocaleLowerCase("it");
  const righe = prodotti.filter((p) => `${p.codice} ${p.nome} ${p.note}`.toLocaleLowerCase("it").includes(filtro));

  el.tabellaProdotti.innerHTML = righe.map((p) => `
    <tr data-id="${p.id}">
      <td>${escapeHtml(p.codice || "—")}</td>
      <td>${escapeHtml(p.nome)}</td>
      <td>${fmtNum.format(p.glassatura * 100)}%</td>
      <td>${fmtEuro.format(p.prezzo)}</td>
      <td>${escapeHtml(p.note || "")}</td>
    </tr>
  `).join("");

  [...el.tabellaProdotti.querySelectorAll("tr")].forEach((riga) => {
    riga.addEventListener("click", () => {
      const prodotto = prodotti.find((p) => p.id === riga.dataset.id);
      if (!prodotto) return;
      prodottoCorrente = prodotto;
      caricaEditor(prodotto);
      evidenziaRiga(prodotto.id);
    });
  });

  evidenziaRiga(prodottoCorrente?.id || null);
}

function evidenziaRiga(id) {
  [...el.tabellaProdotti.querySelectorAll("tr")].forEach((riga) => {
    riga.classList.toggle("active", Boolean(id && riga.dataset.id === id));
  });
}

function caricaEditor(p) {
  el.idProdotto.value = p.id;
  el.editCodice.value = p.codice || "";
  el.editNome.value = p.nome || "";
  el.editGlassatura.value = p.glassatura;
  el.editPrezzo.value = p.prezzo;
  el.editNote.value = p.note || "";
  el.eliminaProdotto.disabled = false;
}

function pulisciEditor() {
  prodottoCorrente = null;
  el.idProdotto.value = "";
  el.editCodice.value = "";
  el.editNome.value = "";
  el.editGlassatura.value = "0.10";
  el.editPrezzo.value = "";
  el.editNote.value = "";
  el.eliminaProdotto.disabled = true;
  evidenziaRiga(null);
}

function salvaProdotto() {
  const nome = el.editNome.value.trim();
  if (!nome) {
    mostraMessaggio("Nome prodotto mancante");
    el.editNome.focus();
    return;
  }

  const id = el.idProdotto.value || creaId();
  const prodotto = {
    id,
    codice: el.editCodice.value.trim(),
    nome,
    glassatura: numero(el.editGlassatura.value, 0),
    prezzo: numero(el.editPrezzo.value, 0),
    note: el.editNote.value.trim()
  };

  const duplicatoCodice = prodotto.codice && prodotti.some((p) => p.id !== id && p.codice === prodotto.codice);
  if (duplicatoCodice) {
    mostraMessaggio("Codice già presente");
    el.editCodice.focus();
    return;
  }

  const duplicatoNome = prodotti.some((p) => p.id !== id && p.nome.toLocaleLowerCase("it") === prodotto.nome.toLocaleLowerCase("it"));
  if (duplicatoNome) {
    mostraMessaggio("Prodotto già presente");
    el.editNome.focus();
    return;
  }

  const indice = prodotti.findIndex((p) => p.id === id);
  if (indice >= 0) prodotti[indice] = prodotto;
  else prodotti.push(prodotto);

  prodotti = normalizzaProdotti(prodotti);
  prodottoCorrente = prodotti.find((p) => p.id === id) || prodotto;
  salvaArchivio();
  disegnaTabella();
  caricaEditor(prodottoCorrente);
  mostraMessaggio("Prodotto salvato in questo browser");
}

function eliminaProdotto() {
  const id = el.idProdotto.value;
  if (!id) return;
  const prodotto = prodotti.find((p) => p.id === id);
  if (!prodotto) return;
  if (!confirm(`Eliminare "${prodotto.nome}" da questo browser?`)) return;

  prodotti = prodotti.filter((p) => p.id !== id);
  salvaArchivio();
  pulisciEditor();
  disegnaTabella();
  mostraMessaggio("Prodotto eliminato da questo browser");
}

function esportaProdotti() {
  const blob = new Blob([creaCsv(prodotti)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "prodotti.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function importaProdotti(evento) {
  const file = evento.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const testo = String(reader.result || "");
      const lista = file.name.toLocaleLowerCase("it").endsWith(".json")
        ? JSON.parse(testo)
        : parseCsv(testo);

      prodotti = normalizzaProdotti(lista);
      salvaArchivio();
      pulisciEditor();
      disegnaTabella();
      mostraMessaggio("Prodotti importati in questo browser");
    } catch (errore) {
      mostraMessaggio("File non valido");
    } finally {
      evento.target.value = "";
    }
  };
  reader.readAsText(file);
}

async function ripristinaProdotti() {
  if (!confirm("Ripristinare i prodotti dal file CSV?")) return;
  localStorage.removeItem(STORAGE_KEY);
  prodotti = await caricaProdotti({ forzaCsv: true });
  pulisciEditor();
  disegnaTabella();
  mostraMessaggio("Prodotti ripristinati dal CSV");
}

function parseCsv(testo) {
  const righe = [];
  let campo = "";
  let riga = [];
  let dentroVirgolette = false;
  const contenuto = String(testo || "").replace(/^\uFEFF/, "");

  for (let i = 0; i < contenuto.length; i += 1) {
    const char = contenuto[i];
    const prossimo = contenuto[i + 1];

    if (char === '"' && dentroVirgolette && prossimo === '"') {
      campo += '"';
      i += 1;
    } else if (char === '"') {
      dentroVirgolette = !dentroVirgolette;
    } else if (char === "," && !dentroVirgolette) {
      riga.push(campo);
      campo = "";
    } else if ((char === "\n" || char === "\r") && !dentroVirgolette) {
      if (char === "\r" && prossimo === "\n") i += 1;
      riga.push(campo);
      if (riga.some((valore) => valore.trim() !== "")) righe.push(riga);
      campo = "";
      riga = [];
    } else {
      campo += char;
    }
  }

  riga.push(campo);
  if (riga.some((valore) => valore.trim() !== "")) righe.push(riga);
  if (righe.length < 2) return [];

  const intestazioni = righe.shift().map((h) => h.trim().toLocaleLowerCase("it"));
  return righe.map((valori, indice) => {
    const record = {};
    intestazioni.forEach((chiave, i) => record[chiave] = valori[i] ?? "");
    return {
      id: record.id || `csv_${indice + 1}`,
      codice: record.codice || "",
      nome: record.nome || record.prodotto || "",
      glassatura: normalizzaPercentuale(record.glassatura),
      prezzo: numero(record.prezzo || record["prezzo netto"] || record["prezzo netto €/kg"], 0),
      note: record.note || ""
    };
  });
}

function creaCsv(lista) {
  const intestazioni = ["codice", "nome", "glassatura", "prezzo", "note"];
  const righe = lista.map((p) => [
    p.codice || "",
    p.nome || "",
    p.glassatura ?? 0,
    p.prezzo ?? 0,
    p.note || ""
  ]);

  return [intestazioni, ...righe]
    .map((riga) => riga.map(campoCsv).join(","))
    .join("\n");
}

function campoCsv(valore) {
  const testo = String(valore ?? "");
  return /[",\n\r]/.test(testo) ? `"${testo.replaceAll('"', '""')}"` : testo;
}

function normalizzaPercentuale(valore) {
  const testo = String(valore ?? "").trim().replace("%", "").replace(",", ".");
  const n = Number(testo);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 100 : n;
}

function mostraMessaggio(testo) {
  if (!el.messaggio) return;
  clearTimeout(toastTimer);
  el.messaggio.textContent = testo;
  el.messaggio.classList.add("show");
  toastTimer = setTimeout(() => el.messaggio.classList.remove("show"), 2600);
}

function numero(valore, fallback = 0) {
  const normalizzato = String(valore ?? "").replace(",", ".");
  const n = Number(normalizzato);
  return Number.isFinite(n) ? n : fallback;
}

function creaId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(valore) {
  return String(valore ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
