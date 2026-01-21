// script.js
const WEBSOCKET_URL = 'ws://localhost:3000'; // WebSocket server URL
const GAME_UPDATE_INTERVAL_MS = 50; // Should match backend for smooth animation
const TRACK_LENGTH = 1000; // Should match backend
const HORSE_WIDTH = 80;

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
        horseDiv.style.height = '40px'; // Fixed height for visual consistency
        horseDiv.style.backgroundImage = `url(${horseData.horseImageUrl || '/assets/horses/default.png'})`; // Use actual image
        horseDiv.style.backgroundSize = 'contain';
        horseDiv.style.backgroundRepeat = 'no-repeat';
        horseDiv.style.backgroundPosition = 'center';
        horseDiv.style.left = '0'; // Start at left
        horseDiv.style.transform = `translateX(${horseData.position}px)`; // Initial position
        horseDiv.style.top = `${topPosition}px`;
        horseDiv.innerHTML = `<span class="wechat-name">${horseData.wechatNickname}</span>`; // Display name on horse

        horsesContainer.appendChild(horseDiv);
        participants.get(horseData.userId).element = horseDiv; // Store element reference
    } else {
        // Update existing horse position
        horseDiv.style.transform = `translateX(${(horseData.position / TRACK_LENGTH) * effectiveTrackLength}px)`;
        horseDiv.style.top = `${topPosition}px`; // Update vertical position in case participant count changed
    }

    // Update horse name
    const wechatNameSpan = horseDiv.querySelector('.wechat-name');
    if (wechatNameSpan) {
        wechatNameSpan.textContent = horseData.wechatNickname;
    }
}

// Function to redraw all horses (e.g., after participants change)
function redrawHorses() {
    horsesContainer.innerHTML = ''; // Clear all horses
    Array.from(participants.values()).forEach(horseData => {
        updateHorseDisplay(horseData);
    });
}

// Update real-time rankings display
function updateRealtimeRankings(rankings) {
    realtimeRankingsList.innerHTML = '';
    rankings.forEach((entry, index) => {
        const li = document.createElement('li');
        li.innerText = `${entry.rank}. ${entry.wechatNickname}`;
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

// Resets all game state and UI
function resetGameUI() {
    gameStatus = 'waiting';
    participants.clear();
    horsesContainer.innerHTML = '';
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
    });

    socket.on('error', (error) => {
        console.error('WebSocket Error:', error);
    });

    // Game Events
    socket.on('game_state_init', (data) => {
        console.log('Received initial game state:', data);
        gameSessionId = data.id;
        gameStatus = data.status;
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
            // Optionally show a "GO!" animation
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

// --- Wall Message Display Functions ---
function addWallMessageToDisplay(message) {
    const messageCard = document.createElement('div');
    messageCard.className = 'wall-message-card';
    messageCard.id = `wall-message-${message.id}`;
    messageCard.innerHTML = `
        <div class="message-header">
            <img src="${message.avatarUrl || 'https://via.placeholder.com/30?text=A'}" class="message-avatar" alt="Avatar">
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
    }
    return horses;
}

// Render horses on the track
function renderHorses() {
    const horsesContainer = document.getElementById('horses-container');
    horsesContainer.innerHTML = ''; // Clear previous horses

    // Dynamically adjust lane height based on number of horses
    const laneHeight = (horsesContainer.clientHeight / participants.length);

    participants.forEach((horse, index) => {
        const horseDiv = document.createElement('div');
        horseDiv.className = 'horse';
        horseDiv.id = `horse-${horse.id}`;
        horseDiv.style.top = `${index * laneHeight + (laneHeight / 2) - (HORSE_WIDTH / 4)}px`; // Center horse vertically in its lane
        horseDiv.style.transform = `translateX(${horse.position}px)`;
        horseDiv.innerText = horse.wechatName;
        horsesContainer.appendChild(horseDiv);
        horse.element = horseDiv; // Store reference to the DOM element
    });
}

// Update horse positions and check for winners
function updateGame() {
    if (!gameStarted || gameEnded) return;

    const trackWidth = document.querySelector('.race-track').clientWidth;
    const effectiveTrackLength = trackWidth - HORSE_WIDTH; // Account for horse width

    participants.forEach(horse => {
        // Mock acceleration received from backend (for now, random tap)
        // In real scenario, this 'acceleration' would come from WebSocket
        horse.speed += (Math.random() * 0.1 - 0.05) + horse.acceleration * 0.1; // Random fluctuation + base acceleration
        horse.speed = Math.max(0, Math.min(horse.speed, 20)); // Cap speed

        horse.position += horse.speed;
        horse.position = Math.min(horse.position, effectiveTrackLength); // Ensure horse doesn't go past finish line

        if (horse.element) {
            horse.element.style.transform = `translateX(${horse.position}px)`;
        }

        // Check if horse crossed finish line
        if (horse.position >= effectiveTrackLength && !gameEnded) {
            // Game ends when first horse crosses
            gameEnded = true;
            displayFinalRankings();
            console.log(`${horse.wechatName} wins!`);
            // Stop game update loop
        }
    });

    updateRealtimeRankings();

    if (!gameEnded) {
        requestAnimationFrame(updateGame);
    }
}

// Display real-time rankings (e.g., top 3)
function updateRealtimeRankings() {
    const rankingsList = document.getElementById('realtime-rankings');
    rankingsList.innerHTML = '';

    const sortedParticipants = [...participants].sort((a, b) => b.position - a.position);

    // Display top 3 for real-time
    for (let i = 0; i < Math.min(3, sortedParticipants.length); i++) {
        const li = document.createElement('li');
        li.innerText = `${i + 1}. ${sortedParticipants[i].wechatName}`;
        rankingsList.appendChild(li);

        // Highlight top horses on the track
        if (sortedParticipants[i].element) {
            sortedParticipants[i].element.classList.remove('champion', 'runner-up', 'third-place');
            if (i === 0) sortedParticipants[i].element.classList.add('champion');
            if (i === 1) sortedParticipants[i].element.classList.add('runner-up');
            if (i === 2) sortedParticipants[i].element.classList.add('third-place');
        }
    }
}

// Display final rankings overlay
function displayFinalRankings() {
    const finalRankingsOverlay = document.getElementById('final-rankings-overlay');
    const finalRankingsList = document.getElementById('final-rankings-list');
    finalRankingsList.innerHTML = '';

    // Sort by final position
    const finalSortedParticipants = [...participants].sort((a, b) => b.position - a.position);

    finalSortedParticipants.forEach((horse, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${index + 1}.</span> <span>${horse.wechatName}</span>`;
        if (index === 0) li.classList.add('rank-1');
        if (index === 1) li.classList.add('rank-2');
        if (index === 2) li.classList.add('rank-3');
        finalRankingsList.appendChild(li);
    });

    finalRankingsOverlay.classList.add('visible');
}

// Reset game state
function resetGame() {
    gameStarted = false;
    gameEnded = false;
    participants.forEach(horse => {
        horse.position = 0;
        horse.speed = 0;
        horse.acceleration = Math.random() * 0.5 + 0.1; // Reset acceleration
        if (horse.element) {
            horse.element.classList.remove('champion', 'runner-up', 'third-place');
        }
    });
    document.getElementById('final-rankings-overlay').classList.remove('visible');
    renderHorses(); // Re-render to reset positions visually
    updateRealtimeRankings(); // Clear rankings display
}


// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initial setup
    participants = generateMockParticipants(5); // Start with 5 mock participants
    renderHorses();

    // Mock host starting game after some time
    setTimeout(() => {
        gameStarted = true;
        requestAnimationFrame(updateGame); // Start the animation loop
        console.log("Game started!");
    }, 5000); // Game starts 5 seconds after page load

    // Reset button for final rankings overlay
    document.getElementById('reset-game-button').addEventListener('click', resetGame);
});
