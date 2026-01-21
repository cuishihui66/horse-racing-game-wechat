// script.js

// Mock data for participants and game state
let participants = [];
let gameStarted = false;
let gameEnded = false;
const TRACK_LENGTH = 1000; // Represents the 'finish line' position
const HORSE_WIDTH = 80; // Should match CSS for accurate positioning

// Function to generate random participants for demonstration
function generateMockParticipants(count) {
    const names = ["Alice", "Bob", "Charlie", "David", "Eve", "Frank", "Grace", "Heidi", "Ivan", "Judy"];
    const horses = [];
    for (let i = 0; i < count; i++) {
        horses.push({
            id: `user_${i}`,
            wechatName: names[Math.floor(Math.random() * names.length)] + (i > names.length -1 ? i : ''),
            position: 0, // 0 to TRACK_LENGTH
            speed: 0,
            acceleration: Math.random() * 0.5 + 0.1, // Initial random acceleration
            element: null // To store the DOM element
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
