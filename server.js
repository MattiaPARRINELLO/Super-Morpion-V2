const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Simple timestamped logging (console and optional file)
const LOG_FILE = process.env.LOG_FILE;
let logStream = null;
if (LOG_FILE) {
    try { logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' }); }
    catch (e) { console.error('Cannot open log file', LOG_FILE, e); }
}
function log(...args) {
    const line = `[${new Date().toISOString()}] ` + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    console.log(line);
    if (logStream) try { logStream.write(line + '\n'); } catch {}
}

// Serve static files
app.use(express.static(path.join(__dirname)));

// Basic health endpoint
app.get('/health', (_req, res) => res.json({ ok: true }));

// In-memory rooms state with lightweight persistence
const DATA_FILE = path.join(__dirname, 'rooms.json');
/**
 * rooms: {
 *   [roomId]: {
 *     players: { X: socketId|null, O: socketId|null },
 *     nicknames: { [socketId]: string },
 *     state: {
 *       turn: 'X'|'O',
 *       lastPlayed: number,
 *       jokerMode: boolean,
 *       completedCells: number[],
 *       smallBoards: string[9][9], // 'X'|'O'|''
 *       bigBoard: string[9], // 'X'|'O'|''
 *       score: { X: number, O: number }
 *     },
 *     createdAt: number,
 *   }
 * }
 */
let rooms = {};
const ROOM_TTL_MS = parseInt(process.env.ROOM_TTL_MS || '1800000', 10); // 30 minutes by default

function loadRooms() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            rooms = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || {};
        }
    } catch (e) {
        console.error('Failed to load rooms.json:', e);
    }
}

function saveRooms() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(rooms));
    } catch (e) {
        console.error('Failed to save rooms.json:', e);
    }
}

function newEmptyState() {
    return {
        turn: 'X',
        lastPlayed: 0,
        jokerMode: true,
        completedCells: [],
        smallBoards: Array.from({ length: 9 }, () => Array(9).fill('')),
        bigBoard: Array(9).fill(''),
        score: { X: 0, O: 0 },
    };
}

function ensureRoom(roomId) {
    if (!rooms[roomId]) {
        rooms[roomId] = {
            players: { X: null, O: null },
            nicknames: {},
            state: newEmptyState(),
            createdAt: Date.now(),
            lastActivity: Date.now(),
        };
    }
}

function touch(roomId) {
    if (rooms[roomId]) rooms[roomId].lastActivity = Date.now();
}

function checkWin(lines) {
    for (const [a, b, c] of lines) {
        if (a && a === b && a === c) return a; // returns 'X' or 'O'
    }
    return '';
}

function checkSmallWin(small) {
    const lines = [
        [small[0], small[1], small[2]],
        [small[3], small[4], small[5]],
        [small[6], small[7], small[8]],
        [small[0], small[3], small[6]],
        [small[1], small[4], small[7]],
        [small[2], small[5], small[8]],
        [small[0], small[4], small[8]],
        [small[2], small[4], small[6]],
    ];
    return checkWin(lines);
}

function checkBigWin(big) {
    const lines = [
        [big[0], big[1], big[2]],
        [big[3], big[4], big[5]],
        [big[6], big[7], big[8]],
        [big[0], big[3], big[6]],
        [big[1], big[4], big[7]],
        [big[2], big[5], big[8]],
        [big[0], big[4], big[8]],
        [big[2], big[4], big[6]],
    ];
    return checkWin(lines);
}

function roomPlayerOf(socket, room) {
    if (!room) return null;
    if (room.players.X === socket.id) return 'X';
    if (room.players.O === socket.id) return 'O';
    return null;
}

function buildRoomInfo(roomId) {
    const room = rooms[roomId];
    if (!room) return null;
    const players = {
        X: room.players.X ? { socketId: room.players.X, nickname: room.nicknames[room.players.X] || 'J1' } : null,
        O: room.players.O ? { socketId: room.players.O, nickname: room.nicknames[room.players.O] || 'J2' } : null,
    };
    return {
        roomId,
        players,
        turn: room.state.turn,
        score: room.state.score,
        lastActivity: room.lastActivity || room.createdAt,
        ttlMs: ROOM_TTL_MS,
    };
}

function getRoomsList() {
    return Object.entries(rooms).map(([roomId, room]) => ({
        roomId,
        players: {
            X: room.players.X ? (room.nicknames[room.players.X] || 'J1') : null,
            O: room.players.O ? (room.nicknames[room.players.O] || 'J2') : null,
        },
        isFull: !!(room.players.X && room.players.O),
        createdAt: room.createdAt,
        lastActivity: room.lastActivity || room.createdAt,
        ttlMs: ROOM_TTL_MS,
    }));
}

io.on('connection', (socket) => {
    log('socket connect', { id: socket.id, addr: socket.handshake.address });
    socket.on('createRoom', ({ roomId, nickname }, cb) => {
        try {
            log('createRoom request', { roomId, nickname });
            roomId = (roomId || '').trim().toUpperCase();
            if (!roomId) roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
            ensureRoom(roomId);
            const room = rooms[roomId];
            if (room.players.X || room.players.O) {
                // allow creation only if empty
                return cb({ ok: false, error: 'La salle existe déjà.' });
            }
            room.players.X = socket.id;
            room.nicknames[socket.id] = nickname || 'J1';
            socket.join(roomId);
            touch(roomId);
            saveRooms();
            cb({ ok: true, roomId, role: 'X', state: room.state });
            log('createRoom ok', { roomId, role: 'X', by: socket.id });
            io.in(roomId).emit('roomInfo', buildRoomInfo(roomId));
            io.emit('roomsUpdated', getRoomsList());
        } catch (e) {
            log('createRoom error', { message: e.message });
            cb({ ok: false, error: 'Erreur création salle.' });
        }
    });

    socket.on('joinRoom', ({ roomId, nickname }, cb) => {
        try {
            log('joinRoom request', { roomId, nickname });
            roomId = (roomId || '').trim().toUpperCase();
            ensureRoom(roomId);
            const room = rooms[roomId];
            // Assign role O if available, else X if available, else reject when both taken
            let role = null;
            if (!room.players.X) role = 'X';
            else if (!room.players.O) role = 'O';
            else return cb({ ok: false, error: 'Salle pleine.' });

            if (room.players[role]) return cb({ ok: false, error: 'Rôle indisponible.' });

            room.players[role] = socket.id;
            room.nicknames[socket.id] = nickname || (role === 'X' ? 'J1' : 'J2');
            socket.join(roomId);
            touch(roomId);
            saveRooms();
            cb({ ok: true, roomId, role, state: room.state });
            log('joinRoom ok', { roomId, role, by: socket.id });
            socket.to(roomId).emit('playerJoined', { role, nickname: room.nicknames[socket.id] });
            io.in(roomId).emit('roomInfo', buildRoomInfo(roomId));
            io.emit('roomsUpdated', getRoomsList());
        } catch (e) {
            log('joinRoom error', { message: e.message });
            cb({ ok: false, error: 'Erreur rejoindre salle.' });
        }
    });

    socket.on('resumeRoom', ({ roomId }, cb) => {
        const room = rooms[(roomId || '').toUpperCase()];
        if (!room) return cb({ ok: false, error: 'Salle introuvable.' });
        // If socket already in room, just return state; else put them as spectator (no role)
        socket.join(roomId);
        touch(roomId);
        const role = roomPlayerOf(socket, room);
        cb({ ok: true, roomId, role, state: room.state });
        log('resumeRoom', { roomId, role, by: socket.id });
        socket.emit('roomInfo', buildRoomInfo(roomId));
    });

    socket.on('playMove', ({ roomId, bigIndex, smallIndex, role }, cb) => {
    const room = rooms[(roomId || '').toUpperCase()];
        if (!room) return cb({ ok: false, error: 'Salle introuvable.' });
        const player = roomPlayerOf(socket, room);
        if (!player || player !== role) return cb({ ok: false, error: 'Non autorisé.' });

        const st = room.state;
        if (st.turn !== role) return cb({ ok: false, error: 'Pas votre tour.' });
        if (bigIndex < 0 || bigIndex > 8 || smallIndex < 0 || smallIndex > 8) {
            return cb({ ok: false, error: 'Coup invalide.' });
        }
        // Joker/target enforcement
        const targetOk = st.jokerMode || st.lastPlayed === bigIndex;
        if (!targetOk) return cb({ ok: false, error: 'Mauvaise sous-grille.' });
        if (st.bigBoard[bigIndex]) return cb({ ok: false, error: 'Sous-grille déjà gagnée.' });
        if (st.smallBoards[bigIndex][smallIndex]) return cb({ ok: false, error: 'Case déjà prise.' });

        // Apply move
        st.smallBoards[bigIndex][smallIndex] = role;

        // Check small win
        const smallWinner = checkSmallWin(st.smallBoards[bigIndex]);
        if (smallWinner) {
            st.bigBoard[bigIndex] = smallWinner;
            if (!st.completedCells.includes(bigIndex)) st.completedCells.push(bigIndex);
            st.jokerMode = true;
        } else {
            st.jokerMode = st.completedCells.includes(smallIndex);
        }

        // Prepare next target
        st.lastPlayed = smallIndex;

        // Check big win
        const winner = checkBigWin(st.bigBoard);
        let gameOver = false;
        let draw = false;
        if (winner) {
            st.score[winner] += 1;
            gameOver = true;
        } else if (st.bigBoard.every(v => v)) {
            draw = true;
            gameOver = true;
        }

        // Toggle turn if not over
        if (!gameOver) {
            st.turn = st.turn === 'X' ? 'O' : 'X';
        } else {
            // Reset board but keep score
            const keepScore = st.score;
            rooms[roomId].state = {
                ...newEmptyState(),
                score: keepScore,
            };
        }

        touch(roomId);
        saveRooms();

        io.in(roomId).emit('stateUpdate', { state: rooms[roomId].state, meta: { lastMove: { bigIndex, smallIndex, role }, winner, draw } });
        io.in(roomId).emit('roomInfo', buildRoomInfo(roomId));
        cb({ ok: true });
        log('playMove', { roomId, bigIndex, smallIndex, role });
    });

    // Peer cursor sharing within a room
    socket.on('cursorMove', ({ roomId, bigIndex, smallIndex }) => {
        roomId = (roomId || '').toUpperCase();
        if (!rooms[roomId]) return;
        touch(roomId);
        // broadcast to others in the room
        socket.to(roomId).emit('peerCursor', { bigIndex, smallIndex });
        log('cursorMove', { roomId, bigIndex, smallIndex, by: socket.id });
    });

    socket.on('leaveRoom', ({ roomId }) => {
    const room = rooms[(roomId || '').toUpperCase()];
        if (!room) return;
        if (room.players.X === socket.id) room.players.X = null;
        if (room.players.O === socket.id) room.players.O = null;
        delete room.nicknames[socket.id];
        socket.leave(roomId);
        touch(roomId);
        saveRooms();
        io.in(roomId).emit('playerLeft', {});
        io.in(roomId).emit('roomInfo', buildRoomInfo(roomId));
        io.emit('roomsUpdated', getRoomsList());
        log('leaveRoom', { roomId, by: socket.id });
    });

    socket.on('disconnect', () => {
        // Cleanup references; keep state for resume
        log('socket disconnect', { id: socket.id });
        for (const [roomId, room] of Object.entries(rooms)) {
            let changed = false;
            if (room.players.X === socket.id) { room.players.X = null; changed = true; }
            if (room.players.O === socket.id) { room.players.O = null; changed = true; }
            if (room.nicknames[socket.id]) { delete room.nicknames[socket.id]; changed = true; }
            if (changed) io.in(roomId).emit('playerLeft', {});
        }
        saveRooms();
        // Broadcast roomInfo to rooms potentially affected
        for (const [rid] of Object.entries(rooms)) {
            io.in(rid).emit('roomInfo', buildRoomInfo(rid));
        }
        io.emit('roomsUpdated', getRoomsList());
    });

    socket.on('listRooms', (_payload, cb) => {
        try {
            cb({ ok: true, rooms: getRoomsList() });
        } catch (e) {
            cb({ ok: false, error: 'Erreur liste des salles.' });
        }
    });
});

loadRooms();

// Periodic cleanup of inactive rooms
setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [roomId, room] of Object.entries(rooms)) {
        const last = room.lastActivity || room.createdAt || 0;
        if (now - last > ROOM_TTL_MS) {
            // Notify connected clients, then delete
            io.in(roomId).emit('roomClosed', { reason: 'inactive', roomId });
            delete rooms[roomId];
            changed = true;
        }
    }
    if (changed) saveRooms();
    if (changed) io.emit('roomsUpdated', getRoomsList());
}, 60 * 1000);

const PORT = process.env.PORT || 3000;
server.on('error', (err) => {
    log('server error', { message: err.message, code: err.code, stack: err.stack });
});
process.on('uncaughtException', (err) => {
    log('uncaughtException', { message: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
    log('unhandledRejection', { reason: reason && reason.message ? reason.message : String(reason) });
});
server.listen(PORT, () => {
    log(`Server listening on http://0.0.0.0:${PORT}`);
});
