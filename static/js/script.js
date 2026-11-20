const socket = io();

// Wake Lock API (prevents phone screen from turning off)
let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.log('Wake Lock error:', err);
    }
}
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') { 
        await requestWakeLock(); 
    }
});

// Block Back Button (keeps user in the app)
history.pushState(null, null, location.href);
window.addEventListener('popstate', function () {
    history.pushState(null, null, location.href);
});

// UI Elements
const overlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('startBtn');
const fullScreenMenu = document.getElementById('fullScreenMenu');
const touchpad = document.getElementById('touchpad-container');

// Startup Logic
startBtn.addEventListener('click', async () => {
    try {
        if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
        }
        await requestWakeLock();
        try {
            await screen.orientation.lock('landscape');
        } catch (e) {} // Ignore if device blocks orientation lock
    } catch(e) {}
    overlay.classList.add('hidden');
});

// Menu Toggle
document.getElementById('openMenuBtn').addEventListener('click', () => {
    fullScreenMenu.classList.add('open');
});
document.getElementById('closeMenuBtn').addEventListener('click', () => {
    fullScreenMenu.classList.remove('open');
    document.getElementById('keyboardInput').blur();
});

// Make toggleRotation globally accessible to HTML onclick
window.toggleRotation = function() {
    try {
        if (screen.orientation.type.includes('portrait')) {
            screen.orientation.lock('landscape');
        } else {
            screen.orientation.lock('portrait');
        }
    } catch (e) {}
    fullScreenMenu.classList.remove('open');
}

// Hold-to-Exit Logic
const exitBtn = document.getElementById('exitBtn');
const exitFill = document.getElementById('exitFill');
let exitTimer;

function startExit() {
    exitFill.style.transition = 'width 0.6s linear';
    exitFill.style.width = '100%';
    exitTimer = setTimeout(() => {
        exitApp();
        resetExit();
    }, 600);
}

function resetExit() {
    clearTimeout(exitTimer);
    exitFill.style.transition = 'width var(--dur-fast) var(--spring-damped)';
    exitFill.style.width = '0%';
}

function exitApp() {
    if (document.exitFullscreen) { document.exitFullscreen(); }
    if (wakeLock !== null) { wakeLock.release().then(() => wakeLock = null); }
    fullScreenMenu.classList.remove('open');
    overlay.classList.remove('hidden');
}

exitBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startExit(); });
exitBtn.addEventListener('touchend', resetExit);
exitBtn.addEventListener('touchcancel', resetExit);
exitBtn.addEventListener('mousedown', startExit);
exitBtn.addEventListener('mouseup', resetExit);
exitBtn.addEventListener('mouseleave', resetExit);

// Keyboard Logic
window.sendKey = function(key) { 
    socket.emit('key_press', {key: key}); 
}

const kbd = document.getElementById('keyboardInput');
kbd.addEventListener('input', (e) => {
    if (e.inputType === 'insertText') { socket.emit('key_press', {key: e.data}); }
    kbd.value = ''; // Keep field clear
});
kbd.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' || e.key === 'Enter') { socket.emit('key_press', {key: e.key}); }
});

// --- WINDOWS GESTURE ENGINE ---
const sensitivity = 2.5; 
const scrollSens = 35;

let initialTouches = [];
let maxFingers = 0;
let isMoving = false;
let touchStartTime = 0;
let lastTapTime = 0;

let lastX = 0, lastY = 0;

touchpad.addEventListener('touchstart', (e) => {
    touchStartTime = Date.now();
    isMoving = false;
    
    if (e.touches.length > maxFingers) {
        maxFingers = e.touches.length;
        initialTouches = Array.from(e.touches).map(t => ({x: t.clientX, y: t.clientY}));
    }

    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
});

touchpad.addEventListener('touchmove', (e) => {
    e.preventDefault(); 
    isMoving = true;
    
    let cx = e.touches[0].clientX;
    let cy = e.touches[0].clientY;

    if (maxFingers === 1) {
        // Pointer Movement
        socket.emit('move', {dx: (cx - lastX) * sensitivity, dy: (cy - lastY) * sensitivity});
    } else if (maxFingers === 2) {
        // Two Finger Scroll
        let dy = (lastY - cy); 
        // Inverted scrolling direction (-dy)
        if (Math.abs(dy) > 1) { socket.emit('scroll', {dy: -dy * scrollSens}); }
    }
    
    lastX = cx; lastY = cy;
});

touchpad.addEventListener('touchend', (e) => {
    let touchDuration = Date.now() - touchStartTime;
    
    // Only process gesture when all fingers are lifted
    if (e.touches.length === 0) {
        let endX = e.changedTouches[0].clientX;
        let endY = e.changedTouches[0].clientY;
        let diffX = endX - initialTouches[0].x;
        let diffY = endY - initialTouches[0].y;
        let absX = Math.abs(diffX);
        let absY = Math.abs(diffY);
        let isSwipe = absX > 40 || absY > 40;

        if (!isMoving || touchDuration < 200) {
            // TAPS & CLICKS
            if (maxFingers === 1) {
                let rect = touchpad.getBoundingClientRect();
                let isBottom = endY > rect.height * 0.7; // Bottom 30% of screen
                
                if (isBottom && endX < rect.width * 0.3) {
                    socket.emit('click', {button: 'left'});
                } else if (isBottom && endX > rect.width * 0.7) {
                    socket.emit('click', {button: 'right'});
                } else {
                    if (Date.now() - lastTapTime < 300) {
                        socket.emit('click', {button: 'left', double: true});
                        lastTapTime = 0; 
                    } else {
                        socket.emit('click', {button: 'left'});
                        lastTapTime = Date.now();
                    }
                }
            } else if (maxFingers === 2) {
                socket.emit('click', {button: 'right'});
            } else if (maxFingers === 3) {
                socket.emit('gesture', {action: '3_finger_tap'});
            } else if (maxFingers === 4) {
                socket.emit('gesture', {action: '4_finger_tap'});
            }
        } else if (isSwipe) {
            // SWIPES
            if (maxFingers === 3) {
                if (absY > absX) {
                    if (diffY < 0) socket.emit('gesture', {action: '3_finger_up'}); 
                    else socket.emit('gesture', {action: '3_finger_down'}); 
                } else {
                    if (diffX < 0) socket.emit('gesture', {action: '3_finger_left'}); 
                    else socket.emit('gesture', {action: '3_finger_right'});
                }
            } else if (maxFingers === 4) {
                if (absY > absX) {
                    if (diffY < 0) socket.emit('gesture', {action: '4_finger_up'}); 
                    else socket.emit('gesture', {action: '4_finger_down'}); 
                } else {
                    if (diffX < 0) socket.emit('gesture', {action: '4_finger_left'}); 
                    else socket.emit('gesture', {action: '4_finger_right'});
                }
            }
        }
        
        // Reset states
        maxFingers = 0;
        initialTouches = [];
    }
});