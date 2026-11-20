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
const volumeThreshold = 18; // Pixels per volume tick (low threshold = smooth, responsive volume slider)
const appSwitchStepThreshold = 35; // Pixels required to move to next/prev app in App Switcher
const fourFingerThreshold = 40; // Pixels required to trigger 4-finger discrete swipe

let initialTouches = [];
let maxFingers = 0;
let touchStartTime = 0;
let lastTapTime = 0;

let startX = 0, startY = 0;
let lastX = 0, lastY = 0;

// Gesture state tracking
let gestureAxis = null; // null | 'vertical' | 'horizontal'
let gestureFired = false; // For discrete swipes (4-finger gestures)
let isAltTabActive = false; // True while 3-finger horizontal App Switcher is visible
let swipeAccX = 0, swipeAccY = 0;

touchpad.addEventListener('touchstart', (e) => {
    touchStartTime = Date.now();
    gestureAxis = null;
    gestureFired = false;
    swipeAccX = 0;
    swipeAccY = 0;
    
    if (e.touches.length > maxFingers) {
        maxFingers = e.touches.length;
        initialTouches = Array.from(e.touches).map(t => ({x: t.clientX, y: t.clientY}));
    }

    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    lastX = startX;
    lastY = startY;
});

touchpad.addEventListener('touchmove', (e) => {
    e.preventDefault(); 
    
    let cx = e.touches[0].clientX;
    let cy = e.touches[0].clientY;
    let dx = cx - lastX;
    let dy = cy - lastY;

    if (maxFingers === 1) {
        // Pointer Movement
        socket.emit('move', {dx: dx * sensitivity, dy: dy * sensitivity});
    } else if (maxFingers === 2) {
        // Two Finger Scroll
        if (Math.abs(dy) > 1) { 
            socket.emit('scroll', {dy: -dy * scrollSens}); 
        }
    } else if (maxFingers === 3) {
        // 3-Finger Gestures (Continuous volume & Visual App Switcher)
        
        // 1. Determine and lock axis to prevent cross-talk (e.g. volume changing while switching apps)
        if (!gestureAxis) {
            swipeAccX += dx;
            swipeAccY += dy;
            let absX = Math.abs(swipeAccX);
            let absY = Math.abs(swipeAccY);
            
            if (absX > 12 || absY > 12) {
                if (absY >= absX) {
                    gestureAxis = 'vertical'; // Volume control mode
                    swipeAccX = 0;
                } else {
                    gestureAxis = 'horizontal'; // App switcher mode
                    swipeAccY = 0;
                }
            }
        }
        
        // 2. Locked to VERTICAL: VOLUME SLIDER ONLY
        if (gestureAxis === 'vertical') {
            swipeAccY += dy;
            swipeAccX = 0; // Strictly zero out any horizontal movement so windows never switch!
            
            if (swipeAccY < -volumeThreshold) {
                socket.emit('gesture', {action: '3_finger_up'});
                swipeAccY = 0;
                gestureFired = true;
            } else if (swipeAccY > volumeThreshold) {
                socket.emit('gesture', {action: '3_finger_down'});
                swipeAccY = 0;
                gestureFired = true;
            }
        }
        
        // 3. Locked to HORIZONTAL: APP SWITCHER OVERLAY
        else if (gestureAxis === 'horizontal') {
            swipeAccX += dx;
            swipeAccY = 0; // Strictly zero out vertical movement
            
            if (!isAltTabActive) {
                if (swipeAccX > 20) {
                    socket.emit('alt_tab_start', {dir: 'right'});
                    isAltTabActive = true;
                    gestureFired = true;
                    swipeAccX = 0;
                } else if (swipeAccX < -20) {
                    socket.emit('alt_tab_start', {dir: 'left'});
                    isAltTabActive = true;
                    gestureFired = true;
                    swipeAccX = 0;
                }
            } else {
                if (swipeAccX > appSwitchStepThreshold) {
                    socket.emit('alt_tab_step', {dir: 'right'});
                    swipeAccX = 0;
                } else if (swipeAccX < -appSwitchStepThreshold) {
                    socket.emit('alt_tab_step', {dir: 'left'});
                    swipeAccX = 0;
                }
            }
        }
    } else if (maxFingers === 4) {
        // 4-Finger Gestures (Discrete: fire ONCE per swipe gesture)
        if (!gestureFired) {
            swipeAccX += dx;
            swipeAccY += dy;
            let absX = Math.abs(swipeAccX);
            let absY = Math.abs(swipeAccY);
            
            if (absX > fourFingerThreshold || absY > fourFingerThreshold) {
                if (absY >= absX) {
                    if (swipeAccY < 0) {
                        socket.emit('gesture', {action: '4_finger_up'}); // Multitasking view (Win + Tab)
                    } else {
                        socket.emit('gesture', {action: '4_finger_down'}); // Show desktop (Win + D)
                    }
                } else {
                    if (swipeAccX < 0) {
                        socket.emit('gesture', {action: '4_finger_left'}); // Switch desktop
                    } else {
                        socket.emit('gesture', {action: '4_finger_right'}); // Switch desktop
                    }
                }
                gestureFired = true;
            }
        }
    }
    
    lastX = cx; lastY = cy;
});

touchpad.addEventListener('touchend', (e) => {
    // Commit selection in App Switcher when fingers are lifted
    if (isAltTabActive && e.touches.length === 0) {
        socket.emit('alt_tab_end');
        isAltTabActive = false;
    }

    // Only process Taps when all fingers are lifted
    if (e.touches.length === 0) {
        let touchDuration = Date.now() - touchStartTime;
        let endX = e.changedTouches[0].clientX;
        let endY = e.changedTouches[0].clientY;
        let totalDist = Math.hypot(endX - startX, endY - startY);

        // Tap detected: No swipe fired, minimal travel distance (< 25px), and quick tap (< 350ms)
        let isTap = !gestureFired && !isAltTabActive && totalDist < 25 && touchDuration < 350;

        if (isTap) {
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
                socket.emit('gesture', {action: '3_finger_tap'}); // Play / Pause
            } else if (maxFingers === 4) {
                socket.emit('gesture', {action: '4_finger_tap'}); // Win + A (Action Center)
            }
        }
        
        // Reset states
        maxFingers = 0;
        gestureAxis = null;
        gestureFired = false;
        initialTouches = [];
        swipeAccX = 0;
        swipeAccY = 0;
    }
});

touchpad.addEventListener('touchcancel', () => {
    if (isAltTabActive) {
        socket.emit('alt_tab_end');
        isAltTabActive = false;
    }
    maxFingers = 0;
    gestureAxis = null;
    gestureFired = false;
    initialTouches = [];
    swipeAccX = 0;
    swipeAccY = 0;
});