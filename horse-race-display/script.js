// script.js
const WEBSOCKET_URL = 'ws://localhost:3000'; // WebSocket server URL
const GAME_UPDATE_INTERVAL_MS = 50; // Should match backend for smooth animation
const TRACK_LENGTH = 1000; // Should match backend
const HORSE_WIDTH = 90;

// Game State Variables
let gameSessionId = null;
let participants = new Map(); // Map<userId, { wechatName, horseImageUrl, position, speed, element }>
let gameStatus = 'waiting'; // 'waiting', 'qr_scanning', 'ready_to_start', 'playing', 'finished'
let socket = null;

// DOM Elements
const horsesContainer = document.getElementById('horses-container');
const qrCodeImage = document.getElementById('qrCodeImage');
const realtimeRankingsList = document.getElementById('realtime-rankings');
const finalRankingsOverlay = document.getElementById('final-rankings-overlay');
const finalRankingsList = document.getElementById('final-rankings-list');
const resetGameButton = document.getElementById('reset-game-button');
const wallMessageContainer = document.getElementById('wall-message-container');
const gameStatusElement = document.getElementById('game-status');

// --- Utility Functions ---

// Renders or updates a single horse on the track
function updateHorseDisplay(horseData) {
    let horseDiv = document.getElementById(`horse-${horseData.userId}`);
    const trackWidth = document.querySelector('.race-track').clientWidth;
    const effectiveTrackLength = trackWidth - HORSE_WIDTH;

    // Calculate lane height dynamically based on current number of participants
    const currentParticipantsArray = Array.from(participants.values());
    const laneHeight = horsesContainer.clientHeight / Math.max(1, currentParticipantsArray.length);

    // Get index of the horse for its lane position
    const horseIndex = currentParticipantsArray.findIndex(p => p.userId === horseData.userId);
    const topPosition = horseIndex * laneHeight + (laneHeight / 2) - (HORSE_WIDTH / 4); // Center horse vertically in its lane

    if (!horseDiv) {
        // Create new horse element
        horseDiv = document.createElement('div');
        horseDiv.className = 'horse';
        horseDiv.id = `horse-${horseData.userId}`;
        horseDiv.style.position = 'absolute';
        horseDiv.style.width = `${HORSE_WIDTH}px`;
        horseDiv.style.height = '50px'; // Fixed height for visual consistency
        horseDiv.style.left = '0'; // Start at left
        horseDiv.style.transform = `translateX(${horseData.position}px)`; // Initial position
        horseDiv.style.top = `${topPosition}px`;
        horseDiv.innerHTML = `<span class="horse-name">${horseData.wechatNickname}</span>`; // Display name on horse
        horseDiv.classList.add('running'); // Add running animation

        horsesContainer.appendChild(horseDiv);
        participants.get(horseData.userId).element = horseDiv; // Store element reference
    } else {
        // Update existing horse position
        horseDiv.style.transform = `translateX(${(horseData.position / TRACK_LENGTH) * effectiveTrackLength}px)`;
        horseDiv.style.top = `${topPosition}px`; // Update vertical position in case participant count changed
    }

    // Update horse name
    const horseNameSpan = horseDiv.querySelector('.horse-name');
    if (horseNameSpan) {
        horseNameSpan.textContent = horseData.wechatNickname;
    }
}

// Function to redraw all horses and track lines
function redrawHorses() {
    // Clear previous track lines
    const trackGrid = document.querySelector('.track-grid');
    if (trackGrid) {
        trackGrid.innerHTML = '';
        // Draw lane lines if there are multiple participants
        const currentParticipantsArray = Array.from(participants.values());
        const laneCount = currentParticipantsArray.length;
        if (laneCount > 1) {
            const laneHeight = horsesContainer.clientHeight / laneCount;
            for (let i = 1; i < laneCount; i++) {
                const laneLine = document.createElement('div');
                laneLine.className = 'lane-line';
                laneLine.style.position = 'absolute';
                laneLine.style.top = `${i * laneHeight}px`;
                laneLine.style.width = '100%';
                laneLine.style.height = '2px';
                laneLine.style.background = 'rgba(255, 255, 255, 0.2)';
                trackGrid.appendChild(laneLine);
            }
        }
    }
    
    // Clear horses container and redraw all horses
    horsesContainer.innerHTML = '';
    Array.from(participants.values()).forEach(horseData => {
        updateHorseDisplay(horseData);
    });
}

// Update real-time rankings display
function updateRealtimeRankings(rankings) {
    realtimeRankingsList.innerHTML = '';
    rankings.forEach((entry, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${entry.rank}.</span> <span>${entry.wechatNickname}</span>`;
        realtimeRankingsList.appendChild(li);

        // Update horse highlight
        const horseDiv = document.getElementById(`horse-${entry.userId}`);
        if (horseDiv) {
            horseDiv.classList.remove('champion', 'runner-up', 'third-place');
            if (index === 0) horseDiv.classList.add('champion');
            else if (index === 1) horseDiv.classList.add('runner-up');
            else if (index === 2) horseDiv.classList.add('third-place');
        }
    });
}

// Display final rankings overlay
function displayFinalRankings(finalRankings) {
    finalRankingsList.innerHTML = '';
    finalRankings.forEach((entry, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${entry.rank}.</span> <span>${entry.wechatNickname}</span>`;
        if (index === 0) li.classList.add('rank-1');
        else if (index === 1) li.classList.add('rank-2');
        else if (index === 2) li.classList.add('rank-3');
        finalRankingsList.appendChild(li);
    });
    finalRankingsOverlay.classList.add('visible');
}

// Updates the game status display
function updateGameStatus(status) {
    if (gameStatusElement) {
        gameStatusElement.textContent = getStatusText(status);
        gameStatusElement.className = 'game-status';
        gameStatusElement.classList.add(`status-${status}`);
    }
}

function getStatusText(status) {
    switch(status) {
        case 'waiting': return '等待开始';
        case 'qr_scanning': return '扫码中';
        case 'ready_to_start': return '准备开始';
        case 'playing': return '比赛中';
        case 'finished': return '已结束';
        default: return '未知状态';
    }
}

// Resets all game state and UI
function resetGameUI() {
    gameStatus = 'waiting';
    updateGameStatus(gameStatus);
    participants.clear();
    horsesContainer.innerHTML = '';
    const trackGrid = document.querySelector('.track-grid');
    if (trackGrid) trackGrid.innerHTML = '';
    realtimeRankingsList.innerHTML = '';
    finalRankingsOverlay.classList.remove('visible');
    qrCodeImage.src = "https://via.placeholder.com/150?text=Scan+Me"; // Reset QR
    wallMessageContainer.innerHTML = ''; // Clear wall messages
}

// --- WebSocket Communication ---
function connectWebSocket(sessionId) {
    if (socket) {
        socket.disconnect();
    }
    // Assuming host panel provides authToken, or it's a public display
    // For large screen, we might not need JWT for simple display, but for security, it's good practice.
    // For now, let's assume it connects publicly or with a predefined key.
    // If you add JWT authentication for large screen, ensure it's provided here.
    socket = io(WEBSOCKET_URL, {
        query: {
            type: 'large_screen',
            sessionId: sessionId
        },
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log(`Connected to WebSocket server for session: ${sessionId}`);
        // Request initial state or wait for updates
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from WebSocket server:', reason);
        // Implement reconnection logic
        setTimeout(() => {
            connectWebSocket(sessionId);
        }, 5000); // Try to reconnect after 5 seconds
    });

    socket.on('error', (error) => {
        console.error('WebSocket Error:', error);
    });

    // Game Events
    socket.on('game_state_init', (data) => {
        console.log('Received initial game state:', data);
        gameSessionId = data.id;
        gameStatus = data.status;
        updateGameStatus(gameStatus);
        if (data.qrCodeUrl) {
            qrCodeImage.src = data.qrCodeUrl;
        }
        participants.clear();
        data.participants.forEach(p => participants.set(p.userId, {
            userId: p.userId,
            wechatNickname: p.wechatNickname,
            horseImageUrl: p.horseImageUrl,
            position: p.initialPosition || 0,
            speed: 0,
            element: null
        }));
        redrawHorses();
    });

    socket.on('participant_joined', (data) => {
        console.log('Participant joined:', data);
        if (data.sessionId === gameSessionId) {
            participants.set(data.userId, {
                userId: data.userId,
                wechatNickname: data.wechatNickname,
                horseImageUrl: data.horseImageUrl,
                position: data.initialPosition || 0,
                speed: 0,
                element: null
            });
            redrawHorses(); // Re-render all horses to adjust lane positions
        }
    });

    socket.on('horse_position_update', (data) => {
        // console.log('Horse position update:', data);
        if (data.sessionId === gameSessionId && gameStatus === 'playing') {
            data.updates.forEach(update => {
                const horse = participants.get(update.userId);
                if (horse) {
                    horse.position = update.position;
                    horse.speed = update.speed;
                    updateHorseDisplay(horse);
                }
            });
            updateRealtimeRankings(data.currentTopRankings);
        }
    });

    socket.on('game_started', (data) => {
        console.log('Game started:', data);
        if (data.sessionId === gameSessionId) {
            gameStatus = data.status;
            updateGameStatus(gameStatus);
            // Show a "GO!" animation
            showGoAnimation();
        }
    });

    socket.on('game_reset', (data) => {
        console.log('Game reset:', data);
        if (data.sessionId === gameSessionId) {
            resetGameUI(); // Clear all game state and UI
            // Request initial state for the reset session
            socket.emit('request_game_state', { sessionId: gameSessionId }); // Or handle by host panel init
        }
    });

    socket.on('game_finished', (data) => {
        console.log('Game finished:', data);
        if (data.sessionId === gameSessionId) {
            gameStatus = data.status;
            updateGameStatus(gameStatus);
            displayFinalRankings(data.finalRankings);
        }
    });

    // Wall Message Events
    socket.on('wall_message_approved', (message) => {
        console.log('Wall message approved:', message);
        if (message.gameSessionId === gameSessionId) {
            addWallMessageToDisplay(message);
        }
    });

    socket.on('wall_message_deleted', (data) => {
        console.log('Wall message deleted:', data);
        if (data.gameSessionId === gameSessionId) {
            removeWallMessageFromDisplay(data.messageId);
        }
    });

    socket.on('wall_message_updated', (data) => {
        console.log('Wall message updated:', data);
        if (data.gameSessionId === gameSessionId) {
            // e.g., update 'isTop' status or content
            updateWallMessageDisplay(data.messageId, data.updates);
        }
    });
}

// Show GO! animation when game starts
function showGoAnimation() {
    const goElement = document.createElement('div');
    goElement.className = 'go-animation';
    goElement.textContent = 'GO!';
    goElement.style.position = 'absolute';
    goElement.style.top = '50%';
    goElement.style.left = '50%';
    goElement.style.transform = 'translate(-50%, -50%)';
    goElement.style.fontSize = '8vw';
    goElement.style.color = '#fbbf24';
    goElement.style.fontWeight = 'bold';
    goElement.style.textShadow = '0 0 20px #fbbf24, 0 0 40px #fbbf24';
    goElement.style.zIndex = '1000';
    goElement.style.animation = 'goPulse 1s ease-out';
    
    document.querySelector('.race-track').appendChild(goElement);
    
    setTimeout(() => {
        goElement.remove();
    }, 1000);
}

// Add CSS for the GO! animation
const goAnimationStyle = document.createElement('style');
goAnimationStyle.textContent = `
    @keyframes goPulse {
        0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
        50% { transform: translate(-50%, -50%) scale(1.5); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
    }
    
    .status-waiting { color: #94a3b8; background: rgba(148, 163, 184, 0.2); }
    .status-qr_scanning { color: #60a5fa; background: rgba(96, 165, 250, 0.2); }
    .status-ready_to_start { color: #fbbf24; background: rgba(251, 191, 36, 0.2); }
    .status-playing { color: #f87171; background: rgba(248, 113, 113, 0.2); }
    .status-finished { color: #6ee7b7; background: rgba(110, 231, 183, 0.2); }
`;
document.head.appendChild(goAnimationStyle);

// --- Wall Message Display Functions ---
function addWallMessageToDisplay(message) {
    const messageCard = document.createElement('div');
    messageCard.className = 'wall-message-card';
    messageCard.id = `wall-message-${message.id}`;
    messageCard.innerHTML = `
        <div class="message-header">
            <div class="message-avatar">${message.wechatNickname.charAt(0).toUpperCase()}</div>
            <span class="message-nickname">${message.wechatNickname}</span>
        </div>
        <div class="message-content"></div>
        ${message.imageUrl ? `<img src="${message.imageUrl}" class="message-image" alt="User Image">` : ''}
    `;

    // Add text content carefully to avoid XSS if not sanitized server-side
    const contentDiv = messageCard.querySelector('.message-content');
    if (contentDiv) {
        contentDiv.textContent = message.content || ''; // Use textContent for safety
    }

    wallMessageContainer.prepend(messageCard); // Add to top for waterfall flow

    // Limit messages
    while (wallMessageContainer.children.length > 10) { // Keep last 10 messages
        wallMessageContainer.lastChild.remove();
    }
}

function removeWallMessageFromDisplay(messageId) {
    const messageCard = document.getElementById(`wall-message-${messageId}`);
    if (messageCard) {
        messageCard.classList.add('removing'); // Trigger exit animation
        messageCard.addEventListener('animationend', () => {
            messageCard.remove();
        }, { once: true });
    }
}

function updateWallMessageDisplay(messageId, updates) {
    const messageCard = document.getElementById(`wall-message-${messageId}`);
    if (messageCard) {
        if (updates.isTop !== undefined) {
            // Apply special styling for top messages
            if (updates.isTop) {
                messageCard.classList.add('top-message');
            } else {
                messageCard.classList.remove('top-message');
            }
            // Re-sort or reposition if necessary
            // For now, a simple class toggle
        }
        // ... handle other updates like content change
    }
}


// --- Initial Setup and Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Mock for now, in real scenario, this would come from the Host Panel
    // or be passed as a URL parameter to the large screen display
    gameSessionId = 'mock_game_session_123'; // Replace with actual session ID from host
    if (gameSessionId) {
        connectWebSocket(gameSessionId);
    }

    resetGameButton.addEventListener('click', () => {
        if (socket && gameSessionId) {
            // The reset button should trigger an event from the Host Panel,
            // which then tells the backend to reset, and the backend broadcasts.
            // For this display, we just clear locally and wait for backend.
            resetGameUI();
            console.log("Display UI reset. Waiting for backend game reset event.");
            // Or emit a request to backend to reset if this display has control.
            // socket.emit('request_game_reset', { sessionId: gameSessionId });
        }
    });
});
