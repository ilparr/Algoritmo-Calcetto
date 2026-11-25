# Forza Calcetti

Stima la forza dei giocatori con Bradley-Terry a squadre (pareggi alla Davidson), partendo da voti
di base dati a mano. Le partite si leggono in sola lettura dal database dell'app del gruppo.

- `index.html`, `style.css`, `app.js` — l'interfaccia
- `bradley_terry.js` — il modello (stima, probabilità, spiegazione per partita, squadre)

I voti si danno nella scheda «Voti iniziali» e valgono dopo «Salva»; restano nel browser di chi li
scrive. `voti.json` sono i voti DEL SITO: quando il file ha un `aggiornato` più recente di quello già
visto, i suoi voti sostituiscono quelli salvati nel browser (il sito è il registro condiviso).
Per cambiarli: Esporta dalla scheda (l'export mette già l'`aggiornato`) e sostituire `voti.json`.

Le partite arrivano dall'app del gruppo. Una partita segnata male si corregge nella scheda
«Partite» (rose e risultato; «—» = nondecisa, che non entra nel modello): le correzioni sono
salvate nel browser, e `correzioni.json` è quelle del sito, visibili a tutti (le proprie prevalgono).
Per pubblicarle: «Esporta correzioni.json» e sostituire il file nella cartella.

Pubblicazione: basta `git push` su GitHub — il repo è collegato a Vercel e il push deploya in
produzione da solo (`npx vercel` serve solo se l'integrazione fosse giù).
