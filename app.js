// Forza Calcetti — legge le partite dall'app del gruppo (SOLA LETTURA), tiene i voti nel browser.
const DB_URL = "https://calcetti-1ebd7-default-rtdb.europe-west1.firebasedatabase.app/.json";
const K_VOTI = "forzacalcetti.voti", K_FID = "forzacalcetti.fiducia";

const VOTO_MIN = 40, VOTO_MAX = 99;
const st = { giocatori: {}, partite: [], voti: leggi(K_VOTI, null), fiducia: leggi(K_FID, 10),
             stima: null, scelti: new Set(), vista: "classifica", sel: null, daSito: false };
const salvatiQui = st.voti !== null;
if (!salvatiQui) st.voti = {};

function leggi(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } }
function scrivi(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
// voti e fiducia salvati con la vecchia scala (1000 = medio, ±100): si convertono una volta
if (Object.values(st.voti).some(v => v > 200)) {
  for (const k in st.voti) st.voti[k] = Math.round(OVR_MEDIA + (st.voti[k] - 1000) / 10);
  scrivi(K_VOTI, st.voti);
}
if (st.fiducia > 40) { st.fiducia = Math.round(st.fiducia / 10); scrivi(K_FID, st.fiducia); }
st.bozza = { ...st.voti };
st.fidBozza = st.fiducia;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nome = id => st.giocatori[id]?.nome || id;
const pct = x => Math.round(100 * x) + "%";
const segno = (x, dec = 0) => { const v = Math.abs(x).toFixed(dec); return (Number(v) === 0 ? "" : x > 0 ? "+" : "−") + v; };

// ⭐ I voti del SITO: un file voti.json pubblicato insieme alle pagine. Vale per chi non ha
// ancora salvato voti suoi in questo browser (il telefono, un amico): cosi' tutti partono dagli
// stessi voti. Chi salva i propri continua a usare i suoi.
async function votiDelSito() {
  if (salvatiQui) return;
  try {
    const r = await fetch("voti.json", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    st.voti = pulisci(d.voti || d);
    if (d.fiducia) st.fiducia = Number(d.fiducia);
    st.bozza = { ...st.voti }; st.fidBozza = st.fiducia; st.daSito = true;
  } catch {}
}

async function carica() {
  await votiDelSito();
  $("#stato").textContent = "Carico le partite…";
  $("#stato").classList.remove("err");
  try {
    const r = await fetch(DB_URL, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json() || {};
    st.giocatori = d.giocatori || {};
    st.partite = Object.entries(d.partite || {}).map(([id, m]) => ({ id, ...m }))
      .filter(m => Array.isArray(m.chiari) && Array.isArray(m.scuri))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const ultima = st.partite.length ? st.partite[st.partite.length - 1].data : "—";
    $("#stato").innerHTML = `${st.partite.length} partite, ${Object.keys(st.giocatori).length} giocatori · ultima ${esc(ultima)} ·
      <a href="#" id="ricarica" style="color:inherit">ricarica</a>`;
    $("#ricarica").onclick = e => { e.preventDefault(); carica(); };
    ricalcola();
  } catch (e) {
    $("#stato").textContent = "Non riesco a leggere le partite (" + e.message + ").";
    $("#stato").classList.add("err");
  }
}

function ricalcola() {
  const ids = Object.keys(st.giocatori);
  st.stima = stimaForza(st.partite, ids, { base: st.voti, fiducia: st.fiducia });
  disegnaVoti();
  disegnaClassifica();
  disegnaGiocatore();
  disegnaSquadre();
}

function vps(id) {
  let v = 0, p = 0, s = 0;
  st.partite.forEach(m => {
    const c = m.chiari.includes(id), sc = m.scuri.includes(id);
    if (!c && !sc) return;
    const e = Number(m.esito);
    if (e === 0) p++; else if ((e === 1) === c) v++; else s++;
  });
  return `${v}-${p}-${s}`;
}

// ---------- VOTI INIZIALI ----------
// ⭐ Si modifica una BOZZA; la classifica usa i voti solo dopo «Salva». Ordine alfabetico fisso:
// le righe non si muovono mai mentre si scrive.
const pulisci = v => Object.fromEntries(Object.entries(v).filter(([, x]) => x >= VOTO_MIN && x <= VOTO_MAX));
const uguali = () => JSON.stringify(pulisci(st.bozza)) === JSON.stringify(pulisci(st.voti)) && st.fidBozza === st.fiducia;

function statoVoti(msg) {
  const el = $("#stato-voti");
  if (msg) { el.innerHTML = msg; return; }
  const n = Object.keys(pulisci(st.voti)).length;
  el.innerHTML = uguali()
    ? `<span class="salvato">✓ Salvato</span> · ${n} giocatori con un voto${st.daSito ? " (voti del sito)" : ""}`
    : `<span class="modificato">● Modifiche non salvate</span>`;
  $("#salva").disabled = $("#annulla").disabled = uguali();
}

function spiegaFiducia() {
  const k = OVR_SCALA / 2 * (st.fidBozza / OVR_SCALA) ** 2;
  $("#fiducia-spiega").textContent = `ogni partita sposta un giocatore al massimo di ±${(2 * k).toFixed(1)} punti`;
}

function disegnaVoti() {
  const tb = $("#tab-voti tbody");
  const ordinati = Object.keys(st.giocatori).sort((a, b) => nome(a).localeCompare(nome(b)));
  const ovr = Object.fromEntries((st.stima?.giocatori || []).map(g => [g.id, g]));
  const pres = id => st.partite.filter(m => m.chiari.includes(id) || m.scuri.includes(id)).length;
  tb.innerHTML = ordinati.map(id => `<tr>
      <td class="nome" style="cursor:default">${esc(nome(id))}</td>
      <td><input type="number" step="1" min="${VOTO_MIN}" max="${VOTO_MAX}" placeholder="75" data-id="${esc(id)}"
        value="${st.bozza[id] ?? ""}" class="${(st.bozza[id] ?? "") !== (st.voti[id] ?? "") ? "cambiato" : ""}"></td>
      <td class="forza">${ovr[id] ? Math.round(ovr[id].punti) : "—"}</td>
      <td class="muted hide-s">${pres(id)}</td></tr>`).join("");
  tb.querySelectorAll("input").forEach(inp => {
    inp.oninput = () => {
      const v = inp.value.trim(), n = Number(v), id = inp.dataset.id;
      if (v === "") delete st.bozza[id];
      else if (n >= VOTO_MIN && n <= VOTO_MAX) st.bozza[id] = n;
      // un numero a meta' («9» mentre si scrive 95) resta nel campo ma non nella bozza
      inp.classList.toggle("cambiato", (st.bozza[id] ?? "") !== (st.voti[id] ?? ""));
      statoVoti();
    };
    inp.onblur = () => {
      const n = Number(inp.value);
      if (inp.value.trim() !== "" && !(n >= VOTO_MIN && n <= VOTO_MAX)) {
        inp.value = st.bozza[inp.dataset.id] ?? "";
        statoVoti(`<span class="giu">Il voto va da ${VOTO_MIN} a ${VOTO_MAX}</span>`);
        setTimeout(statoVoti, 2500);
      }
    };
    inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); salva(); } };
  });
  $("#fiducia").value = st.fidBozza;
  $("#fiducia-val").textContent = "±" + st.fidBozza;
  spiegaFiducia();
  statoVoti();
}

function salva() {
  st.voti = pulisci(st.bozza);
  st.fiducia = st.fidBozza;
  st.bozza = { ...st.voti };
  st.daSito = false;
  scrivi(K_VOTI, st.voti);
  scrivi(K_FID, st.fiducia);
  ricalcola();
}

// ---------- CLASSIFICA (sola lettura) ----------
const classeDelta = d => d > 0.5 ? "su" : d < -0.5 ? "giu" : "muted";

function disegnaClassifica() {
  const tb = $("#tab-classifica tbody");
  tb.innerHTML = st.stima.giocatori.map((g, i) => {
    const delta = g.punti - g.partenza;
    return `<tr>
      <td class="muted">${i + 1}</td>
      <td class="nome" data-apri="${esc(g.id)}">${esc(nome(g.id))}</td>
      <td class="muted">${st.voti[g.id] ?? 75}</td>
      <td class="forza">${Math.round(g.punti)}</td>
      <td class="muted">±${Math.round(g.sd)}</td>
      <td class="${classeDelta(delta)}">${segno(delta, 1)}</td>
      <td class="muted hide-s">${g.presenze}</td>
      <td class="muted hide-s">${vps(g.id)}</td></tr>`;
  }).join("");
  tb.querySelectorAll("[data-apri]").forEach(td => td.onclick = () => { st.sel = td.dataset.apri; mostra("giocatore"); disegnaGiocatore(); });
  const nu = st.stima.nu, pv = 1 / (2 + nu);
  $("#nota-pareggio").textContent = `A squadre pari il modello si aspetta: vittoria ${pct(pv)}, pareggio ${pct(st.stima.pareggio)}, sconfitta ${pct(pv)}.`;
}

// ---------- GIOCATORE ----------
function disegnaGiocatore() {
  const sel = $("#sel-giocatore");
  const ordinati = Object.keys(st.giocatori).sort((a, b) => nome(a).localeCompare(nome(b)));
  if (!st.sel || !st.giocatori[st.sel]) st.sel = st.stima.giocatori[0]?.id;
  sel.innerHTML = ordinati.map(id => `<option value="${esc(id)}" ${id === st.sel ? "selected" : ""}>${esc(nome(id))}</option>`).join("");
  sel.onchange = () => { st.sel = sel.value; disegnaGiocatore(); };
  const g = st.stima.giocatori.find(x => x.id === st.sel);
  if (!g) { $("#spiegazione").innerHTML = ""; return; }
  const righe = spiega(st.stima, st.partite, g.id);
  const somma = righe.reduce((s, r) => s + r.punti, 0);
  const pt = x => Math.round(x.punti);
  $("#spiegazione").innerHTML = `
    <div class="riassunto">
      <div class="eq">${esc(nome(g.id))}: voto ${Math.round(g.partenza)} ${(somma >= 0 ? "+ " : "− ") + Math.abs(somma).toFixed(1)}
        dalle partite = <span class="forza">${Math.round(g.punti)}</span> <span class="muted">± ${Math.round(g.sd)}</span></div>
      <div class="nota">Ogni partita sposta di <b>(risultato − atteso) × ${(OVR_SCALA / 2 * st.stima.sigma * st.stima.sigma).toFixed(1)}</b> punti di overall:
        risultato +1 vinta, 0 pari, −1 persa; atteso = P(vittoria) − P(sconfitta) con quei compagni e quegli avversari.
        Le forze di compagni e avversari sono quelle finali, che dipendono anche dalle partite giocate senza ${esc(nome(g.id))}.</div>
    </div>
    ${righe.map(r => `
      <div class="partita">
        <div class="testa"><b>${esc(r.data)}</b>
          <span class="badge ${r.esito === 1 ? "v" : r.esito === 0 ? "p" : "s"}">${r.esito === 1 ? "vinta" : r.esito === 0 ? "pari" : "persa"}</span>
          <span class="muted">atteso ${r.atteso >= 0 ? "+" : "−"}${Math.abs(r.atteso).toFixed(2)} · risultato ${r.esito > 0 ? "+1" : r.esito < 0 ? "−1" : "0"}</span></div>
        <div class="righe">Compagni: ${r.compagni.map(c => `<b>${esc(nome(c.id))}</b> ${pt(c)}`).join(", ")}<br>
          Avversari: ${r.avversari.map(c => `<b>${esc(nome(c.id))}</b> ${pt(c)}`).join(", ")}<br>
          Gli altri nove gli davano ${r.vantaggioAltri >= 0 ? "un vantaggio" : "uno svantaggio"} di <b>${Math.abs(r.vantaggioAltri).toFixed(0)}</b> punti di overall ·
          prima della partita: vittoria ${pct(r.pVinta)}, pari ${pct(r.pPari)}, sconfitta ${pct(r.pPersa)}
          <div class="prob"><span style="width:${100 * r.pVinta}%"></span><span style="width:${100 * r.pPari}%"></span><span style="width:${100 * r.pPersa}%"></span></div></div>
        <div class="delta ${r.punti > 0.5 ? "su" : r.punti < -0.5 ? "giu" : "muted"}">${segno(r.punti, 1)}<small>overall</small></div>
      </div>`).join("")}`;
}

// ---------- SQUADRE ----------
function disegnaSquadre() {
  const ordinati = Object.keys(st.giocatori).sort((a, b) => nome(a).localeCompare(nome(b)));
  $("#scelta").innerHTML = ordinati.map(id =>
    `<button data-id="${esc(id)}" class="${st.scelti.has(id) ? "on" : ""}">${esc(nome(id))}</button>`).join("");
  $("#scelta").querySelectorAll("button").forEach(b => b.onclick = () => {
    const id = b.dataset.id;
    if (st.scelti.has(id)) st.scelti.delete(id); else if (st.scelti.size < 10) st.scelti.add(id);
    disegnaSquadre();
  });
  $("#conta").textContent = `${st.scelti.size} / 10`;
  if (st.scelti.size !== 10) { $("#divisioni").innerHTML = ""; return; }
  const forza = id => Math.round(overall(st.stima.theta[id] ?? 0));
  const lista = s => s.map(id => forza(id)).reduce((a, b) => a + b, 0);
  $("#divisioni").innerHTML = squadre(st.stima, [...st.scelti]).slice(0, 5).map((d, i) => `
    <div class="divisione">
      <div class="nota">Proposta ${i + 1} · chiari ${pct(d.p.chiari)} · pari ${pct(d.p.pareggio)} · scuri ${pct(d.p.scuri)}</div>
      <div class="prob"><span style="width:${100 * d.p.chiari}%"></span><span style="width:${100 * d.p.pareggio}%"></span><span style="width:${100 * d.p.scuri}%"></span></div>
      <div class="squadre" style="margin-top:8px">
        <div><h3>Chiari · media ${(lista(d.a) / 5).toFixed(1)}</h3>${d.a.map(id => `${esc(nome(id))} <span class="muted">${forza(id)}</span>`).join("<br>")}</div>
        <div><h3>Scuri · media ${(lista(d.b) / 5).toFixed(1)}</h3>${d.b.map(id => `${esc(nome(id))} <span class="muted">${forza(id)}</span>`).join("<br>")}</div>
      </div></div>`).join("");
}

// ---------- navigazione e comandi ----------
function mostra(v) {
  st.vista = v;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  document.querySelectorAll(".vista").forEach(s => s.classList.toggle("on", s.id === "v-" + v));
  window.scrollTo(0, 0);
}
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => mostra(b.dataset.v));

$("#fiducia").oninput = e => {
  st.fidBozza = Number(e.target.value);
  $("#fiducia-val").textContent = "±" + st.fidBozza;
  spiegaFiducia();
  statoVoti();
};
$("#salva").onclick = salva;
$("#annulla").onclick = () => { st.bozza = { ...st.voti }; st.fidBozza = st.fiducia; disegnaVoti(); };
$("#esporta").onclick = () => {
  const blob = new Blob([JSON.stringify({ voti: pulisci(st.voti), fiducia: st.fiducia }, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "voti.json" });
  a.click(); URL.revokeObjectURL(a.href);
};
$("#importa").onchange = async e => {          // nella BOZZA: si guarda e poi si salva
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    st.bozza = { ...(d.voti || d) };
    if (d.fiducia) st.fidBozza = Number(d.fiducia);
    disegnaVoti();
  } catch { alert("File non valido"); }
  e.target.value = "";
};
$("#azzera").onclick = () => { st.bozza = {}; disegnaVoti(); };
window.addEventListener("beforeunload", e => { if (!uguali()) { e.preventDefault(); e.returnValue = ""; } });
$("#pulisci").onclick = () => { st.scelti.clear(); disegnaSquadre(); };

carica();
