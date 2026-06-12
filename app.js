const STORAGE_KEY = "calcolo_prodotto_prodotti_v1";
const CSV_PRODOTTI = "prodotti.csv";

// Configurazione rapida
const SELEZIONA_PESO_AL_FOCUS = true;
const USA_BOTTONI_SACCHETTO = true;
const USA_FLUSSO_RAPIDO_CASSA = true;
const NUOVO_ARTICOLO_DOPPIO_TAP = true;
const SACCHETTI = [
  { valore: 6, etichetta: "Piccolo" },
  { valore: 12, etichetta: "Grande" }
];

const CSV_FALLBACK = "";

const $ = (id) => document.getElementById(id);
const pagina = document.body.dataset.page;
const fmtKg = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtEuro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const fmtNum = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

let prodotti = [];
let prodottoCorrente = null;
let toastTimer = null;
let editorSbloccato = false;
let editorDirty = false;
let confermaNuovoArticoloTimer = null;

const el = {
  messaggio: $("messaggio"),
  codiceInput: $("codiceInput"),
  prodottoInput: $("prodottoInput"),
  pesoInput: $("pesoInput"),
  sacchettoInput: $("sacchettoInput"),
  sacchettoButtons: $("sacchettoButtons"),
  statoProdotto: $("statoProdotto"),
  taraImpostare: $("taraImpostare"),
  pesoNetto: $("pesoNetto"),
  prezzoApplicato: $("prezzoApplicato"),
  totaleStimato: $("totaleStimato"),
  glassatura: $("glassatura"),
  taraSacchetto: $("taraSacchetto"),
  taraEsatta: $("taraEsatta"),
  pulisciCalcolo: $("pulisciCalcolo"),
  nuovoArticoloMobile: $("nuovoArticoloMobile"),
  idProdotto: $("idProdotto"),
  editCodice: $("editCodice"),
  editNome: $("editNome"),
  editGlassatura: $("editGlassatura"),
  editPrezzo: $("editPrezzo"),
  editNote: $("editNote"),
  nuovoProdotto: $("nuovoProdotto"),
  modificaProdotto: $("modificaProdotto"),
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
  inizializzaPesoRapido();
  inizializzaSacchettoRapido();

  creaSuggerimenti(el.codiceInput, {
    min: 2,
    max: 5,
    cerca: (testo) => prodotti
      .filter((p) => p.codice && p.codice.includes(testo.trim()))
      .slice(0, 5),
    testo: (p) => `${p.codice} — ${p.nome}`,
    render: (p) => renderSuggerimento(p, "codice"),
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
    render: (p) => renderSuggerimento(p, "nome"),
    seleziona: (p) => selezionaProdotto(p)
  });

  el.codiceInput.addEventListener("input", () => {
    const valore = el.codiceInput.value.trim();
    const trovato = trovaPerCodice(valore);

    // Non selezionare automaticamente un codice esatto se esistono codici più lunghi
    // che iniziano nello stesso modo. Esempio: digitando 25 deve restare possibile
    // scegliere 250 senza che venga confermato subito il prodotto 25.
    if (trovato && !haCodiciPiuLunghi(valore)) {
      chiudiTuttiSuggerimenti();
      selezionaProdotto(trovato, false);
    } else {
      prodottoCorrente = null;
      el.prodottoInput.value = "";
      calcola();
    }
  });

  el.prodottoInput.addEventListener("input", () => {
    const trovato = trovaPerNome(el.prodottoInput.value);
    if (trovato) {
      chiudiTuttiSuggerimenti();
      selezionaProdotto(trovato, false);
    } else {
      prodottoCorrente = null;
      el.codiceInput.value = "";
      calcola();
    }
  });

  ["change", "input"].forEach((evento) => {
    el.pesoInput.addEventListener(evento, calcola);
    el.sacchettoInput.addEventListener(evento, calcola);
  });

  el.pulisciCalcolo.addEventListener("click", pulisciCalcoloRapido);
  if (el.nuovoArticoloMobile) el.nuovoArticoloMobile.addEventListener("click", gestisciNuovoArticoloMobile);

  inizializzaFlussoRapidoCassa();
  calcola();
}

function ciSonoDatiCalcolo() {
  return Boolean(
    prodottoCorrente ||
    el.codiceInput?.value.trim() ||
    el.prodottoInput?.value.trim() ||
    Number.parseFloat(String(el.pesoInput?.value || "0")) > 0
  );
}

function gestisciNuovoArticoloMobile() {
  if (!NUOVO_ARTICOLO_DOPPIO_TAP || !ciSonoDatiCalcolo()) {
    pulisciCalcoloRapido();
    return;
  }

  if (el.nuovoArticoloMobile?.dataset.conferma === "1") {
    pulisciCalcoloRapido();
    return;
  }

  el.nuovoArticoloMobile.dataset.conferma = "1";
  el.nuovoArticoloMobile.textContent = "Tocca ancora per pulire";
  el.nuovoArticoloMobile.classList.add("confirming");

  clearTimeout(confermaNuovoArticoloTimer);
  confermaNuovoArticoloTimer = window.setTimeout(() => {
    if (!el.nuovoArticoloMobile) return;
    el.nuovoArticoloMobile.dataset.conferma = "";
    el.nuovoArticoloMobile.textContent = "Nuovo articolo";
    el.nuovoArticoloMobile.classList.remove("confirming");
  }, 2200);
}

function pulisciCalcoloRapido() {
  prodottoCorrente = null;
  el.codiceInput.value = "";
  el.prodottoInput.value = "";
  el.pesoInput.value = "0.000";
  if (el.nuovoArticoloMobile) {
    el.nuovoArticoloMobile.dataset.conferma = "";
    el.nuovoArticoloMobile.textContent = "Nuovo articolo";
    el.nuovoArticoloMobile.classList.remove("confirming");
  }
  clearTimeout(confermaNuovoArticoloTimer);
  calcola();
  window.setTimeout(() => el.codiceInput?.focus(), 0);
}

function inizializzaFlussoRapidoCassa() {
  if (!USA_FLUSSO_RAPIDO_CASSA || pagina !== "calcolo") return;

  const vaiAlPeso = () => window.setTimeout(() => el.pesoInput?.focus(), 0);

  el.codiceInput?.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      chiudiTuttiSuggerimenti();
      if (prodottoCorrente || trovaPerCodice(el.codiceInput.value)) vaiAlPeso();
      else el.prodottoInput?.focus();
    }
  });

  el.prodottoInput?.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      chiudiTuttiSuggerimenti();
      if (prodottoCorrente || trovaPerNome(el.prodottoInput.value)) vaiAlPeso();
      else el.pesoInput?.focus();
    }
  });

  el.pesoInput?.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      calcola();
      evidenziaRisultato();
    }
  });

  document.addEventListener("keydown", (evento) => {
    const target = evento.target;
    const scrittura = target && ["INPUT", "TEXTAREA"].includes(target.tagName);
    const key = evento.key.toLocaleLowerCase("it");

    if (evento.key === "Escape") {
      evento.preventDefault();
      pulisciCalcoloRapido();
      return;
    }

    if (scrittura && target !== el.pesoInput) return;

    if (key === "p") selezionaSacchettoRapido("6", evento);
    if (key === "g") selezionaSacchettoRapido("12", evento);
  });
}

function selezionaSacchettoRapido(valore, evento) {
  if (!el.sacchettoInput) return;
  evento?.preventDefault();
  el.sacchettoInput.value = valore;
  el.sacchettoInput.dispatchEvent(new Event("change", { bubbles: true }));
  calcola();
}

function evidenziaRisultato() {
  const card = document.querySelector(".card-result");
  if (!card) return;
  card.classList.remove("result-pop");
  void card.offsetWidth;
  card.classList.add("result-pop");
}

function inizializzaPesoRapido() {
  if (!SELEZIONA_PESO_AL_FOCUS || !el.pesoInput) return;

  const seleziona = () => {
    window.setTimeout(() => el.pesoInput.select(), 0);
  };

  el.pesoInput.addEventListener("focus", seleziona);
  el.pesoInput.addEventListener("click", seleziona);
}

function inizializzaSacchettoRapido() {
  if (!el.sacchettoInput || !el.sacchettoButtons) return;

  if (!USA_BOTTONI_SACCHETTO) {
    el.sacchettoButtons.hidden = true;
    return;
  }

  el.sacchettoInput.classList.add("select-hidden");
  el.sacchettoButtons.hidden = false;

  el.sacchettoButtons.innerHTML = SACCHETTI.map((sacchetto) => `
    <button type="button" class="sacchetto-btn" data-valore="${sacchetto.valore}">
      <span>${escapeHtml(sacchetto.etichetta)}</span>
      <small>${sacchetto.valore} g</small>
    </button>
  `).join("");

  const aggiorna = () => {
    const valore = String(el.sacchettoInput.value);
    [...el.sacchettoButtons.querySelectorAll("button")].forEach((bottone) => {
      bottone.classList.toggle("active", bottone.dataset.valore === valore);
    });
  };

  el.sacchettoButtons.addEventListener("click", (evento) => {
    const bottone = evento.target.closest("button[data-valore]");
    if (!bottone) return;
    el.sacchettoInput.value = bottone.dataset.valore;
    aggiorna();
    calcola();
  });

  el.sacchettoInput.addEventListener("change", aggiorna);
  aggiorna();
}

function inizializzaProdotti() {
  disegnaTabella();
  pulisciEditor();

  el.nuovoProdotto.addEventListener("click", nuovoProdotto);
  el.modificaProdotto.addEventListener("click", abilitaModificaProdotto);
  el.salvaProdotto.addEventListener("click", salvaProdotto);
  el.eliminaProdotto.addEventListener("click", eliminaProdotto);
  el.cercaProdotti.addEventListener("input", disegnaTabella);
  el.esportaProdotti.addEventListener("click", esportaProdotti);
  el.importaProdotti.addEventListener("change", importaProdotti);
  el.ripristinaProdotti.addEventListener("click", ripristinaProdotti);

  campiEditor().forEach((campo) => {
    campo.addEventListener("input", () => {
      if (editorSbloccato) {
        editorDirty = true;
        aggiornaStatoEditor();
      }
    });
  });
}

function campiEditor() {
  return [el.editCodice, el.editNome, el.editGlassatura, el.editPrezzo, el.editNote].filter(Boolean);
}

function nuovoProdotto() {
  if (!confermaUscitaEditor()) return;
  pulisciEditor({ sblocca: true });
  el.editCodice.focus();
}

function abilitaModificaProdotto() {
  if (!el.idProdotto.value) {
    mostraMessaggio("Seleziona un prodotto");
    return;
  }

  setEditorSbloccato(true);
  editorDirty = false;
  aggiornaStatoEditor();
  el.editCodice.focus();
}

function setEditorSbloccato(valore) {
  editorSbloccato = Boolean(valore);
  campiEditor().forEach((campo) => campo.disabled = !editorSbloccato);
  document.body.classList.toggle("editor-locked", !editorSbloccato);
  aggiornaStatoEditor();
}

function aggiornaStatoEditor() {
  if (!pagina || pagina !== "prodotti") return;
  const selezionato = Boolean(el.idProdotto?.value);
  if (el.modificaProdotto) el.modificaProdotto.disabled = !selezionato || editorSbloccato;
  if (el.salvaProdotto) el.salvaProdotto.disabled = !editorSbloccato;
  if (el.eliminaProdotto) el.eliminaProdotto.disabled = false;
}

function confermaUscitaEditor() {
  if (!editorSbloccato || !editorDirty) return true;
  return confirm("Ci sono modifiche non salvate. Continuare senza salvarle?");
}

function renderSuggerimento(p, evidenza) {
  const codice = p.codice || "—";
  const nome = p.nome || "Prodotto senza nome";
  const prezzo = fmtEuro.format(p.prezzo);

  return `
    <span class="suggestion-row code-focused ${evidenza === "codice" ? "code-first" : ""}">
      <span class="suggestion-code">${escapeHtml(codice)}</span>
      <span class="suggestion-body">
        <span class="suggestion-name">${escapeHtml(nome)}</span>
        <span class="suggestion-meta">${escapeHtml(prezzo)}/kg</span>
      </span>
    </span>
  `;
}

function chiudiTuttiSuggerimenti() {
  document.querySelectorAll(".suggestions").forEach((box) => {
    box.classList.remove("open");
    box.innerHTML = "";
  });
}

function creaSuggerimenti(input, opzioni) {
  const box = document.createElement("div");
  box.className = "suggestions";
  input.insertAdjacentElement("afterend", box);

  const chiudi = () => {
    box.classList.remove("open");
    box.innerHTML = "";
  };

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
      <button type="button" data-id="${p.id}">${opzioni.render ? opzioni.render(p) : escapeHtml(opzioni.testo(p))}</button>
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

  input.addEventListener("blur", () => {
    window.setTimeout(chiudi, 120);
  });

  input.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") chiudi();
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
  if (USA_FLUSSO_RAPIDO_CASSA && pagina === "calcolo") {
    window.setTimeout(() => el.pesoInput?.focus(), 0);
  }
}

async function caricaProdotti({ forzaCsv = false } = {}) {
  if (!forzaCsv) {
    try {
      const salvati = localStorage.getItem(STORAGE_KEY);
      if (salvati) return normalizzaProdotti(JSON.parse(salvati));
    } catch (errore) {}
  }

  const percorsiCsv = [
    new URL(CSV_PRODOTTI, window.location.href).href,
    CSV_PRODOTTI,
    `./${CSV_PRODOTTI}`
  ];

  for (const percorso of [...new Set(percorsiCsv)]) {
    try {
      const risposta = await fetch(percorso, { cache: "no-store" });
      if (!risposta.ok) continue;
      const testo = await risposta.text();
      const lista = normalizzaProdotti(parseCsv(testo));
      if (lista.length) return lista;
    } catch (errore) {}
  }

  if (CSV_FALLBACK) {
    const lista = normalizzaProdotti(parseCsv(CSV_FALLBACK));
    if (lista.length) {
      if (window.location.protocol === "file:") mostraMessaggio("Catalogo caricato dalla copia interna");
      else mostraMessaggio("CSV non raggiungibile, usata copia interna");
      return lista;
    }
  }

  mostraMessaggio(window.location.protocol === "file:"
    ? "Apri il progetto da un server locale"
    : "File prodotti non disponibile");
  return [];
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

function haCodiciPiuLunghi(codice) {
  const valore = String(codice || "").trim();
  if (!valore) return false;
  return prodotti.some((p) => {
    const codiceProdotto = String(p.codice || "").trim();
    return codiceProdotto.length > valore.length && codiceProdotto.startsWith(valore);
  });
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
      if (!confermaUscitaEditor()) return;
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
  editorDirty = false;
  setEditorSbloccato(false);
}

function pulisciEditor({ sblocca = false } = {}) {
  prodottoCorrente = null;
  el.idProdotto.value = "";
  el.editCodice.value = "";
  el.editNome.value = "";
  el.editGlassatura.value = "0.10";
  el.editPrezzo.value = "";
  el.editNote.value = "";
  editorDirty = false;
  setEditorSbloccato(sblocca);
  evidenziaRiga(null);
}

function salvaProdotto() {
  if (!editorSbloccato) {
    mostraMessaggio("Premi Modifica o Nuovo");
    return;
  }

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
  editorDirty = false;
  disegnaTabella();
  caricaEditor(prodottoCorrente);
  mostraMessaggio("Prodotto salvato in questo browser");
}

function eliminaProdotto() {
  const id = el.idProdotto.value;
  if (!id) {
    alert("Seleziona prima un prodotto da eliminare.");
    return;
  }

  const prodotto = prodotti.find((p) => p.id === id);
  if (!prodotto) {
    alert("Prodotto non trovato.");
    return;
  }

  if (editorDirty && !confirm("Ci sono modifiche non salvate. Eliminare comunque il prodotto selezionato?")) return;
  if (!confirm(`Eliminare definitivamente "${prodotto.nome}" da questo browser?`)) return;

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
  if (!confermaUscitaEditor()) return;
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
