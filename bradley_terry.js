// ============================================================
// FORZA DEI GIOCATORI — Bradley-Terry a squadre, con i pareggi (Davidson)
// ============================================================
//
// Ogni giocatore i ha una forza θ_i (0 = giocatore medio). La forza di una squadra è la SOMMA
// delle forze dei suoi giocatori. Detta d = (S_chiari − S_scuri) / 2:
//
//   P(vincono i chiari)  = e^d  / (e^d + e^-d + ν)
//   P(vincono gli scuri) = e^-d / (e^d + e^-d + ν)
//   P(pareggio)          = ν    / (e^d + e^-d + ν)
//
// ν regola la frequenza dei pareggi ed è stimato dai dati.
//
// Le forze si stimano massimizzando la probabilità delle partite giocate, con un PRIOR
// θ_i ~ N(μ_i, σ²): μ_i è il punteggio di partenza (il voto dato a mano, o la media) e σ dice
// quanto ci si fida di quel voto. Senza prior, con poche partite, le stime vanno all'infinito.
//
// ⭐ LA PROPRIETÀ CHE RENDE LA FORZA SPIEGABILE. Nel punto di massimo vale, esattamente:
//
//   θ_i = μ_i + σ² · Σ_partite ½ · (risultato − atteso)
//
// dove «risultato» è +1 / 0 / −1 (vinta / pari / persa) per la squadra di i e «atteso» è
// P(vittoria) − P(sconfitta) calcolata con compagni e avversari di quella partita. Quindi ogni
// partita sposta il giocatore di quanto il risultato ha SORPRESO rispetto alle squadre in campo.
// `spiega()` restituisce proprio questi addendi.

const BT_ITER = 6000;
// SCALA «OVERALL» stile FIFA: 75 = giocatore medio, 10 punti = 1 di forza θ
const OVR_MEDIA = 75, OVR_SCALA = 10;
const overall = theta => OVR_MEDIA + OVR_SCALA * theta;

function stimaForza(partite, giocatoriIds, opzioni = {}) {
  const sigma = (opzioni.fiducia ?? 10) / OVR_SCALA;
  const base = opzioni.base || {};
  const ids = [...new Set([...giocatoriIds,
    ...partite.flatMap(m => [...(m.chiari || []), ...(m.scuri || [])])])];
  const idx = Object.fromEntries(ids.map((id, k) => [id, k]));
  const n = ids.length;                       // parametri: θ_0..θ_{n-1}, poi η = log ν
  const mu = ids.map(id => base[id] != null && base[id] !== '' ? (Number(base[id]) - OVR_MEDIA) / OVR_SCALA : 0);
  const gare = partite
    .filter(m => (m.chiari || []).length && (m.scuri || []).length)
    .map(m => ({ a: m.chiari.map(id => idx[id]), b: m.scuri.map(id => idx[id]),
                 esito: Number(m.esito) }));   // 1 chiari, -1 scuri, 0 pareggio

  function valuta(x) {
    const nu = Math.exp(x[n]);
    let lp = 0;
    const g = new Array(n + 1).fill(0);
    for (const m of gare) {
      let s = 0;
      m.a.forEach(k => s += x[k]);
      m.b.forEach(k => s -= x[k]);
      const d = s / 2, ep = Math.exp(d), em = Math.exp(-d), Z = ep + em + nu;
      // dd = risultato − atteso, visto dai chiari
      const dd = m.esito - (ep - em) / Z;
      lp += (m.esito === 1 ? d : m.esito === -1 ? -d : Math.log(nu)) - Math.log(Z);
      m.a.forEach(k => g[k] += dd / 2);
      m.b.forEach(k => g[k] -= dd / 2);
      g[n] += (m.esito === 0 ? 1 : 0) - nu / Z;
    }
    for (let k = 0; k < n; k++) {
      const z = x[k] - mu[k];
      lp -= z * z / (2 * sigma * sigma);
      g[k] -= z / (sigma * sigma);
    }
    lp -= x[n] * x[n] / 2; g[n] -= x[n];      // prior debole su log ν
    return { lp, g };
  }

  // salita del gradiente con passo adattivo: la funzione è concava, il massimo è uno solo
  let x = [...mu, 0], passo = 0.5, cur = valuta(x);
  for (let it = 0; it < BT_ITER; it++) {
    const y = x.map((v, k) => v + passo * cur.g[k]);
    const nuovo = valuta(y);
    if (nuovo.lp >= cur.lp) { x = y; cur = nuovo; passo *= 1.2; }
    else passo *= 0.5;
    if (Math.max(...cur.g.map(Math.abs)) < 1e-10) break;
  }

  // incertezza: inversa dell'hessiana (differenze finite sul gradiente)
  const h = 1e-5, H = [];
  for (let k = 0; k <= n; k++) {
    const xp = [...x]; xp[k] += h;
    const xm = [...x]; xm[k] -= h;
    const gp = valuta(xp).g, gm = valuta(xm).g;
    H.push(gp.map((v, j) => -(v - gm[j]) / (2 * h)));
  }
  const cov = inversa(H);

  const presenze = Object.fromEntries(ids.map(id => [id, 0]));
  partite.forEach(m => [...(m.chiari || []), ...(m.scuri || [])].forEach(id => presenze[id]++));
  const nu = Math.exp(x[n]);
  const giocatori = ids.map((id, k) => ({
    id, forza: x[k], presenze: presenze[id],
    partenza: overall(mu[k]),
    punti: overall(x[k]),
    sd: OVR_SCALA * Math.sqrt(Math.max(cov[k][k], 0)),
  })).sort((p, q) => q.forza - p.forza);
  return {
    giocatori, nu, sigma, pareggio: nu / (2 + nu),
    theta: Object.fromEntries(ids.map((id, k) => [id, x[k]])),
    mu: Object.fromEntries(ids.map((id, k) => [id, mu[k]])),
  };
}

// probabilità degli esiti per due formazioni qualsiasi (anche mai viste insieme)
function probabilita(stima, chiari, scuri) {
  const t = id => stima.theta[id] ?? 0;
  const d = (chiari.reduce((s, id) => s + t(id), 0) - scuri.reduce((s, id) => s + t(id), 0)) / 2;
  const ep = Math.exp(d), em = Math.exp(-d), Z = ep + em + stima.nu;
  return { chiari: ep / Z, pareggio: stima.nu / Z, scuri: em / Z };
}

// ⭐ da dove viene la forza di un giocatore: una riga per partita, e la somma delle righe più il
// punteggio di partenza È il punteggio finale (a meno di arrotondamenti)
function spiega(stima, partite, id) {
  const pt = x => overall(stima.theta[x] ?? 0);
  return partite
    .filter(m => (m.chiari || []).includes(id) || (m.scuri || []).includes(id))
    .map(m => {
      const chiaro = m.chiari.includes(id);
      const mia = chiaro ? m.chiari : m.scuri, loro = chiaro ? m.scuri : m.chiari;
      const p = probabilita(stima, mia, loro);          // dal punto di vista della SUA squadra
      const esito = Number(m.esito) === 0 ? 0 : ((Number(m.esito) === 1) === chiaro ? 1 : -1);
      const atteso = p.chiari - p.scuri;
      const sorpresa = esito - atteso;
      return {
        id: m.id, data: m.data, esito,
        compagni: mia.filter(x => x !== id).map(x => ({ id: x, punti: pt(x) })),
        avversari: loro.map(x => ({ id: x, punti: pt(x) })),
        // forza delle due squadre SENZA di lui da una parte: cosa portavano gli altri
        vantaggioAltri: (mia.filter(x => x !== id).reduce((s, x) => s + pt(x) - OVR_MEDIA, 0)
                        - loro.reduce((s, x) => s + pt(x) - OVR_MEDIA, 0)),
        pVinta: p.chiari, pPari: p.pareggio, pPersa: p.scuri,
        atteso, sorpresa,
        punti: OVR_SCALA * stima.sigma * stima.sigma * sorpresa / 2,
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

// tutte le divisioni di 10 giocatori in 5 + 5, dalla più equilibrata
function squadre(stima, dieci) {
  const [p0, ...resto] = dieci, out = [];
  const comb = (arr, k, start = 0, cur = []) => cur.length === k ? [cur]
    : arr.slice(start).flatMap((v, i) => comb(arr, k, start + i + 1, [...cur, v]));
  for (const c of comb(resto, 4)) {
    const a = [p0, ...c], b = dieci.filter(x => !a.includes(x));
    const p = probabilita(stima, a, b);
    out.push({ a, b, p, squilibrio: Math.abs(p.chiari - p.scuri) });
  }
  return out.sort((x, y) => x.squilibrio - y.squilibrio);
}

function inversa(A) {
  const n = A.length, M = A.map((r, i) => [...r, ...r.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const v = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= v;
    for (let r = 0; r < n; r++) if (r !== c) {
      const f = M[r][c];
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map(r => r.slice(n));
}

if (typeof module !== "undefined") module.exports = { stimaForza, probabilita, spiega, squadre, overall, OVR_MEDIA, OVR_SCALA };
