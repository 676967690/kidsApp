const state = {
    mode: null,
    difficulty: 'easy',
    format: '12',
    theme: 'light',
    score: 0,
    round: 0,
    maxRounds: 10,
    timer: null,
    timeLeft: 0,
    targetTime: { h: 0, m: 0, isPM: false, format: '12' },
    isPlaying: false,
    currentClockTime: { h: 12, m: 0 },
    gameOver: false
};

const screens = {
    menu: document.getElementById('mainMenu'),
    game: document.getElementById('gameScreen'),
    results: document.getElementById('resultsScreen')
};

const ui = {
    modeDisplay: document.getElementById('modeDisplay'),
    roundDisplay: document.getElementById('roundDisplay'),
    timerDisplay: document.getElementById('timerDisplay'),
    scoreDisplay: document.getElementById('scoreDisplay'),
    feedback: document.getElementById('feedback'),
    checkBtn: document.getElementById('checkBtn'),
    nextBtn: document.getElementById('nextBtn'),
    quitBtn: document.getElementById('quitBtn'),
    targetInstruction: document.getElementById('targetInstruction'),
    targetTimeText: document.getElementById('targetTimeText'),
    ampmToggleContainer: document.getElementById('ampmToggleContainer'),
    ampmCheckbox: document.getElementById('ampmCheckbox'),
    toggleHint: document.getElementById('toggleHint')
};

let canvas, ctx;
let clockRadius;
let isDragging = false;
let dragType = null;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'tick') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'correct') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.linearRampToValueAtTime(1000, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'wrong') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    }
}

function initClock() {
    canvas = document.getElementById('clockCanvas');
    ctx = canvas.getContext('2d');
    clockRadius = canvas.width / 2;

    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    canvas.addEventListener('touchstart', (e) => onPointerDown(e.touches[0]), { passive: false });
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        onPointerMove(e.touches[0]);
    }, { passive: false });
    window.addEventListener('touchend', onPointerUp);

    drawClock(state.currentClockTime.h, state.currentClockTime.m);
}

function getAngleFromEvent(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    let angle = Math.atan2(y - cy, x - cx);
    angle = angle * (180 / Math.PI);
    angle += 90;
    if (angle < 0) angle += 360;

    return angle;
}

function onPointerDown(e) {
    if (!state.isPlaying) return;
    isDragging = true;
    const angle = getAngleFromEvent(e.clientX, e.clientY);

    const hAngle = ((state.currentClockTime.h % 12) + state.currentClockTime.m / 60) * 30;
    const mAngle = state.currentClockTime.m * 6;

    const diffH = Math.abs(normalizeAngle(angle - hAngle));
    const diffM = Math.abs(normalizeAngle(angle - mAngle));

    if (diffH < diffM) {
        dragType = 'hour';
    } else {
        dragType = 'minute';
    }

    updateClockFromAngle(angle);
}

function onPointerMove(e) {
    if (!isDragging || !state.isPlaying) return;
    const angle = getAngleFromEvent(e.clientX, e.clientY);
    updateClockFromAngle(angle);
}

function onPointerUp() {
    isDragging = false;
    dragType = null;
}

function normalizeAngle(angle) {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
}

function updateClockFromAngle(angle) {
    let newH = state.currentClockTime.h;
    let newM = state.currentClockTime.m;

    if (dragType === 'minute') {
        newM = Math.round(angle / 6);
        if (newM === 60) newM = 0;

        const prevM = state.currentClockTime.m;
        if (prevM === 59 && newM === 0) {
            newH = (newH + 1) % 24;
        } else if (prevM === 0 && newM === 59) {
            newH = (newH - 1 + 24) % 24;
        }
    } else if (dragType === 'hour') {
        const totalMinutes = (state.currentClockTime.h * 60) + state.currentClockTime.m;
        const currentAngle = (totalMinutes / (12 * 60)) * 360;

        let deltaAngle = angle - currentAngle;
        if (deltaAngle > 180) deltaAngle -= 360;
        if (deltaAngle < -180) deltaAngle += 360;

        const deltaMinutes = Math.round((deltaAngle / 360) * (12 * 60));
        let newTotalMinutes = totalMinutes + deltaMinutes;

        if (newTotalMinutes < 0) newTotalMinutes += (24 * 60);
        if (newTotalMinutes >= (24 * 60)) newTotalMinutes -= (24 * 60);

        newH = Math.floor(newTotalMinutes / 60);
        newM = newTotalMinutes % 60;
    }

    state.currentClockTime = { h: newH, m: newM };
    drawClock(newH, newM);
    playSound('tick');
}

function drawClock(h, m) {
    const W = canvas.width;
    const H = canvas.height;
    const CX = W / 2;
    const CY = H / 2;
    const R = clockRadius - 15;

    ctx.clearRect(0, 0, W, H);

    // Draw Minute Marks (Dots)
    for (let i = 0; i < 60; i++) {
        if (i % 5 !== 0) {
            const angle = (i * 6) * (Math.PI / 180);
            const x = CX + Math.sin(angle) * (R - 5);
            const y = CY - Math.cos(angle) * (R - 5);

            ctx.beginPath();
            ctx.arc(x, y, 2, 0, 2 * Math.PI);
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-color').trim();
            ctx.fill();
        }
    }

    // Draw Hour Marks (Lines)
    for (let i = 1; i <= 12; i++) {
        const angle = (i * 30) * (Math.PI / 180);
        const x1 = CX + Math.sin(angle) * (R - 20);
        const y1 = CY - Math.cos(angle) * (R - 20);
        const x2 = CX + Math.sin(angle) * R;
        const y2 = CY - Math.cos(angle) * R;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-color').trim();
        ctx.stroke();
    }

    // Hour hand
    const hAngle = ((h % 12) + m / 60) * 30 * (Math.PI / 180);
    drawHand(CX, CY, hAngle, 0.55 * R, 6, '--hand-hour');

    // Minute hand
    const mAngle = m * 6 * (Math.PI / 180);
    drawHand(CX, CY, mAngle, 0.8 * R, 4, '--hand-minute');

    // Center dot
    ctx.beginPath();
    ctx.arc(CX, CY, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#2d3748';
    ctx.fill();
}

function drawHand(cx, cy, angle, length, width, colorVar) {
    const color = getComputedStyle(document.body).getPropertyValue(colorVar).trim();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.rect(-width / 2, -length, width, length);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
}

const game = {
    startLearningMode: () => {
        state.mode = 'learning';
        state.format = document.getElementById('formatSelect').value;
        startGame();
    },
    startCompetitionMode: () => {
        state.mode = 'competition';
        state.format = document.getElementById('formatSelect').value;
        startGame();
    }
};

function startGame() {
    state.score = 0;
    state.round = 0;
    state.isPlaying = true;
    state.gameOver = false;

    screens.menu.classList.remove('active');
    screens.results.classList.remove('active');
    screens.game.classList.add('active');

    ui.modeDisplay.textContent = `Mode: ${state.mode === 'learning' ? 'Learning' : 'Competition'}`;
    ui.checkBtn.style.display = 'block';
    ui.nextBtn.style.display = 'none';

    ui.ampmToggleContainer.style.display = 'flex';

    updateFormatToggleAccess();

    nextRound();
}

// ------------------------------------------------------------
// Generates a new target time and resets the clock & toggle,
// WITHOUT changing the round number.
// ------------------------------------------------------------
function generateRound() {
    // Safety: if competition is over, do nothing (shouldn't be called)
    if (state.mode === 'competition' && state.round >= state.maxRounds) return;

    // Update round display (unchanged, just for correctness)
    ui.roundDisplay.textContent = `Round: ${state.round}/${state.maxRounds}`;
    ui.scoreDisplay.textContent = `Score: ${state.score}`;
    ui.feedback.textContent = '';
    ui.feedback.className = 'feedback';

    // Restart timer if competition
    clearInterval(state.timer);
    if (state.mode === 'competition') {
        let limit = 45;
        state.timeLeft = limit;
        ui.timerDisplay.style.display = 'inline';
        ui.timerDisplay.textContent = `Time: ${state.timeLeft}s`;

        state.timer = setInterval(() => {
            state.timeLeft--;
            ui.timerDisplay.textContent = `Time: ${state.timeLeft}s`;
            if (state.timeLeft <= 0) {
                clearInterval(state.timer);
                handleAnswer(false);
            }
        }, 1000);
    } else {
        ui.timerDisplay.style.display = 'none';
    }

    // Determine format for this round
    let currentFormat = state.format;
    if (state.format === 'mixed') {
        currentFormat = Math.random() > 0.5 ? '12' : '24';
    }

    let targetH, targetIsPM, displayH, suffix;

    if (currentFormat === '12') {
        const clockFaceH = Math.floor(Math.random() * 12);
        targetIsPM = Math.random() > 0.5;

        if (clockFaceH === 0) {
            targetH = targetIsPM ? 12 : 0;
        } else {
            targetH = targetIsPM ? clockFaceH + 12 : clockFaceH;
        }

        displayH = clockFaceH === 0 ? 12 : clockFaceH;
        suffix = targetIsPM ? ' PM' : ' AM';
    } else {
        targetH = Math.floor(Math.random() * 24);
        targetIsPM = targetH >= 12;
        displayH = targetH;
        suffix = '';
    }

    const m = Math.floor(Math.random() * 60);

    state.targetTime = {
        h: targetH,
        m: m,
        isPM: targetIsPM,
        format: currentFormat
    };

    ui.targetTimeText.textContent =
        `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}${suffix}`;

    // Always start with AM toggle and clock at 12:00
    ui.ampmCheckbox.checked = false;
    updateToggleHint(false);
    state.currentClockTime = { h: 12, m: 0 };
    drawClock(12, 0);

    ui.checkBtn.style.display = 'block';
    ui.nextBtn.style.display = 'none';

    updateFormatToggleAccess();
}

// ------------------------------------------------------------
// nextRound: increments round, then calls generateRound()
// ------------------------------------------------------------
function nextRound() {
    if (state.mode === 'competition' && state.round >= state.maxRounds) {
        endGame();
        return;
    }

    state.round++;
    generateRound();
}

function updateToggleHint(isChecked) {
    ui.toggleHint.textContent = isChecked ? 'PM' : 'AM';
}

ui.ampmCheckbox.addEventListener('change', (e) => {
    updateToggleHint(e.target.checked);
});

function getEffectiveHour(internalH, isPM) {
    const faceH = internalH % 12;
    if (isPM) {
        return faceH === 0 ? 12 : faceH + 12;
    } else {
        return faceH === 0 ? 0 : faceH;
    }
}

function checkAnswer() {
    const inputH = state.currentClockTime.h;
    const inputM = state.currentClockTime.m;
    const inputIsPM = ui.ampmCheckbox.checked;

    const targetH = state.targetTime.h;
    const targetM = state.targetTime.m;
    const targetIsPM = state.targetTime.isPM;

    const effectiveInputH = getEffectiveHour(inputH, inputIsPM);

    if (inputIsPM !== targetIsPM) {
        handleAnswer(false);
        return;
    }

    const correct = (effectiveInputH === targetH && inputM === targetM);
    handleAnswer(correct);
}

function handleAnswer(isCorrect) {
    clearInterval(state.timer);
    ui.checkBtn.style.display = 'none';
    ui.nextBtn.style.display = 'block';

    if (isCorrect) {
        ui.feedback.textContent = "Correct!";
        ui.feedback.classList.add('correct');
        playSound('correct');
        state.score += 10 + (state.mode === 'competition' ? state.timeLeft : 0);
    } else {
        let h = state.targetTime.h;
        let m = state.targetTime.m;
        let suffix = '';

        if (state.targetTime.format === '12') {
            suffix = h >= 12 ? ' PM' : ' AM';
            h = h % 12;
            if (h === 0) h = 12;
        }

        ui.feedback.textContent =
            `Wrong! It was ${h}:${m.toString().padStart(2, '0')}${suffix}`;
        ui.feedback.classList.add('incorrect');
        playSound('wrong');
        drawClock(state.targetTime.h, state.targetTime.m);
    }
    ui.scoreDisplay.textContent = `Score: ${state.score}`;
}

function endGame() {
    screens.game.classList.remove('active');
    screens.results.classList.add('active');
    document.getElementById('finalScoreVal').textContent = state.score;
    const estimatedCorrect = Math.min(state.maxRounds, Math.floor(state.score / 10));
    document.getElementById('correctCount').textContent = estimatedCorrect;
    state.isPlaying = false;
    state.gameOver = true;
    updateFormatToggleAccess();
}

function updateFormatToggleAccess() {
    const btn = document.getElementById('formatToggle');
    const locked =
        (state.mode === 'competition') &&
        (state.gameOver || (state.isPlaying && state.round > 1));

    if (locked) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
    } else {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
}

ui.checkBtn.addEventListener('click', checkAnswer);
ui.nextBtn.addEventListener('click', nextRound);
ui.quitBtn.addEventListener('click', () => location.reload());

document.getElementById('themeToggle').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    document.getElementById('themeToggle').textContent =
        state.theme === 'light' ? '🌙 Dark' : '☀️ Light';
    if (state.isPlaying) drawClock(state.currentClockTime.h, state.currentClockTime.m);
});

document.getElementById('formatToggle').addEventListener('click', () => {
    // Locked in competition after round 1 or after game over
    if (
        state.mode === 'competition' &&
        (state.gameOver || (state.isPlaying && state.round > 1))
    ) {
        return;
    }

    let modes = ['12', '24', 'mixed'];
    let idx = modes.indexOf(state.format);
    state.format = modes[(idx + 1) % modes.length];
    document.getElementById('formatToggle').textContent =
        `Mode: ${state.format === 'mixed' ? 'Mixed' : state.format + 'H'}`;
    document.getElementById('formatSelect').value = state.format;

    // ✅ Refresh the round without incrementing the round number
    if (state.isPlaying) {
        clearInterval(state.timer);
        generateRound();
    }

    updateFormatToggleAccess();
});

initClock();