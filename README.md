# Super Morpion V2 — Jeu en ligne (Node.js + Socket.IO)

Ce projet permet de jouer au Super Morpion à deux joueurs en ligne. Le serveur gère des salles, la synchronisation d’état en temps réel, la reconnexion, et la reprise après rafraîchissement. Aucune base de données n’est nécessaire: l’état est persisté dans un fichier `rooms.json`.

## Prérequis
- Node.js 18+

## Installation

```bash
npm install
```

## Lancer en local

```bash
npm start
```

Le serveur démarre sur http://localhost:3000

## Tester à deux joueurs (local ou réseau)

- Ouvrez deux onglets/navigateurs:
  - Onglet A: http://localhost:3000
  - Onglet B: http://localhost:3000
- Dans A:
  - Entrez un pseudo (optionnel)
  - Cliquez « Créer une salle » (un code s’affiche dans le champ Code Salle)
  - Cliquez « Copier le lien » et collez-le dans l’onglet B
- Dans B:
  - Validez le champ « Code Salle » si pré-rempli, sinon copiez le code et cliquez « Rejoindre »
- Jouez chacun votre tour. Les coups sont synchronisés.

### Reprise après rafraîchissement
- Rafraîchissez un des onglets (Ctrl+R). La page se reconnecte et recharge l’état de la partie automatiquement.
- Vous pouvez fermer/revenir tant que le serveur reste en cours d’exécution; l’état est conservé.

## Robustesse et comportements gérés
- Salles avec 2 rôles: X et O (observateurs supplémentaires autorisés, mais ne jouent pas).
- Validation serveur des coups: tour, cible (joker/dernière sous-grille), cases déjà prises, sous-grilles gagnées.
- Déconnexions/reconnexions: les joueurs quittant sont libérés, mais l’état de la salle est conservé.
- Persistance légère: `rooms.json` sauvegarde l’état des salles; redémarrer le serveur conserve les parties.
- Fin de partie: victoire ou match nul remet le plateau à zéro en conservant les scores.

## Déploiement simple
- Hébergez ce dossier sur un serveur Node (VPS, etc.).
- Assurez l’accès au port 3000 (ou définissez `PORT`).
- Lancez: `npm start`
- Accédez via: `http://<votre-ip>:3000`

## Structure
- `server.js`: serveur Express + Socket.IO, gestion des salles et logique de jeu côté serveur
- `index.html`, `createPage.js`, `styles.css`: interface
- `script.js`: client Socket.IO, rendu et interactions

## Astuces
- Utilisez le bouton « Copier le lien » pour inviter l’adversaire.
- Le thème clair/sombre reste fonctionnel et sauvegardé dans le navigateur.

```
MIT License
```