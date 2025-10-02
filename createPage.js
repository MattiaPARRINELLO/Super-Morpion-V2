document.addEventListener("DOMContentLoaded", function () {

    // Créer le grand morpion
    const container = document.createElement('div');
    container.classList.add('container');

    // Créer l'entête
    const header = document.createElement('header');
    header.innerHTML = `
        <h1>Super Morpion</h1>
        <div class="scoreboard">
            <p>Joueur ❌ : <span id="score-x">0</span></p>
            <p>Joueur ⭕ : <span id="score-o">0</span></p>
            <p>Tour : <span id="turn">X</span></p>
        </div>
        <button id="toggle-theme">Changer le thème</button>
        <div class="online-controls">
            <div class="row">
                <input id="nickname" type="text" placeholder="Pseudo" />
                <input id="room-id" type="text" placeholder="Code Salle" disabled />
            </div>
            <div class="row">
                <button id="create-room">Créer une salle</button>
                <button id="join-room">Rejoindre</button>
                <button id="copy-link" disabled>Copier le lien</button>
                <button id="leave-room" disabled>Quitter</button>
            </div>
            <p id="connection-status">Hors ligne</p>
            <div class="room-info">
                <p>Salle: <strong id="ui-room">—</strong></p>
                <p>Moi: <strong id="ui-me">—</strong></p>
                <p>Adversaire: <strong id="ui-opponent">—</strong></p>
                <p>Nettoyage dans: <strong id="ui-ttl">—</strong></p>
            </div>
            <div class="rooms-panel">
                <h3>Salles actives</h3>
                <table class="rooms-table">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Joueur X</th>
                            <th>Joueur O</th>
                            <th>Activité</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="rooms-tbody">
                        <tr><td colspan="5">Chargement…</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
    container.appendChild(header);

    // Zone de notifications/toasts
    const toastContainer = document.createElement('div');
    toastContainer.classList.add('toast-container');
    container.appendChild(toastContainer);

    // Créer la zone de jeu (masquée tant qu'on n'est pas dans une salle)
    const gameContainer = document.createElement('div');
    gameContainer.classList.add('game');
    gameContainer.classList.add('hidden');

    const emptyState = document.createElement('div');
    emptyState.classList.add('empty-state');
    emptyState.innerHTML = `<p>Rejoignez ou créez une salle pour afficher le plateau.</p>`;
    container.appendChild(emptyState);

    // Créer la grille principale
    const board = document.createElement('div');
    board.classList.add('board');

    // Créer les petites grilles dans chaque cellule du grand morpion
    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');

        // Créer le petit morpion pour chaque cellule
        const smallBoard = document.createElement('div');
        smallBoard.classList.add('small-board');

        for (let j = 0; j < 9; j++) {
            const smallCell = document.createElement('div');
            smallCell.classList.add('cell');
            smallBoard.appendChild(smallCell);
        }

        cell.appendChild(smallBoard);
        board.appendChild(cell);
    }

    gameContainer.appendChild(board);
    container.appendChild(gameContainer);

    // Ajouter le container au body
    document.body.appendChild(container);

    // Fonction pour basculer entre le mode clair et sombre
    const toggleButton = document.getElementById('toggle-theme');
    toggleButton.addEventListener('click', function () {
        document.body.classList.toggle('dark-mode');
        // save in localStorage
        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
        } else {
            localStorage.setItem('theme', 'light');
        }

        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.body.classList.toggle('dark-mode', savedTheme === 'dark');
        }
    });


    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.body.classList.toggle('dark-mode', savedTheme === 'dark');
    }

    // When finished, add another script
    const newScript = document.createElement('script');
    newScript.src = 'script.js';
    newScript.defer = true;
    document.body.appendChild(newScript);
});
