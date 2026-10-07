# Forza Calcetti

Stima la forza dei giocatori con Bradley-Terry a squadre (pareggi alla Davidson), partendo da voti
di base dati a mano. Le partite si leggono in sola lettura dal database dell'app del gruppo.

- `index.html`, `style.css`, `app.js` — l'interfaccia
- `bradley_terry.js` — il modello (stima, probabilità, spiegazione per partita, squadre)

I voti restano nel browser di chi li scrive (Esporta / Importa per spostarli).

Pubblicazione: `npx vercel` in questa cartella (sito statico, nessuna build).
