# Forza Calcetti

Stima la forza dei giocatori con Bradley-Terry a squadre (pareggi alla Davidson), partendo da voti
di base dati a mano. Le partite si leggono in sola lettura dal database dell'app del gruppo.

- `index.html`, `style.css`, `app.js` — l'interfaccia
- `bradley_terry.js` — il modello (stima, probabilità, spiegazione per partita, squadre)

I voti si danno nella scheda «Voti iniziali» e valgono dopo «Salva»; restano nel browser di chi li
scrive. `voti.json` sono i voti DEL SITO: li usa chi non ne ha salvati di suoi (telefono, amici).
Per cambiarli: Esporta dalla scheda e sostituire `voti.json` con il file scaricato.

Pubblicazione: `npx vercel` in questa cartella (sito statico, nessuna build).
