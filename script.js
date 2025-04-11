// Create a matrix of "big" cells (each cell directly inside the board)
let bigCells = Array.from(document.querySelectorAll('.board > .cell'));

// Create a matrix of "small" cells for each big cell
let smallCellsMatrix = bigCells.map(bigCell =>
    Array.from(bigCell.querySelectorAll('.small-board .cell'))
);

const gameStats = {
    playerX: 0,
    playerO: 0,
    turn: 'X',
    lastPlayed: 0,
    jokerMode: true,
    completedCells: []
};

const element = {
    emoteX: "❌",
    emoteO: "⭕",
    signX: "X",
    signO: "O"
}

createEventListener(handleClick);
function createEventListener(callBack) {
    smallCellsMatrix.forEach((smallCells, i) => {
        smallCells.forEach((smallCell, j) => {
            smallCell.addEventListener('click', () => {
                callBack(i, j);
            });
        });
    });
}

// Create a function to handle the click event
function handleClick(i, j) {
    const currentCell = smallCellsMatrix[i][j];
    if (cellIsPlayable(i) && currentCell.innerHTML === '') {
        gameStats.jokerMode = false
        if (gameStats.turn === element.signX) {
            currentCell.innerHTML = element.emoteX;
            gameStats.turn = element.signO
            document.getElementById('turn').innerText = element.emoteO;

        } else {
            currentCell.innerHTML = element.emoteO
            gameStats.turn = element.signX
            document.getElementById('turn').innerText = element.emoteX;

        }
        gameStats.lastPlayed = j;
        if (gameStats.completedCells.includes(j)) {
            gameStats.jokerMode = true;
        }
        checkSmallWin(i)
        formatPlayableCells(findPlayableCells());
    }
}


function cellIsPlayable(i) {
    // console.log(i === gameStats.lastPlayed)
    // console.log(gameStats.jokerMode)
    // console.log(gameStats.completedCells.includes(i))
    return i == gameStats.lastPlayed || gameStats.jokerMode;
}


function checkSmallWin(i) {
    const winningCombos = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6],
    ];
    const cells = smallCellsMatrix[i];
    for (const combo of winningCombos) {
        const [a, b, c] = combo;
        const valA = cells[a].innerHTML;
        const valB = cells[b].innerHTML;
        const valC = cells[c].innerHTML;
        if (valA && valA === valB && valA === valC) {
            const winnerEmote = cells[a].innerHTML;
            bigCells[i].innerHTML = winnerEmote;
            const cellHeight = bigCells[i].offsetHeight;
            bigCells[i].style.fontSize = cellHeight - 50 + 'px';
            gameStats.completedCells.push(i);
            gameStats.jokerMode = true;
            checkBigWin();
            break;
        }
    }
}

function checkBigWin() {
    const winningCombos = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6],
    ];
    for (const combo of winningCombos) {
        const [a, b, c] = combo;
        const valA = bigCells[a].innerHTML;
        const valB = bigCells[b].innerHTML;
        const valC = bigCells[c].innerHTML;
        if (valA && valA === valB && valA === valC && (valA === element.emoteX || valA === element.emoteO)) {
            alert(`Player ${valA} wins!`);
            // Update player scores
            if (valA === element.emoteX) {
                gameStats.playerX++;
                document.getElementById('score-x').innerText = gameStats.playerX;
            } else {
                gameStats.playerO++;
                document.getElementById('score-o').innerText = gameStats.playerO;
            }
            resetGame();
            break;
        }
    }
    // Check for a draw
    const isDraw = bigCells.every(cell => cell.innerHTML === element.emoteX || cell.innerHTML === element.emoteO);
    if (isDraw) {
        alert("It's a draw!");
        resetGame();
    }
}

function resetGame() {
    bigCells.forEach(cell => cell.innerHTML = '');
    smallCellsMatrix.forEach(smallCells => {
        smallCells.forEach(smallCell => smallCell.innerHTML = '');
    })
    gameStats.turn = element.signX;
    gameStats.jokerMode = true;
    const board = document.getElementsByClassName('board')[0];
    const cells = board.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.remove()
    });
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
    gameStats.completedCells = [];
    gameStats.lastPlayed = 0;
    // Recreate matrix of "big" cells
    bigCells = Array.from(document.querySelectorAll('.board > .cell'));

    // Recreate matrix of "small" cells for each big cell
    smallCellsMatrix = bigCells.map(bigCell =>
        Array.from(bigCell.querySelectorAll('.small-board .cell'))
    );
    createEventListener(handleClick);
}

function findPlayableCells() {
    const playableCells = [];
    console.log("Jokerm", gameStats.jokerMode)
    // if (gameStats.jokerMode) {
    //     return [0, 1, 2, 3, 4, 5, 6, 7, 8];
    // }
    smallCellsMatrix.forEach((smallCells, i) => {
        if (cellIsPlayable(i)) {
            playableCells.push(i);
        }
    });
    return playableCells;
}

function formatPlayableCells(playableCells) {
    console.log(playableCells);
    bigCells.forEach(bigCell => {
        bigCell.style.backgroundColor = '';  // Reset background color
        bigCell.style.transform = 'scale(1)';  // Reset scale
        bigCell.style.filter = '';  // Reset filter
        bigCell.style.opacity = '1';  // Reset opacity
        bigCell.style.pointerEvents = '';  // Reset pointer events
        bigCell.style.transition = '';  // Reset transition
    });
    bigCells.forEach((bigCell, index) => {
        if (playableCells.includes(index)) {
            // Format in a X way
            // increase scale
            bigCell.style.transform = 'scale(1)';
            bigCell.style.transition = 'all 0.9s ease';

        } else {
            // Format in a Y way
            bigCell.style.transform = 'scale(0.8)';  // reset scale for non-playable 
            bigCell.style.filter = 'blur(2px)';
            // bigCell.style.opacity = '0.5';
            bigCell.style.pointerEvents = 'none';
            bigCell.style.transition = 'all 0.3s ease';
        }
    });

}
