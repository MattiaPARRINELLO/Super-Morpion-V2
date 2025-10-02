// Socket.IO client and online play integration
const element = { emoteX: '❌', emoteO: '⭕', signX: 'X', signO: 'O' };

let socket;
let role = null; // 'X' | 'O' | null (spectator)
let roomId = null;
let nicknameCache = localStorage.getItem('smv2_nickname') || '';
let lastPeer = { i: null, j: null };
let cursorThrottle = 0;
let roomTtlTimer = null;
let roomsTtlTimer = null;
let roomsPollTimer = null;

// DOM references after createPage.js built the board
let bigCells = Array.from(document.querySelectorAll('.board > .cell'));
let smallCellsMatrix = bigCells.map((bigCell) => Array.from(bigCell.querySelectorAll('.small-board .cell')));

// State mirrored from server
let state = {
    turn: 'X',
    lastPlayed: 0,
    jokerMode: true,
    completedCells: [],
    smallBoards: Array.from({ length: 9 }, () => Array(9).fill('')),
    bigBoard: Array(9).fill(''),
    score: { X: 0, O: 0 },
};

function connectSocket() {
    // Force polling to be proxy-friendly if WebSockets are blocked; enable robust reconnection
    socket = io('/', {
        transports: ['polling'],
        upgrade: false,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 2000,
        timeout: 10000,
        path: '/socket.io'
    });
    const statusEl = document.getElementById('connection-status');

    socket.on('connect', () => {
        statusEl.textContent = 'Connecté au serveur';
        // Try to resume session
        const saved = JSON.parse(localStorage.getItem('smv2_session') || 'null');
        if (saved && saved.roomId) {
            roomId = saved.roomId;
            role = saved.role || null;
            const nn = saved.nickname || nicknameCache || 'Joueur';
            // Re-join the room to reclaim the role if freed by disconnect
            socket.emit('joinRoom', { roomId, nickname: nn }, (res) => {
                if (res.ok) {
                    roomId = res.roomId;
                    role = res.role; // server confirms actual role
                    applyState(res.state);
                    updateUiFromConnection();
                } else {
                    // fallback to read-only resume if join rejected (e.g., room full)
                    socket.emit('resumeRoom', { roomId }, (res2) => {
                        if (res2.ok) {
                            role = res2.role || null;
                            applyState(res2.state);
                            updateUiFromConnection();
                        }
                    });
                }
            });
        }
    });

    socket.on('disconnect', () => {
        statusEl.textContent = 'Déconnecté. Reconnexion…';
    });

    socket.on('connect_error', (err) => {
        const msg = (err && err.message) ? err.message : 'Erreur de connexion';
        statusEl.textContent = `Erreur: ${msg}`;
    });

    socket.on('stateUpdate', ({ state: s, meta }) => {
        applyState(s);
        if (meta?.winner) {
            notify(`Victoire ${meta.winner}!`);
        } else if (meta?.draw) {
            notify(`Match nul.`);
        }
    });

    socket.on('roomInfo', (info) => {
        if (!info) return;
        const roomEl = document.getElementById('ui-room');
        const meEl = document.getElementById('ui-me');
        const oppEl = document.getElementById('ui-opponent');
        const ttlEl = document.getElementById('ui-ttl');
        if (roomEl) roomEl.textContent = info.roomId || '—';
        if (meEl && oppEl) {
            let meTxt = '—';
            let oppTxt = '—';
            if (role === 'X') {
                meTxt = `X (${info.players?.X?.nickname || 'Moi'})`;
                oppTxt = info.players?.O ? `O (${info.players.O.nickname})` : 'O (en attente…)';
            } else if (role === 'O') {
                meTxt = `O (${info.players?.O?.nickname || 'Moi'})`;
                oppTxt = info.players?.X ? `X (${info.players.X.nickname})` : 'X (en attente…)';
            } else {
                const xName = info.players?.X?.nickname || 'X';
                const oName = info.players?.O?.nickname || 'O';
                meTxt = 'Spectateur';
                oppTxt = `${xName} vs ${oName}`;
            }
            meEl.textContent = meTxt;
            oppEl.textContent = oppTxt;
        }
        if (ttlEl && info.lastActivity && info.ttlMs) startRoomTtlCountdown(ttlEl, info.lastActivity, info.ttlMs);
    });

    socket.on('peerCursor', ({ bigIndex, smallIndex }) => {
        highlightPeerCursor(bigIndex, smallIndex);
    });

    socket.on('playerJoined', ({ role: r, nickname }) => {
        notify(`${nickname || 'Un joueur'} a rejoint en ${r}`, 'success');
    });

    socket.on('playerLeft', () => {
        notify(`Un joueur a quitté la salle.`, 'warn');
    });

    socket.on('roomClosed', ({ reason, roomId: rid }) => {
        notify(`La salle ${rid} a été fermée (${reason}).`, 'error');
        // Leave room client-side
        roomId = null; role = null;
        saveSession();
        updateUiFromConnection();
        showBoard(false);
    });
}

function notify(msg) {
    console.log(msg);
}

function showToast(message, type = 'info', timeout = 2500) {
    const cont = document.querySelector('.toast-container');
    if (!cont) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    cont.appendChild(t);
    setTimeout(() => {
        t.style.animation = 'toast-out 180ms ease-in forwards';
        setTimeout(() => t.remove(), 220);
    }, timeout);
}

function saveSession() {
    if (!roomId) return localStorage.removeItem('smv2_session');
    const nickname = (document.getElementById('nickname')?.value || nicknameCache || '').trim();
    localStorage.setItem('smv2_session', JSON.stringify({ roomId, role, nickname }));
}

function applyState(s) {
    state = JSON.parse(JSON.stringify(s));
    // Render scores and turn
    document.getElementById('score-x').innerText = state.score.X;
    document.getElementById('score-o').innerText = state.score.O;
    document.getElementById('turn').innerText = state.turn === 'X' ? element.emoteX : element.emoteO;
    // Re-render boards
    drawBoards();
    // Format playable cells
    formatPlayableCells(findPlayableCells());
}

function drawBoards() {
    // For each big cell, either draw a winner or render small board
    state.bigBoard.forEach((winner, bigIndex) => {
        const big = bigCells[bigIndex];
        if (winner === 'X' || winner === 'O') {
            // Replace content with winner emote
            big.innerHTML = winner === 'X' ? element.emoteX : element.emoteO;
            const cellHeight = big.offsetHeight;
            big.style.fontSize = Math.max(24, cellHeight - 50) + 'px';
        } else {
            // Ensure small-board exists and has 9 cells
            let sb = big.querySelector('.small-board');
            if (!sb) {
                sb = document.createElement('div');
                sb.classList.add('small-board');
                for (let j = 0; j < 9; j++) {
                    const smallCell = document.createElement('div');
                    smallCell.classList.add('cell');
                    // attach listener
                    smallCell.addEventListener('click', () => handleClick(bigIndex, j));
                    sb.appendChild(smallCell);
                }
                big.innerHTML = '';
                big.appendChild(sb);
                // refresh matrix entry for this big index
                smallCellsMatrix[bigIndex] = Array.from(sb.querySelectorAll('.cell'));
            }
            const smalls = smallCellsMatrix[bigIndex];
            state.smallBoards[bigIndex].forEach((v, smallIndex) => {
                smalls[smallIndex].innerHTML = v === 'X' ? element.emoteX : v === 'O' ? element.emoteO : '';
            });
        }
    });
}

function createEventListener(callBack) {
    smallCellsMatrix.forEach((smallCells, i) => {
        smallCells.forEach((smallCell, j) => {
            smallCell.addEventListener('click', () => callBack(i, j));
            smallCell.addEventListener('mouseenter', () => sendCursor(i, j));
            smallCell.addEventListener('mousemove', () => sendCursor(i, j));
            smallCell.addEventListener('mouseleave', () => clearPeerCursor());
        });
    });
}

function handleClick(i, j) {
    if (!roomId) return notify('Créez/Rejoignez une salle.');
    // Spectators cannot play
    if (!role) return notify('Spectateur: vous ne pouvez pas jouer.');
    // Enforce target client-side as well
    const targetOk = state.jokerMode || state.lastPlayed === i;
    if (!targetOk) return;
    if (state.bigBoard[i]) return;
    if (state.smallBoards[i][j]) return;
    if (state.turn !== role) return;

    socket.emit('playMove', { roomId, bigIndex: i, smallIndex: j, role }, (res) => {
        if (!res.ok) notify(res.error || 'Coup refusé');
    });
}

function cellIsPlayable(i) {
    return i == state.lastPlayed || state.jokerMode;
}

function findPlayableCells() {
    const playableCells = [];
    smallCellsMatrix.forEach((_smallCells, i) => {
        if (!state.bigBoard[i] && cellIsPlayable(i)) playableCells.push(i);
    });
    return playableCells;
}

function formatPlayableCells(playableCells) {
    bigCells.forEach((bigCell) => {
        bigCell.style.backgroundColor = '';
        bigCell.style.transform = 'scale(1)';
        bigCell.style.filter = '';
        bigCell.style.opacity = '1';
        bigCell.style.pointerEvents = '';
        bigCell.style.transition = '';
    });
    bigCells.forEach((bigCell, index) => {
        if (state.bigBoard[index]) {
            bigCell.style.pointerEvents = 'none';
            bigCell.style.opacity = '0.9';
            return;
        }
        if (playableCells.includes(index)) {
            bigCell.style.transform = 'scale(1)';
            bigCell.style.transition = 'all 0.9s ease';
        } else {
            bigCell.style.transform = 'scale(0.8)';
            bigCell.style.filter = 'blur(2px)';
            bigCell.style.pointerEvents = 'none';
            bigCell.style.transition = 'all 0.3s ease';
        }
    });
}

function rebuildMatricesAndListeners() {
    bigCells = Array.from(document.querySelectorAll('.board > .cell'));
    smallCellsMatrix = bigCells.map((bigCell) => Array.from(bigCell.querySelectorAll('.small-board .cell')));
    createEventListener(handleClick);
}

function updateUiFromConnection() {
    const roomInput = document.getElementById('room-id');
    const nickInput = document.getElementById('nickname');
    const copyBtn = document.getElementById('copy-link');
    const leaveBtn = document.getElementById('leave-room');
    if (roomId) {
        roomInput.value = roomId;
        copyBtn.disabled = false;
        leaveBtn.disabled = false;
        // request fresh room info (nickname/roles)
        socket.emit('resumeRoom', { roomId }, (res) => {
            if (res?.ok) {
                // server will also emit roomInfo
            }
        });
    } else {
        copyBtn.disabled = true;
        leaveBtn.disabled = true;
    }
    updateControlsVisibility();
    updateRoomsPolling();
}

// Hook up UI
function setupUi() {
    document.getElementById('create-room').addEventListener('click', () => {
        const nickname = document.getElementById('nickname').value.trim() || 'Joueur';
        localStorage.setItem('smv2_nickname', nickname); nicknameCache = nickname;
        // Always let server generate the room code
        socket.emit('createRoom', { roomId: '', nickname }, (res) => {
            if (!res.ok) { showToast(res.error, 'error'); return; }
            roomId = res.roomId;
            role = res.role;
            saveSession();
            applyState(res.state);
            updateUiFromConnection();
            history.replaceState(null, '', `?room=${roomId}`);
            showBoard(true);
            showToast(`Salle ${roomId} créée. Vous êtes ${role}.`, 'success');
        });
    });

    document.getElementById('join-room').addEventListener('click', () => {
        const nickname = document.getElementById('nickname').value.trim() || 'Joueur';
        localStorage.setItem('smv2_nickname', nickname); nicknameCache = nickname;
        const rid = (document.getElementById('room-id').value || '').trim().toUpperCase();
        if (!rid) { showToast('Entrez un code de salle.', 'warn'); return; }
        socket.emit('joinRoom', { roomId: rid, nickname }, (res) => {
            if (!res.ok) { showToast(res.error, 'error'); return; }
            roomId = res.roomId;
            role = res.role;
            saveSession();
            applyState(res.state);
            updateUiFromConnection();
            history.replaceState(null, '', `?room=${roomId}`);
            showBoard(true);
            showToast(`Rejoint la salle ${roomId} en ${role}.`, 'success');
        });
    });

    document.getElementById('copy-link').addEventListener('click', async () => {
        if (!roomId) return;
        const url = `${location.origin}${location.pathname}?room=${roomId}`;
        try { await navigator.clipboard.writeText(url); notify('Lien copié.'); } catch { }
    });

    document.getElementById('leave-room').addEventListener('click', () => {
        if (!roomId) return;
        socket.emit('leaveRoom', { roomId });
        roomId = null;
        role = null;
        saveSession();
        updateUiFromConnection();
        history.replaceState(null, '', location.pathname);
        showBoard(false);
        showToast('Vous avez quitté la salle.', 'info');
    });

    // Prefill room from URL
    const params = new URLSearchParams(location.search);
    const rid = (params.get('room') || '').toUpperCase();
    if (rid) document.getElementById('room-id').value = rid;
    if (nicknameCache) document.getElementById('nickname').value = nicknameCache;
    // Au démarrage, masquer le plateau si pas en salle
    showBoard(!!(JSON.parse(localStorage.getItem('smv2_session') || 'null')?.roomId));
    updateControlsVisibility();
    updateRoomsPolling();

    // Fetch initial rooms list
    refreshRoomsList();
    socket.on('roomsUpdated', (list) => renderRoomsList(list));
}

function resetBoardDomStructure() {
    const board = document.getElementsByClassName('board')[0];
    const cells = board.querySelectorAll('.cell');
    cells.forEach((cell) => cell.remove());
    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
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
}

function init() {
    // Rebuild matrices to ensure listeners on fresh DOM
    rebuildMatricesAndListeners();
    // Networking
    connectSocket();
    setupUi();
    // If there's existing state (fresh load), draw it
    drawBoards();
    formatPlayableCells(findPlayableCells());
}

function sendCursor(i, j) {
    if (!roomId || !socket || socket.disconnected) return;
    const now = Date.now();
    if (now - cursorThrottle < 50) return; // throttle 20fps
    cursorThrottle = now;
    socket.emit('cursorMove', { roomId, bigIndex: i, smallIndex: j });
}

function clearPeerCursor() {
    if (lastPeer.i == null || lastPeer.j == null) return;
    const el = smallCellsMatrix[lastPeer.i]?.[lastPeer.j];
    if (el) el.classList.remove('peer-hover');
    lastPeer = { i: null, j: null };
}

function highlightPeerCursor(i, j) {
    clearPeerCursor();
    const el = smallCellsMatrix[i]?.[j];
    if (el) {
        el.classList.add('peer-hover');
        lastPeer = { i, j };
    }
}

function showBoard(show) {
    const game = document.querySelector('.game');
    const empty = document.querySelector('.empty-state');
    if (!game || !empty) return;
    if (show) {
        game.classList.remove('hidden');
        empty.style.display = 'none';
    } else {
        game.classList.add('hidden');
        empty.style.display = '';
    }
}

function updateControlsVisibility() {
    const oc = document.querySelector('.online-controls');
    if (!oc) return;
    const rows = oc.querySelectorAll('.row');
    const inputsRow = rows[0];
    const buttonsRow = rows[1];
    const createBtn = document.getElementById('create-room');
    const joinBtn = document.getElementById('join-room');
    const copyBtn = document.getElementById('copy-link');
    const leaveBtn = document.getElementById('leave-room');
    const conn = document.getElementById('connection-status');
    const roomInfo = oc.querySelector('.room-info');
    const roomsPanel = oc.querySelector('.rooms-panel');

    const inRoom = !!roomId;

    if (inputsRow) inputsRow.style.display = inRoom ? 'none' : '';
    if (buttonsRow) buttonsRow.style.display = '';
    if (createBtn) createBtn.style.display = inRoom ? 'none' : '';
    if (joinBtn) joinBtn.style.display = inRoom ? 'none' : '';
    if (copyBtn) copyBtn.style.display = inRoom ? 'none' : '';
    if (leaveBtn) leaveBtn.style.display = inRoom ? '' : 'none';
    if (conn) conn.style.display = inRoom ? 'none' : '';
    if (roomInfo) roomInfo.style.display = inRoom ? '' : 'none';
    if (roomsPanel) roomsPanel.style.display = inRoom ? 'none' : '';

    // Pause TTL ticker when rooms list is hidden
    if (inRoom) {
        if (roomsTtlTimer) { clearInterval(roomsTtlTimer); roomsTtlTimer = null; }
    }
}

function updateRoomsPolling() {
    if (roomsPollTimer) { clearInterval(roomsPollTimer); roomsPollTimer = null; }
    if (!roomId) {
        roomsPollTimer = setInterval(() => {
            refreshRoomsList();
        }, 5000);
    }
}

function refreshRoomsList() {
    if (!socket) return;
    socket.emit('listRooms', {}, (res) => {
        if (res?.ok) renderRoomsList(res.rooms);
    });
}

function renderRoomsList(rooms) {
    const tbody = document.getElementById('rooms-tbody');
    if (!tbody) return;
    if (!rooms || rooms.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Aucune salle active</td></tr>';
        return;
    }
    const fmtAgo = (ts) => {
        const d = Date.now() - ts;
        if (d < 60000) return `${Math.round(d / 1000)}s`;
        if (d < 3600000) return `${Math.round(d / 60000)}m`;
        return `${Math.round(d / 3600000)}h`;
    };

    tbody.innerHTML = rooms
        .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0))
        .map((r) => {
            const badge = r.isFull ? '<span class="badge full">Pleine</span>' : '<span class="badge open">Ouverte</span>';
            const canJoin = !r.isFull;
            const remainingMs = Math.max(0, (r.lastActivity || 0) + (r.ttlMs || 0) - Date.now());
            return `
            <tr data-room="${r.roomId}" data-last="${r.lastActivity}" data-ttl="${r.ttlMs}">
                <td>${r.roomId}<div>${badge}</div></td>
                <td>${r.players.X ?? '—'}</td>
                <td>${r.players.O ?? '—'}</td>
                <td>
                  <div>il y a ${fmtAgo(r.lastActivity)}</div>
                  <div>nettoyage dans <span class="ttl-cell">${fmtRemain(remainingMs)}</span></div>
                </td>
                <td>
                    <button class="btn-watch" data-room="${r.roomId}">Regarder</button>
                    <button class="btn-join" data-room="${r.roomId}" ${canJoin ? '' : 'disabled'}>Rejoindre</button>
                </td>
            </tr>`;
        })
        .join('');

    // Wire actions
    tbody.querySelectorAll('.btn-watch').forEach((btn) => {
        btn.addEventListener('click', () => watchRoom(btn.dataset.room));
    });
    tbody.querySelectorAll('.btn-join').forEach((btn) => {
        btn.addEventListener('click', () => joinRoomFromList(btn.dataset.room));
    });

    startRoomsTtlTicker();
}

function watchRoom(rid) {
    // Watching = just resume, spectator if full; board should be visible to watch
    if (!socket) return;
    socket.emit('resumeRoom', { roomId: rid }, (res) => {
        if (!res?.ok) { showToast(res?.error || 'Salle introuvable', 'error'); return; }
        roomId = rid;
        role = res.role || null; // likely null => spectator
        saveSession();
        applyState(res.state);
        updateUiFromConnection();
        history.replaceState(null, '', `?room=${roomId}`);
        showBoard(true);
        showToast(`Vous regardez la salle ${roomId}.`, 'info');
    });
}

function joinRoomFromList(rid) {
    const nickname = document.getElementById('nickname').value.trim() || 'Joueur';
    localStorage.setItem('smv2_nickname', nickname); nicknameCache = nickname;
    socket.emit('joinRoom', { roomId: rid, nickname }, (res) => {
        if (!res.ok) { showToast(res.error, 'error'); return; }
        roomId = res.roomId;
        role = res.role;
        saveSession();
        applyState(res.state);
        updateUiFromConnection();
        history.replaceState(null, '', `?room=${roomId}`);
        showBoard(true);
        showToast(`Rejoint la salle ${roomId} en ${role}.`, 'success');
    });
}

function fmtRemain(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
    return `${s}s`;
}

function startRoomTtlCountdown(el, lastActivity, ttlMs) {
    if (roomTtlTimer) clearInterval(roomTtlTimer);
    const tick = () => {
        const rem = Math.max(0, (lastActivity || 0) + (ttlMs || 0) - Date.now());
        el.textContent = fmtRemain(rem);
    };
    tick();
    roomTtlTimer = setInterval(tick, 1000);
}

function startRoomsTtlTicker() {
    if (roomsTtlTimer) clearInterval(roomsTtlTimer);
    const tick = () => {
        const rows = document.querySelectorAll('#rooms-tbody tr[data-room]');
        rows.forEach(row => {
            const last = parseInt(row.getAttribute('data-last') || '0', 10);
            const ttl = parseInt(row.getAttribute('data-ttl') || '0', 10);
            const cell = row.querySelector('.ttl-cell');
            if (!cell) return;
            const rem = Math.max(0, last + ttl - Date.now());
            cell.textContent = fmtRemain(rem);
        });
    };
    tick();
    roomsTtlTimer = setInterval(tick, 1000);
}

init();
