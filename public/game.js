/* ==========================================
   MURDER MYSTERY — Game Logic
   ========================================== */

// ============== CONFIGURATION ==============
const CONFIG = {
    apiUrl: '/api/chat',          // Proxied through our backend server
    modelsUrl: '/api/models',     // Fetch available NVIDIA models
    defaultModel: 'meta/llama-3.3-70b-instruct',
    maxQuestions: 15,
    maxHistoryPerSuspect: 10,
};

// ============== SUSPECT DEFINITIONS ==============
const SUSPECTS = {
    golu_golu: {
        name: 'Golu Golu',
        color: '#f97316',
        emoji: { normal: '😰', defensive: '😅', scared: '😱' },
        defaultPersonality: 'Nervous, fidgety, always snacking. Talks too much when anxious. Sweats profusely under pressure.'
    },
    musalman: {
        name: 'Musalman',
        color: '#14b8a6',
        emoji: { normal: '😎', defensive: '🤨', scared: '😤' },
        defaultPersonality: 'Cool, calculated, speaks precisely. Always has a perfect answer ready. Never breaks eye contact.'
    },
    habibi: {
        name: 'Habibi',
        color: '#a855f7',
        emoji: { normal: '🎭', defensive: '😢', scared: '🤯' },
        defaultPersonality: 'Dramatic, emotional, passionate. Uses grand gestures when speaking. Gets tearful easily.'
    }
};

// ============== GAME STATE ==============
let gameState = {
    caseData: null,
    questionsLeft: CONFIG.maxQuestions,
    currentSuspect: null,
    chatHistory: {},       // { suspect_key: [{ q: '...', a: '...', summary: '...' }] }
    cluesFound: [],        // clue IDs the player has "seen"
    cluesRevealed: [],     // clue IDs that have been flipped
    confrontations: 0,
    demoMode: false,
    isProcessing: false,
    difficulty: 'easy',    // easy | hard | nightmare
    timer: null,           // timer interval id
    timerSeconds: 0,
};

// ============== DIFFICULTY PRESETS ==============
const DIFFICULTY = {
    easy:      { questions: 20, timed: false, timerSec: 0,  cluesHidden: false, redHerrings: 0 },
    hard:      { questions: 10, timed: true,  timerSec: 60, cluesHidden: true,  redHerrings: 0 },
    nightmare: { questions: 7,  timed: true,  timerSec: 45, cluesHidden: true,  redHerrings: 2 },
};

// ============== SOUND SYSTEM ==============
const SFX = {
    muted: false,
    audioCtx: null,
    init() {
        if (this.audioCtx) return;
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.muted = localStorage.getItem('mm_muted') === 'true';
        this.updateToggle();
    },
    updateToggle() {
        const btn = document.getElementById('sound-toggle');
        if (btn) {
            btn.textContent = this.muted ? '\ud83d\udd07' : '\ud83d\udd0a';
            btn.classList.toggle('muted', this.muted);
        }
    },
    toggle() {
        this.muted = !this.muted;
        localStorage.setItem('mm_muted', this.muted);
        this.updateToggle();
    },
    // Play a synthesized sound using Web Audio API (no files needed)
    play(type) {
        if (this.muted || !this.audioCtx) return;
        const ctx = this.audioCtx;
        const now = ctx.currentTime;
        const gain = ctx.createGain();
        gain.connect(ctx.destination);

        if (type === 'click') {
            const osc = ctx.createOscillator();
            osc.type = 'sine'; osc.frequency.value = 800;
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.connect(gain); osc.start(now); osc.stop(now + 0.08);
        }
        else if (type === 'typewriter') {
            const osc = ctx.createOscillator();
            osc.type = 'square'; osc.frequency.value = 400 + Math.random() * 200;
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
            osc.connect(gain); osc.start(now); osc.stop(now + 0.03);
        }
        else if (type === 'suspense') {
            // Low ominous rumble
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth'; osc.frequency.value = 60;
            osc.frequency.linearRampToValueAtTime(40, now + 1.5);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
            osc.connect(gain); osc.start(now); osc.stop(now + 1.5);
        }
        else if (type === 'gavel') {
            // Sharp hit
            const osc = ctx.createOscillator();
            osc.type = 'square'; osc.frequency.value = 120;
            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.connect(gain); osc.start(now); osc.stop(now + 0.3);
            // Secondary thud
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            gain2.connect(ctx.destination);
            osc2.type = 'sine'; osc2.frequency.value = 80;
            gain2.gain.setValueAtTime(0.2, now + 0.05);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc2.connect(gain2); osc2.start(now + 0.05); osc2.stop(now + 0.4);
        }
        else if (type === 'reveal') {
            // Ascending chime
            [440, 554, 659, 880].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                g.connect(ctx.destination);
                osc.type = 'sine'; osc.frequency.value = freq;
                g.gain.setValueAtTime(0.1, now + i * 0.15);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
                osc.connect(g); osc.start(now + i * 0.15); osc.stop(now + i * 0.15 + 0.4);
            });
        }
        else if (type === 'fail') {
            // Descending somber
            [300, 250, 200, 150].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                g.connect(ctx.destination);
                osc.type = 'triangle'; osc.frequency.value = freq;
                g.gain.setValueAtTime(0.1, now + i * 0.2);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.5);
                osc.connect(g); osc.start(now + i * 0.2); osc.stop(now + i * 0.2 + 0.5);
            });
        }
        else if (type === 'flip') {
            const osc = ctx.createOscillator();
            osc.type = 'sine'; osc.frequency.value = 600;
            osc.frequency.exponentialRampToValueAtTime(900, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.connect(gain); osc.start(now); osc.stop(now + 0.15);
        }
        else if (type === 'tick') {
            const osc = ctx.createOscillator();
            osc.type = 'sine'; osc.frequency.value = 1000;
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
            osc.connect(gain); osc.start(now); osc.stop(now + 0.02);
        }
    }
};

// ============== DEMO CASE DATA ==============
const DEMO_CASE = {
    victim: "Professor Midnight",
    setting: "The Velvet Lounge",
    scene_description: "Professor Midnight was found slumped over the grand piano in The Velvet Lounge at 11:47 PM. A shattered wine glass lay nearby, its contents staining the ivory keys a deep crimson. The room smelled faintly of almonds — a telltale sign. The only light came from a flickering neon sign outside the rain-streaked window.",
    time_of_death: "Between 10:30 PM and 11:00 PM",
    murder_weapon: "Cyanide-laced red wine",
    killer: "habibi",
    suspects: {
        golu_golu: {
            personality: "Nervous, fidgety, always snacking. Talks way too much when anxious. Sweats profusely under pressure.",
            alibi: "I was in the kitchen the whole time, making myself a sandwich. A really big sandwich. I didn't see anything, I swear!",
            truth: "Was actually in the kitchen but peeked through the serving window and saw Habibi near the piano around 10:45 PM.",
            lies: [
                "Claims he never left the kitchen area and didn't look through the serving window",
                "Says he didn't hear any unusual sounds like glass breaking"
            ],
            motive: "Professor Midnight failed him three times in Advanced Chemistry",
            relationship: "Failed student of the victim"
        },
        musalman: {
            personality: "Cool, calculated, speaks precisely. Always has a perfect answer ready. Never breaks eye contact.",
            alibi: "I was on the terrace making an important business call. You can check my call logs if you want — I have nothing to hide.",
            truth: "Was indeed on the terrace but the call ended at 10:20 PM. He has no alibi for the next 40 minutes. Went to the bathroom and heard footsteps near the lounge.",
            lies: [
                "Claims the phone call lasted until 11 PM when it actually ended at 10:20 PM",
                "Says he never went back inside the building until hearing the scream"
            ],
            motive: "Professor Midnight was about to publish a paper exposing his research fraud",
            relationship: "Research rival of the victim"
        },
        habibi: {
            personality: "Dramatic, emotional, passionate. Uses grand gestures when speaking. Gets tearful easily but recovers suspiciously fast.",
            alibi: "I was in the garden, stargazing and writing poetry! The Professor was my dearest friend — why would I ever hurt someone I love?",
            truth: "Entered through the garden door, poisoned the wine while the Professor played piano, then returned to the garden. Has a pharmacy background and access to chemicals.",
            lies: [
                "Claims to have been in the garden since 9 PM without ever going inside",
                "Says the garden door was locked from the inside so they couldn't have entered"
            ],
            motive: "Discovered Professor Midnight had been secretly dating their ex-partner for six months",
            relationship: "Close friend (and secret bitter rival) of the victim"
        }
    },
    clues: [
        { id: 1, text: "A half-eaten sandwich was found in the kitchen. Still fresh — someone was definitely here recently.", points_to: "golu_golu", type: "physical" },
        { id: 2, text: "Phone records show a call from the terrace ended at 10:20 PM, not 11 PM as claimed.", points_to: "musalman", type: "evidence" },
        { id: 3, text: "Muddy footprints lead from the garden door to the piano and back again.", points_to: "habibi", type: "physical" },
        { id: 4, text: "A pharmacy receipt for potassium cyanide compound was found crumpled in the garden trash.", points_to: "habibi", type: "physical" },
        { id: 5, text: "The kitchen serving window has a clear, unobstructed view of the grand piano.", points_to: "golu_golu", type: "testimony" },
        { id: 6, text: "A torn love letter from the victim's new partner was found scattered in the garden bushes.", points_to: "habibi", type: "evidence" },
        { id: 7, text: "The garden door lock is broken — the staff confirms it hasn't worked in weeks.", points_to: "habibi", type: "physical" }
    ],
    solution_explanation: "Habibi poisoned Professor Midnight's wine with cyanide obtained using their pharmacy background. The muddy footprints leading from garden to piano and back, the broken garden door lock (contradicting Habibi's claim it was locked), the pharmacy receipt, and the torn love letter revealing jealousy all point to Habibi as the killer."
};

// ============== INITIALIZATION ==============
document.addEventListener('DOMContentLoaded', () => {
    createRain();
    loadSettings();
    attachEventListeners();
    updateHistoryDisplay();
    SFX.init();
});

function attachEventListeners() {
    // Title screen
    document.getElementById('btn-new-case').addEventListener('click', () => startNewCase(false));
    document.getElementById('btn-demo-mode').addEventListener('click', () => startNewCase(true));
    document.getElementById('btn-settings').addEventListener('click', () => showModal('modal-settings'));
    document.getElementById('btn-history').addEventListener('click', () => showModal('modal-history'));

    // Crime scene
    document.getElementById('btn-accuse').addEventListener('click', showAccusation);
    document.getElementById('btn-back-scene').addEventListener('click', () => { clearTimer(); showScreen('screen-crime'); });

    // Interrogation
    document.getElementById('btn-ask').addEventListener('click', askQuestion);
    document.getElementById('question-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askQuestion(); }
    });
    document.getElementById('btn-confront').addEventListener('click', openConfront);

    // Accusation
    document.getElementById('btn-play-again').addEventListener('click', () => startNewCase(gameState.demoMode));
    document.getElementById('btn-back-title').addEventListener('click', () => showScreen('screen-title'));

    // Sound toggle
    document.getElementById('sound-toggle').addEventListener('click', () => { SFX.init(); SFX.toggle(); });

    // Difficulty selector
    document.querySelectorAll('.difficulty-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.difficulty-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            const diff = opt.getAttribute('data-difficulty');
            const preset = DIFFICULTY[diff];
            document.getElementById('questions-input').value = preset.questions;
        });
    });

    // Add click sounds to all buttons
    document.addEventListener('click', (e) => {
        if (e.target.closest('.btn') || e.target.closest('.suspect-card') || e.target.closest('.difficulty-option')) {
            SFX.init(); SFX.play('click');
        }
    });

    // Settings
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
    document.getElementById('btn-clear-history').addEventListener('click', clearHistory);
    document.getElementById('btn-fetch-models').addEventListener('click', fetchAvailableModels);
    document.getElementById('btn-test-connection').addEventListener('click', testConnection);

    // Confront
    document.getElementById('btn-do-confront').addEventListener('click', executeConfront);

    // Modal close buttons
    document.querySelectorAll('.btn-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-close-modal');
            if (modalId) hideModal(modalId);
        });
    });

    // Close modals on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', () => {
            backdrop.closest('.modal').classList.add('hidden');
        });
    });
}

// ============== SCREEN MANAGEMENT ==============
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.add('active');
        screen.classList.add('screen-flash');
        setTimeout(() => screen.classList.remove('screen-flash'), 600);
    }
}

function showModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// ============== RAIN EFFECT ==============
function createRain() {
    const container = document.getElementById('rain-container');
    const count = 80;
    for (let i = 0; i < count; i++) {
        const drop = document.createElement('div');
        drop.className = 'raindrop';
        drop.style.left = Math.random() * 100 + '%';
        drop.style.height = (Math.random() * 20 + 10) + 'px';
        drop.style.animationDuration = (Math.random() * 1 + 0.5) + 's';
        drop.style.animationDelay = (Math.random() * 2) + 's';
        drop.style.opacity = Math.random() * 0.3 + 0.1;
        container.appendChild(drop);
    }
}

// ============== TYPEWRITER EFFECT ==============
function typewriter(element, text, speed = 25) {
    return new Promise(resolve => {
        element.textContent = '';
        element.classList.add('typewriter-cursor');
        let i = 0;
        const interval = setInterval(() => {
            if (i < text.length) {
                element.textContent += text[i];
                if (i % 2 === 0) SFX.play('typewriter');
                i++;
            } else {
                clearInterval(interval);
                element.classList.remove('typewriter-cursor');
                resolve();
            }
        }, speed);
    });
}

// ============== LOADING SCREEN ==============
const LOADING_MESSAGES = [
    '🔍 Analyzing crime scene...',
    '🧪 Examining evidence...',
    '👤 Profiling suspects...',
    '📋 Compiling case file...',
    '🕵️ Preparing interrogation rooms...',
];

function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    const steps = document.getElementById('loading-steps');
    const fill = overlay.querySelector('.loading-bar-fill');
    overlay.classList.remove('hidden');
    steps.innerHTML = '';
    fill.style.width = '0%';

    LOADING_MESSAGES.forEach((msg, i) => {
        setTimeout(() => {
            const step = document.createElement('div');
            step.className = 'loading-step';
            step.textContent = msg;
            steps.appendChild(step);
            fill.style.width = ((i + 1) / LOADING_MESSAGES.length * 90) + '%';
        }, i * 600);
    });
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    const fill = overlay.querySelector('.loading-bar-fill');
    fill.style.width = '100%';
    setTimeout(() => overlay.classList.add('hidden'), 400);
}

// ============== API FUNCTIONS ==============
function getApiKey() {
    return localStorage.getItem('mm_api_key') || '';
}

function getModel() {
    return localStorage.getItem('mm_model') || CONFIG.defaultModel;
}

async function callAI(messages, maxTokens = 800) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('NO_API_KEY');

    // Route through our backend proxy — API key stays in the request body
    // and the server forwards it to NVIDIA NIM.
    const response = await fetch(CONFIG.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            apiKey: apiKey,
            model: getModel(),
            messages: messages,
            temperature: 0.8,
            max_tokens: maxTokens,
        })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const status = response.status;
        let msg = errData.error?.message || `NVIDIA API returned ${status}`;
        if (status === 403) msg = '403 Forbidden — Your API key may be invalid, expired, or lacks access to the selected model. Go to https://build.nvidia.com to get a new key.';
        if (status === 401) msg = '401 Unauthorized — Invalid API key. Make sure it starts with nvapi-';
        throw new Error(msg);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('The AI model returned an empty response. Try a different model in Settings.');
    return content.trim();
}

// ============== THE GOD CALL ==============
function tryRepairJSON(str) {
    // Attempt to fix truncated JSON by closing open brackets/braces
    let s = str.trim();
    // Remove trailing comma
    s = s.replace(/,\s*$/, '');
    // Count open/close brackets
    let braces = 0, brackets = 0, inString = false, escape = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (escape) { escape = false; continue; }
        if (c === '\\') { escape = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === '{') braces++;
        if (c === '}') braces--;
        if (c === '[') brackets++;
        if (c === ']') brackets--;
    }
    // If we're inside a string, close it
    if (inString) s += '"';
    // Close any open brackets/braces
    while (brackets > 0) { s += ']'; brackets--; }
    while (braces > 0) { s += '}'; braces--; }
    return s;
}

async function generateCase() {
    const prompt = `Generate a murder mystery as JSON. Suspects: Golu Golu (key:golu_golu), Musalman (key:musalman), Habibi (key:habibi). Pick ONE random killer. Keep descriptions SHORT (1 sentence each). Return ONLY valid JSON:
{"victim":"name","setting":"place","scene_description":"1-2 sentences","time_of_death":"time","murder_weapon":"weapon","killer":"suspect_key","suspects":{"golu_golu":{"personality":"brief","alibi":"claim","truth":"reality","lies":["lie1","lie2"],"motive":"motive","relationship":"relation"},"musalman":{...same...},"habibi":{...same...}},"clues":[{"id":1,"text":"clue","points_to":"suspect_key","type":"physical"},...5 total],"solution_explanation":"how clues prove the killer"}`;

    const raw = await callAI([{ role: 'user', content: prompt }], 3000);

    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = raw;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    let caseData;
    try {
        caseData = JSON.parse(jsonStr);
    } catch (e) {
        // Try to repair truncated JSON
        const repaired = tryRepairJSON(jsonStr);
        try {
            caseData = JSON.parse(repaired);
        } catch (e2) {
            throw new Error('AI returned malformed JSON. Retrying may help, or try a different model.');
        }
    }

    // Validate required fields
    if (!caseData.killer || !caseData.suspects || !caseData.clues) {
        throw new Error('Invalid case data: missing required fields');
    }

    // Validate killer is one of our suspects
    if (!['golu_golu', 'musalman', 'habibi'].includes(caseData.killer)) {
        throw new Error('Invalid killer in case data');
    }

    return caseData;
}

// ============== INTERROGATION CALL ==============
async function interrogateSuspect(suspectKey, question) {
    const caseData = gameState.caseData;
    const suspect = caseData.suspects[suspectKey];
    const suspectDef = SUSPECTS[suspectKey];
    const history = gameState.chatHistory[suspectKey] || [];

    // Build compressed history (only summaries)
    let historyText = 'No previous questions.';
    if (history.length > 0) {
        historyText = history.map(h => h.summary).join('\n');
    }

    const prompt = `You are ${suspectDef.name} in a murder mystery. Stay FULLY in character.

Your personality: ${suspect.personality}
Your alibi: ${suspect.alibi}
What you're actually hiding: ${suspect.truth}
Your lies: ${suspect.lies.join('; ')}

The victim "${caseData.victim}" was found dead at "${caseData.setting}".
${suspectKey === caseData.killer ? 'YOU are the killer. Be evasive and subtly defensive but do NOT confess.' : 'You are NOT the killer, but you ARE hiding something.'}

Previous conversation summary:
${historyText}

The detective asks: "${question}"

Respond in 1-3 sentences ONLY. Stay in character. Be evasive about your lies. If pressed on inconsistencies, get nervous/defensive but don't fully confess.`;

    const response = await callAI([
        { role: 'system', content: `You are ${suspectDef.name}, a suspect in a murder investigation. Respond in character in 1-3 short sentences.` },
        { role: 'user', content: prompt }
    ], 150);

    return response;
}

// Compress a response into a one-line summary
function compressResponse(question, answer) {
    // Take first sentence of the answer, max 80 chars
    const firstSentence = answer.split(/[.!?]/)[0].trim();
    const compressed = firstSentence.length > 80 ? firstSentence.substring(0, 77) + '...' : firstSentence;
    const shortQ = question.length > 40 ? question.substring(0, 37) + '...' : question;
    return `Q: "${shortQ}" → A: "${compressed}"`;
}

// ============== CONFRONT CALL ==============
async function confrontCall(suspectKey, clueText) {
    const caseData = gameState.caseData;
    const suspect = caseData.suspects[suspectKey];
    const suspectDef = SUSPECTS[suspectKey];

    const prompt = `You are ${suspectDef.name} being confronted with evidence in a murder investigation.

Your personality: ${suspect.personality}
Your alibi: ${suspect.alibi}
What you're hiding: ${suspect.truth}
${suspectKey === caseData.killer ? 'You ARE the killer. Be very defensive but do NOT confess.' : 'You are NOT the killer but you are hiding something.'}

The detective slams this evidence on the table:
"${clueText}"

React in 2-3 sentences. Show emotion matching your personality. If this evidence contradicts your story, be visibly shaken but try to explain it away.`;

    const response = await callAI([
        { role: 'system', content: `You are ${suspectDef.name} being confronted with evidence. React emotionally in 2-3 sentences. Stay in character.` },
        { role: 'user', content: prompt }
    ], 150);

    return response;
}

// ============== NOIR INTRO CINEMATIC ==============
const NOIR_LINES = [
    "It was a dark and rainy night...",
    "The kind of night where trouble finds you\nbefore you can find your coat.",
    "A call came in. A body was found.",
    "Three suspects. One truth.\nThe rest? Lies.",
    "Time to get to work, detective."
];

function playNoirIntro() {
    return new Promise(resolve => {
        SFX.play('suspense');

        const overlay = document.createElement('div');
        overlay.className = 'noir-intro';
        const textEl = document.createElement('div');
        textEl.className = 'noir-intro-text';
        const skipBtn = document.createElement('button');
        skipBtn.className = 'skip-btn';
        skipBtn.textContent = 'Skip ▸';
        overlay.appendChild(textEl);
        overlay.appendChild(skipBtn);
        document.body.appendChild(overlay);

        let cancelled = false;
        skipBtn.addEventListener('click', () => {
            cancelled = true;
            overlay.remove();
            resolve();
        });

        let lineIdx = 0;
        async function nextLine() {
            if (cancelled || lineIdx >= NOIR_LINES.length) {
                if (!cancelled) {
                    await sleep(600);
                    overlay.style.transition = 'opacity 0.8s';
                    overlay.style.opacity = '0';
                    await sleep(800);
                    overlay.remove();
                    resolve();
                }
                return;
            }
            textEl.textContent = '';
            await typewriter(textEl, NOIR_LINES[lineIdx], 45);
            if (cancelled) return;
            await sleep(800);
            lineIdx++;
            nextLine();
        }
        nextLine();
    });
}

// ============== GAME FLOW ==============
async function startNewCase(demoMode) {
    // Get difficulty
    const diffEl = document.querySelector('.difficulty-option.selected');
    const diff = diffEl ? diffEl.getAttribute('data-difficulty') : 'easy';
    const preset = DIFFICULTY[diff];

    gameState = {
        caseData: null,
        questionsLeft: preset.questions,
        currentSuspect: null,
        chatHistory: { golu_golu: [], musalman: [], habibi: [] },
        cluesFound: [],
        cluesRevealed: [],
        confrontations: 0,
        demoMode: demoMode,
        isProcessing: false,
        difficulty: diff,
        timer: null,
        timerSeconds: 0,
    };

    SFX.init();

    if (demoMode) {
        gameState.caseData = JSON.parse(JSON.stringify(DEMO_CASE));
        await playNoirIntro();
        displayCrimeScene();
        return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        showModal('modal-settings');
        return;
    }

    showLoading();
    try {
        gameState.caseData = await generateCase();
        hideLoading();
        await playNoirIntro();
        displayCrimeScene();
    } catch (err) {
        hideLoading();
        console.error('God Call failed:', err);

        if (err.message === 'NO_API_KEY') {
            showModal('modal-settings');
            return;
        }

        const useFallback = confirm(
            `Failed to generate a new case:\n${err.message}\n\n` +
            (err.message.includes('405') ? 'TIP: Make sure you\'re running the game via "npm start" at http://localhost:3000\n\n' : '') +
            (err.message.includes('403') ? 'TIP: Your NVIDIA API key may be invalid or expired. Get a new one at https://build.nvidia.com\n\n' : '') +
            'Would you like to play in Demo Mode instead?'
        );
        if (useFallback) {
            gameState.demoMode = true;
            gameState.caseData = JSON.parse(JSON.stringify(DEMO_CASE));
            await playNoirIntro();
            displayCrimeScene();
        }
    }
}

// ============== CRIME SCENE DISPLAY ==============
function displayCrimeScene() {
    const c = gameState.caseData;

    document.getElementById('case-number').textContent = String(Math.floor(Math.random() * 900) + 100);
    document.getElementById('crime-location').textContent = c.setting;
    document.getElementById('victim-name').textContent = c.victim;
    document.getElementById('death-time').textContent = c.time_of_death;
    document.getElementById('murder-weapon').textContent = c.murder_weapon;

    updateQuestionCounters();

    // Clue board — flip cards on hard/nightmare, flat on easy
    const board = document.getElementById('clue-board');
    board.innerHTML = '';
    const hideClues = DIFFICULTY[gameState.difficulty].cluesHidden;

    c.clues.forEach((clue, idx) => {
        if (hideClues) {
            // Flip card style
            const card = document.createElement('div');
            card.className = 'clue-flip-card';
            card.innerHTML = `
                <div class="clue-flip-inner">
                    <div class="clue-front">
                        <span>❓</span>
                        <span class="clue-front-label">Evidence #${idx + 1}</span>
                    </div>
                    <div class="clue-back suspect-${clue.points_to || 'neutral'}">
                        ${escapeHtml(clue.text)}
                        <div class="clue-type-badge">${clue.type}</div>
                    </div>
                </div>
            `;
            card.addEventListener('click', () => {
                if (!card.classList.contains('flipped')) {
                    card.classList.add('flipped');
                    card.classList.add('clue-glow');
                    SFX.play('flip');
                    if (!gameState.cluesFound.includes(clue.id)) {
                        gameState.cluesFound.push(clue.id);
                    }
                    if (!gameState.cluesRevealed.includes(clue.id)) {
                        gameState.cluesRevealed.push(clue.id);
                    }
                }
            });
            board.appendChild(card);
        } else {
            // Classic flat note (easy mode)
            const note = document.createElement('div');
            note.className = `clue-note suspect-${clue.points_to || 'neutral'}`;
            note.innerHTML = `
                ${escapeHtml(clue.text)}
                <div class="clue-type-badge">${clue.type}</div>
            `;
            note.addEventListener('click', () => {
                if (!gameState.cluesFound.includes(clue.id)) {
                    gameState.cluesFound.push(clue.id);
                    note.style.boxShadow = '0 0 12px rgba(240, 192, 64, 0.5)';
                    SFX.play('flip');
                }
            });
            board.appendChild(note);
            // Auto-mark all clues as found in easy mode
            if (!gameState.cluesFound.includes(clue.id)) {
                gameState.cluesFound.push(clue.id);
            }
        }
    });

    // Suspect cards
    const cardsContainer = document.getElementById('suspect-cards');
    cardsContainer.innerHTML = '';
    for (const key of Object.keys(SUSPECTS)) {
        const def = SUSPECTS[key];
        const card = document.createElement('div');
        card.className = 'suspect-card';
        card.setAttribute('data-suspect', key);
        card.innerHTML = `
            <div class="avatar">${def.emoji.normal}</div>
            <div class="name">${escapeHtml(def.name)}</div>
            <div class="role">${escapeHtml(c.suspects[key].relationship || 'Suspect')}</div>
        `;
        card.addEventListener('click', () => showInterrogation(key));
        cardsContainer.appendChild(card);
    }

    showScreen('screen-crime');

    // Typewriter the scene description
    const sceneEl = document.getElementById('scene-text');
    typewriter(sceneEl, c.scene_description, 20);
}

// ============== INTERROGATION ==============
function showInterrogation(suspectKey) {
    gameState.currentSuspect = suspectKey;
    const caseData = gameState.caseData;
    const suspect = caseData.suspects[suspectKey];
    const def = SUSPECTS[suspectKey];

    SFX.play('suspense');

    // Update sidebar
    const avatar = document.getElementById('suspect-avatar');
    avatar.textContent = def.emoji.normal;
    avatar.style.borderColor = def.color;
    avatar.className = 'avatar-large';

    document.getElementById('suspect-name-display').textContent = def.name;
    document.getElementById('suspect-personality').textContent = suspect.personality;
    document.getElementById('suspect-alibi').textContent = suspect.alibi;
    document.getElementById('interrogation-title').textContent = `Interrogating: ${def.name}`;
    document.getElementById('interrogation-title').style.color = def.color;

    // Pressure meter reset
    updatePressureMeter(suspectKey);

    // Confront button
    const confrontBtn = document.getElementById('btn-confront');
    confrontBtn.style.display = (gameState.cluesFound.length >= 2) ? 'block' : 'none';

    // Rebuild chat from history
    const chatEl = document.getElementById('chat-messages');
    chatEl.innerHTML = `
        <div class="chat-welcome">
            <p><strong>${escapeHtml(def.name)}</strong> sits across from you under the harsh lamp light...</p>
            <p class="hint">Type your questions below. You have <strong>${gameState.questionsLeft}</strong> questions left.</p>
        </div>
    `;

    const history = gameState.chatHistory[suspectKey];
    if (history && history.length > 0) {
        history.forEach(h => {
            appendChatBubble(chatEl, 'You', h.q, true);
            appendChatBubble(chatEl, def.name, h.a, false, def.color);
        });
    }

    updateSideClues();
    updateQuestionCounters();

    // Timer setup
    const preset = DIFFICULTY[gameState.difficulty];
    const timerSection = document.getElementById('timer-section');
    if (preset.timed) {
        timerSection.classList.remove('hidden');
        resetTimer();
    } else {
        timerSection.classList.add('hidden');
        clearTimer();
    }

    showScreen('screen-interrogation');
    document.getElementById('question-input').focus();
}

function appendChatBubble(container, sender, text, isPlayer, color) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isPlayer ? 'player' : 'suspect'}`;
    bubble.innerHTML = `<span class="sender">${escapeHtml(sender)}</span>${escapeHtml(text)}`;
    if (!isPlayer && color) {
        bubble.style.borderLeftColor = color;
        bubble.style.borderLeft = `3px solid ${color}`;
    }
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
    return bubble;
}

async function askQuestion() {
    if (gameState.isProcessing) return;
    if (gameState.questionsLeft <= 0) {
        alert('No questions left! Make your accusation.');
        return;
    }

    const input = document.getElementById('question-input');
    const question = input.value.trim();
    if (!question) return;

    input.value = '';
    gameState.isProcessing = true;

    const suspectKey = gameState.currentSuspect;
    const def = SUSPECTS[suspectKey];
    const chatEl = document.getElementById('chat-messages');

    // Remove welcome if it exists
    const welcome = chatEl.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    // Add player bubble
    appendChatBubble(chatEl, 'You', question, true);

    // Decrement questions
    gameState.questionsLeft--;
    updateQuestionCounters();

    // Show typing indicator
    const typing = document.createElement('div');
    typing.className = 'typing-indicator';
    typing.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    chatEl.appendChild(typing);
    chatEl.scrollTop = chatEl.scrollHeight;

    let answer;
    try {
        if (gameState.demoMode) {
            // Demo mode: generate a simple scripted response
            answer = generateDemoResponse(suspectKey, question);
            await sleep(800 + Math.random() * 700); // fake delay
        } else {
            answer = await interrogateSuspect(suspectKey, question);
        }
    } catch (err) {
        console.error('Interrogation failed:', err);
        answer = "*shifts uncomfortably* I... I don't know what you want me to say, detective.";
    }

    // Remove typing indicator
    typing.remove();

    // Add suspect bubble
    appendChatBubble(chatEl, def.name, answer, false, def.color);

    // Compress and store in history
    const summary = compressResponse(question, answer);
    if (!gameState.chatHistory[suspectKey]) gameState.chatHistory[suspectKey] = [];
    gameState.chatHistory[suspectKey].push({ q: question, a: answer, summary });

    // Update suspect mood based on how many questions they've been asked
    updateSuspectMood(suspectKey);
    updatePressureMeter(suspectKey);

    // Show confront button after some interaction
    if (gameState.cluesFound.length >= 2) {
        document.getElementById('btn-confront').style.display = 'block';
    }

    gameState.isProcessing = false;

    // Reset timer for next question
    if (DIFFICULTY[gameState.difficulty].timed) {
        resetTimer();
    }

    // If out of questions, prompt accusation
    if (gameState.questionsLeft <= 0) {
        setTimeout(() => {
            const forceAccuse = confirm('You have no questions left! Time to make your accusation.');
            if (forceAccuse) showAccusation();
        }, 500);
    }
}

// ============== DEMO MODE RESPONSES ==============
function generateDemoResponse(suspectKey, question) {
    const suspect = gameState.caseData.suspects[suspectKey];
    const def = SUSPECTS[suspectKey];
    const qLower = question.toLowerCase();

    // Keyword-based responses for demo mode
    const responses = {
        golu_golu: {
            default: [
                "I was just in the kitchen, minding my own business! Why does everyone keep asking me things?",
                "Look, I get nervous easily, okay? That doesn't make me a killer!",
                "*sweating* I told you everything! I was making a sandwich! A really, really big sandwich!",
                "The kitchen was warm and steamy, hard to see anything from there... not that I was looking!",
                "Why are you looking at me like that? I didn't do anything wrong! *drops crumbs*"
            ],
            alibi: "I was in the kitchen THE WHOLE TIME! Making food! That's what I do when I'm stressed!",
            suspicious: "*gulps loudly* W-what do you mean? I didn't see anything through the window! I mean... there IS a window, but I wasn't looking through it!",
            deny: "No no no! I had nothing to do with this! Sure, the Professor failed me, but I wouldn't... I couldn't... *stress eats*"
        },
        musalman: {
            default: [
                "I've already given my statement. Everything I said is verifiable.",
                "Check the records if you don't believe me. I have nothing to hide.",
                "I was on the terrace. The call lasted until 11. That's my final answer.",
                "You're wasting your time with me, detective. The real killer is still out there.",
                "I find these questions tedious. I've cooperated fully."
            ],
            alibi: "As I stated, I was on the terrace, engaged in a very important phone call. The details are not your concern.",
            suspicious: "*adjusts collar slightly* My phone records will speak for themselves. I suggest you examine others more closely.",
            deny: "Research fraud? That's a serious accusation with zero evidence. The Professor and I had professional disagreements, nothing more."
        },
        habibi: {
            default: [
                "Oh, my dear Professor! *wipes tear* I cannot believe someone would do this to such a beautiful soul!",
                "The stars were so beautiful that night... I was in the garden, writing poetry about loss. How prophetic...",
                "*dramatic sigh* You suspect ME? After everything we shared? My heart is broken!",
                "I loved the Professor like family! This investigation wounds me deeper than you know!",
                "The garden was peaceful... the flowers were blooming... I had no idea of the horror happening inside!"
            ],
            alibi: "I was in the garden since 9 PM! Stargazing, writing, being one with nature. The door was locked — I couldn't have gone in even if I wanted to!",
            suspicious: "*eyes widen briefly then tears up* That's... that's not possible. I was OUTSIDE. Perhaps someone else wore my shoes? *voice cracks*",
            deny: "*stands up dramatically* How DARE you! I would never harm someone I love! Yes, I was hurt about... certain personal matters, but violence? NEVER!"
        }
    };

    const suspectResponses = responses[suspectKey];

    if (qLower.includes('alibi') || qLower.includes('where were you') || qLower.includes('what were you doing')) {
        return suspectResponses.alibi;
    }
    if (qLower.includes('lie') || qLower.includes('lying') || qLower.includes('truth') || qLower.includes('suspicious') || qLower.includes('contradict') || qLower.includes('explain')) {
        return suspectResponses.suspicious;
    }
    if (qLower.includes('kill') || qLower.includes('murder') || qLower.includes('did you') || qLower.includes('confess') || qLower.includes('guilty')) {
        return suspectResponses.deny;
    }

    // Random default response
    const defaults = suspectResponses.default;
    return defaults[Math.floor(Math.random() * defaults.length)];
}

// ============== SUSPECT MOOD ==============
function updateSuspectMood(suspectKey) {
    const history = gameState.chatHistory[suspectKey] || [];
    const def = SUSPECTS[suspectKey];
    const avatar = document.getElementById('suspect-avatar');

    if (history.length >= 5) {
        avatar.textContent = def.emoji.scared;
        avatar.className = 'avatar-large mood-angry';
    } else if (history.length >= 2) {
        avatar.textContent = def.emoji.defensive;
        avatar.className = 'avatar-large mood-nervous';
    }

    // Update card on crime scene too
    const card = document.querySelector(`.suspect-card[data-suspect="${suspectKey}"]`);
    if (card && history.length > 0) {
        let badge = card.querySelector('.interrogated-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'interrogated-badge';
            card.appendChild(badge);
        }
        badge.textContent = `${history.length} Q`;
    }
}

// ============== TIMER SYSTEM ==============
function resetTimer() {
    clearTimer();
    const preset = DIFFICULTY[gameState.difficulty];
    if (!preset.timed) return;

    gameState.timerSeconds = preset.timerSec;
    const fill = document.getElementById('timer-fill');
    const text = document.getElementById('timer-text');
    fill.style.width = '100%';
    fill.classList.remove('urgent');
    text.textContent = gameState.timerSeconds + 's';

    gameState.timer = setInterval(() => {
        gameState.timerSeconds--;
        const pct = (gameState.timerSeconds / preset.timerSec) * 100;
        fill.style.width = pct + '%';
        text.textContent = gameState.timerSeconds + 's';

        if (gameState.timerSeconds <= 10) {
            fill.classList.add('urgent');
            SFX.play('tick');
        }

        if (gameState.timerSeconds <= 0) {
            clearTimer();
            // Auto-skip: lose a question
            if (gameState.questionsLeft > 0) {
                gameState.questionsLeft--;
                updateQuestionCounters();
                const chatEl = document.getElementById('chat-messages');
                const timeoutMsg = document.createElement('div');
                timeoutMsg.className = 'chat-bubble suspect';
                timeoutMsg.innerHTML = '<span class="sender">⏰ TIME UP</span>You took too long, detective. The suspect smirks.';
                chatEl.appendChild(timeoutMsg);
                chatEl.scrollTop = chatEl.scrollHeight;
            }
            if (gameState.questionsLeft > 0) {
                resetTimer();
            } else {
                setTimeout(() => {
                    const forceAccuse = confirm('No questions left! Time to make your accusation.');
                    if (forceAccuse) showAccusation();
                }, 500);
            }
        }
    }, 1000);
}

function clearTimer() {
    if (gameState.timer) {
        clearInterval(gameState.timer);
        gameState.timer = null;
    }
}

// ============== PRESSURE / NERVOUSNESS METER ==============
function updatePressureMeter(suspectKey) {
    const history = gameState.chatHistory[suspectKey] || [];
    const fill = document.getElementById('pressure-fill');
    const pct = document.getElementById('pressure-pct');
    if (!fill || !pct) return;

    // Calculate pressure: each Q adds ~12%, confrontations add 25%
    let pressure = history.length * 12;
    // Count confrontations for this suspect
    const confrontCount = history.filter(h => h.q.startsWith('[CONFRONTED')).length;
    pressure += confrontCount * 25;

    // Keywords in questions that increase pressure
    const pressureKeywords = ['lie', 'lying', 'truth', 'contradict', 'explain', 'kill', 'murder', 'guilty', 'evidence', 'prove', 'confess'];
    history.forEach(h => {
        const qLower = h.q.toLowerCase();
        if (pressureKeywords.some(kw => qLower.includes(kw))) pressure += 8;
    });

    pressure = Math.min(100, pressure);

    fill.style.width = pressure + '%';
    pct.textContent = pressure + '%';

    fill.classList.remove('medium', 'high');
    if (pressure >= 70) fill.classList.add('high');
    else if (pressure >= 40) fill.classList.add('medium');
}

// ============== CONFRONT MECHANIC ==============
function openConfront() {
    const suspectKey = gameState.currentSuspect;
    const def = SUSPECTS[suspectKey];

    document.getElementById('confront-suspect-name').textContent = def.name;
    document.getElementById('confront-result').classList.add('hidden');
    document.getElementById('btn-do-confront').disabled = true;

    // Show clues as selectable options
    const clueListEl = document.getElementById('confront-clues');
    clueListEl.innerHTML = '';
    let selectedClue = null;

    gameState.caseData.clues.forEach(clue => {
        if (!gameState.cluesFound.includes(clue.id)) return;
        const option = document.createElement('div');
        option.className = 'confront-clue-option';
        option.textContent = clue.text;
        option.addEventListener('click', () => {
            clueListEl.querySelectorAll('.confront-clue-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            selectedClue = clue;
            document.getElementById('btn-do-confront').disabled = false;
        });
        clueListEl.appendChild(option);
    });

    // Store selected clue reference for executeConfront
    document.getElementById('btn-do-confront').onclick = () => executeConfront(selectedClue);

    showModal('modal-confront');
}

async function executeConfront(clue) {
    if (!clue || gameState.isProcessing) return;
    gameState.isProcessing = true;

    const suspectKey = gameState.currentSuspect;
    const def = SUSPECTS[suspectKey];

    const resultEl = document.getElementById('confront-result');
    const textEl = document.getElementById('confront-text');
    const avatarEl = document.getElementById('confront-avatar');

    avatarEl.textContent = def.emoji.scared;
    textEl.textContent = 'Thinking...';
    resultEl.classList.remove('hidden');

    document.getElementById('btn-do-confront').disabled = true;

    let response;
    try {
        if (gameState.demoMode) {
            await sleep(1000);
            response = generateDemoConfront(suspectKey, clue.text);
        } else {
            response = await confrontCall(suspectKey, clue.text);
        }
    } catch (err) {
        response = "*stares at the evidence in stunned silence, then looks away nervously*";
    }

    textEl.textContent = response;
    gameState.confrontations++;
    gameState.isProcessing = false;

    // Also log to chat history
    if (!gameState.chatHistory[suspectKey]) gameState.chatHistory[suspectKey] = [];
    gameState.chatHistory[suspectKey].push({
        q: `[CONFRONTED with: ${clue.text}]`,
        a: response,
        summary: `Confronted with evidence about "${clue.text.substring(0, 40)}..." → reacted defensively`
    });
}

function generateDemoConfront(suspectKey, clueText) {
    const confrontResponses = {
        golu_golu: "*drops sandwich* W-WHAT?! Where did you find that?! I mean... I can explain... okay maybe I saw SOMETHING through the kitchen window, but I was scared! I didn't want to get involved!",
        musalman: "*long pause* ...That record must be inaccurate. Phone towers have margins of error. But... fine. The call ended a bit early. I went to the restroom. Is that a crime now?",
        habibi: "*gasps dramatically and stands up* That's... that's been PLANTED! Someone is trying to frame me! *voice breaks* Why would I... how could you think... *sits back down, trembling*"
    };
    return confrontResponses[suspectKey] || "*stares in silence*";
}

// ============== ACCUSATION ==============
function showAccusation() {
    clearTimer();
    SFX.play('suspense');

    const container = document.getElementById('accusation-cards');
    container.innerHTML = '';

    document.getElementById('accusation-phase-choose').style.display = 'block';
    document.getElementById('accusation-phase-result').classList.add('hidden');

    for (const key of Object.keys(SUSPECTS)) {
        const def = SUSPECTS[key];
        const suspect = gameState.caseData.suspects[key];
        const card = document.createElement('div');
        card.className = 'suspect-card';
        card.setAttribute('data-suspect', key);
        card.innerHTML = `
            <div class="avatar">${def.emoji.normal}</div>
            <div class="name">${escapeHtml(def.name)}</div>
            <div class="role">${escapeHtml(suspect.relationship || 'Suspect')}</div>
        `;
        card.addEventListener('click', () => makeAccusation(key));
        container.appendChild(card);
    }

    showScreen('screen-accusation');
}

function makeAccusation(suspectKey) {
    clearTimer();
    const correct = suspectKey === gameState.caseData.killer;
    const def = SUSPECTS[suspectKey];
    const killerDef = SUSPECTS[gameState.caseData.killer];

    // Calculate score
    const score = calculateScore(correct);

    // Hide choose phase
    document.getElementById('accusation-phase-choose').style.display = 'none';

    // === DRAMATIC REVEAL SEQUENCE ===
    SFX.play('suspense');

    const overlay = document.createElement('div');
    overlay.className = 'accusation-overlay';
    overlay.innerHTML = `
        <div class="spotlight-avatar" style="border: 4px solid ${def.color}">${def.emoji.normal}</div>
        <div class="spotlight-name" style="color: ${def.color}">${escapeHtml(def.name)}</div>
        <div class="gavel-text">⚖️</div>
    `;
    document.body.appendChild(overlay);

    // After gavel slam, play sound
    setTimeout(() => SFX.play('gavel'), 1600);

    // After the reveal animation, show the result
    setTimeout(() => {
        overlay.style.transition = 'opacity 0.5s';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 500);

        // Show result phase
        const resultPhase = document.getElementById('accusation-phase-result');
        resultPhase.classList.remove('hidden');

        // Shake screen on wrong answer
        if (!correct) {
            document.body.classList.add('shaking');
            setTimeout(() => document.body.classList.remove('shaking'), 400);
        }

        // Icon
        document.getElementById('result-icon').textContent = correct ? '🎉' : '💀';

        // Title
        const titleEl = document.getElementById('result-title');
        titleEl.textContent = correct ? 'CASE SOLVED!' : 'CASE FAILED';
        titleEl.className = `result-title ${correct ? 'correct' : 'wrong'}`;

        // Text
        document.getElementById('result-text').textContent = correct
            ? `Brilliant work, detective! ${escapeHtml(def.name)} is indeed the killer.`
            : `Wrong! You accused ${escapeHtml(def.name)}, but the real killer was ${escapeHtml(killerDef.name)}.`;

        // Explanation
        document.getElementById('result-explanation').textContent = gameState.caseData.solution_explanation;

        // Score display
        const scoreEl = document.getElementById('score-display');
        scoreEl.innerHTML = `
            <div class="score-item">
                <div class="score-value">${score.total}</div>
                <div class="score-label">Total Score</div>
            </div>
            <div class="score-item">
                <div class="score-value">${correct ? '✅' : '❌'}</div>
                <div class="score-label">Verdict</div>
            </div>
            <div class="score-item">
                <div class="score-value">${score.questionsUsed}</div>
                <div class="score-label">Questions Used</div>
            </div>
            <div class="score-item">
                <div class="score-value">${score.cluesCollected}</div>
                <div class="score-label">Clues Found</div>
            </div>
        `;

        // Play success/fail effects
        if (correct) {
            SFX.play('reveal');
            spawnConfetti();
        } else {
            SFX.play('fail');
            showCrackEffect();
        }

        saveToHistory(correct, score.total);
    }, 2800);
}

// ============== SCORING ==============
function calculateScore(correct) {
    const preset = DIFFICULTY[gameState.difficulty];
    const maxQ = preset.questions;
    const questionsUsed = maxQ - gameState.questionsLeft;
    const cluesCollected = gameState.cluesFound.length;
    const totalClues = gameState.caseData.clues.length;

    let total = 0;

    // Correct killer: 50 points
    if (correct) total += 50;

    // Efficiency bonus: fewer questions = more points (up to 30)
    const efficiency = Math.max(0, (maxQ - questionsUsed) / maxQ);
    total += Math.round(efficiency * 30);

    // Clue bonus: more clues found = more points (up to 20)
    total += Math.round((cluesCollected / Math.max(totalClues, 1)) * 20);

    // Difficulty bonus
    if (gameState.difficulty === 'hard') total += 10;
    if (gameState.difficulty === 'nightmare') total += 25;

    return { total, questionsUsed, cluesCollected };
}

// ============== HISTORY / STORAGE ==============
function saveToHistory(correct, score) {
    const history = JSON.parse(localStorage.getItem('mm_history') || '[]');
    history.unshift({
        date: new Date().toLocaleDateString(),
        victim: gameState.caseData.victim,
        setting: gameState.caseData.setting,
        correct,
        score,
        killer: SUSPECTS[gameState.caseData.killer].name,
        demo: gameState.demoMode,
    });
    // Keep only last 20
    if (history.length > 20) history.length = 20;
    localStorage.setItem('mm_history', JSON.stringify(history));
    updateHistoryDisplay();
}

function updateHistoryDisplay() {
    const history = JSON.parse(localStorage.getItem('mm_history') || '[]');
    const listEl = document.getElementById('history-list');

    if (history.length === 0) {
        listEl.innerHTML = '<p class="empty-state">No cases solved yet. Get to work, detective!</p>';
        return;
    }

    listEl.innerHTML = history.map(h => `
        <div class="history-item">
            <div>
                <div class="case-name">${escapeHtml(h.victim)} @ ${escapeHtml(h.setting)}</div>
                <div class="case-result">${h.date} · Killer: ${escapeHtml(h.killer)} ${h.demo ? '(Demo)' : ''}</div>
            </div>
            <div class="case-score">${h.correct ? '✅' : '❌'} ${h.score}pts</div>
        </div>
    `).join('');
}

function clearHistory() {
    if (confirm('Clear all case history? This cannot be undone.')) {
        localStorage.removeItem('mm_history');
        updateHistoryDisplay();
    }
}

// ============== SETTINGS ==============
function loadSettings() {
    const apiKey = localStorage.getItem('mm_api_key') || '';
    const model = localStorage.getItem('mm_model') || CONFIG.defaultModel;
    const customModel = localStorage.getItem('mm_custom_model') || '';
    const maxQ = localStorage.getItem('mm_max_questions') || CONFIG.maxQuestions;

    document.getElementById('api-key-input').value = apiKey;
    document.getElementById('questions-input').value = maxQ;

    const select = document.getElementById('model-select');
    const customInput = document.getElementById('custom-model-input');
    const customRow = document.getElementById('custom-model-row');

    // Check if the saved model matches a dropdown option
    const optionExists = [...select.options].some(o => o.value === model);
    if (optionExists) {
        select.value = model;
        customRow.classList.add('hidden');
    } else {
        select.value = '__custom__';
        customInput.value = model;
        customRow.classList.remove('hidden');
    }

    // Toggle custom input when __custom__ is selected
    select.addEventListener('change', () => {
        if (select.value === '__custom__') {
            customRow.classList.remove('hidden');
            customInput.focus();
        } else {
            customRow.classList.add('hidden');
        }
    });
}

function getSelectedModel() {
    const select = document.getElementById('model-select');
    if (select.value === '__custom__') {
        return document.getElementById('custom-model-input').value.trim();
    }
    return select.value;
}

function saveSettings() {
    const apiKey = document.getElementById('api-key-input').value.trim();
    const model = getSelectedModel();
    const maxQ = document.getElementById('questions-input').value;

    if (apiKey) localStorage.setItem('mm_api_key', apiKey);
    else localStorage.removeItem('mm_api_key');

    if (model) localStorage.setItem('mm_model', model);
    localStorage.setItem('mm_max_questions', maxQ);

    hideModal('modal-settings');
}

// Fetch available models from NVIDIA NIM API
async function fetchAvailableModels() {
    const apiKey = document.getElementById('api-key-input').value.trim();
    const statusEl = document.getElementById('model-fetch-status');

    if (!apiKey) {
        statusEl.textContent = '⚠️ Enter your API key first';
        statusEl.style.color = 'var(--accent-red)';
        return;
    }

    statusEl.textContent = '⏳ Fetching models...';
    statusEl.style.color = 'var(--text-secondary)';

    try {
        const res = await fetch(CONFIG.modelsUrl, {
            headers: { 'x-api-key': apiKey }
        });
        const data = await res.json();

        if (!res.ok) {
            statusEl.textContent = `❌ ${data.error?.message || 'Failed to fetch'}`;
            statusEl.style.color = 'var(--accent-red)';
            return;
        }

        const models = (data.data || [])
            .filter(m => m.id)
            .sort((a, b) => a.id.localeCompare(b.id));

        if (models.length === 0) {
            statusEl.textContent = '⚠️ No models returned';
            return;
        }

        // Rebuild dropdown with fetched models
        const select = document.getElementById('model-select');
        const currentModel = getSelectedModel();
        select.innerHTML = '';

        // Group by organization
        const groups = {};
        for (const m of models) {
            const org = m.id.split('/')[0] || 'other';
            if (!groups[org]) groups[org] = [];
            groups[org].push(m.id);
        }

        for (const [org, ids] of Object.entries(groups)) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = org;
            for (const id of ids) {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = id.split('/').pop();
                optgroup.appendChild(opt);
            }
            select.appendChild(optgroup);
        }

        // Add custom option
        const customGroup = document.createElement('optgroup');
        customGroup.label = 'Custom';
        const customOpt = document.createElement('option');
        customOpt.value = '__custom__';
        customOpt.textContent = '✏️ Enter custom model ID...';
        customGroup.appendChild(customOpt);
        select.appendChild(customGroup);

        // Restore selection
        if ([...select.options].some(o => o.value === currentModel)) {
            select.value = currentModel;
        } else {
            select.value = models[0]?.id || '__custom__';
        }

        statusEl.textContent = `✅ ${models.length} models loaded`;
        statusEl.style.color = 'var(--accent-green)';
    } catch (err) {
        statusEl.textContent = `❌ ${err.message}`;
        statusEl.style.color = 'var(--accent-red)';
    }
}

// Test API connection
async function testConnection() {
    const statusEl = document.getElementById('connection-status');
    const apiKey = document.getElementById('api-key-input').value.trim();
    const model = getSelectedModel();

    if (!apiKey) {
        statusEl.innerHTML = '<span style="color:var(--accent-red)">⚠️ Enter your API key first</span>';
        return;
    }
    if (!model) {
        statusEl.innerHTML = '<span style="color:var(--accent-red)">⚠️ Select or enter a model first</span>';
        return;
    }

    statusEl.innerHTML = '<span style="color:var(--text-secondary)">⏳ Testing connection...</span>';

    try {
        const res = await fetch(CONFIG.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: apiKey,
                model: model,
                messages: [{ role: 'user', content: 'Say "Connection OK" in exactly two words.' }],
                max_tokens: 10,
                temperature: 0,
            })
        });

        const data = await res.json();

        if (!res.ok) {
            statusEl.innerHTML = `<span style="color:var(--accent-red)">❌ ${escapeHtml(data.error?.message || 'API Error')}</span>`;
            return;
        }

        const reply = data.choices?.[0]?.message?.content || '';
        statusEl.innerHTML = `<span style="color:var(--accent-green)">✅ Connected! Model responded: "${escapeHtml(reply.substring(0, 60))}"</span>`;
    } catch (err) {
        statusEl.innerHTML = `<span style="color:var(--accent-red)">❌ ${escapeHtml(err.message)}</span>`;
    }
}

// ============== UI HELPERS ==============
function updateQuestionCounters() {
    const remaining = gameState.questionsLeft;
    const maxQ = parseInt(localStorage.getItem('mm_max_questions')) || CONFIG.maxQuestions;

    ['q-remaining-1', 'q-remaining-2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = remaining;
    });

    ['q-counter-1', 'q-counter-2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (remaining <= 3) {
                el.classList.add('low');
            } else {
                el.classList.remove('low');
            }
        }
    });
}

function updateSideClues() {
    const listEl = document.getElementById('side-clue-list');
    if (!listEl) return;

    if (gameState.cluesFound.length === 0) {
        listEl.innerHTML = '<p class="empty-state" style="font-size:0.75rem;">No clues yet</p>';
        return;
    }

    listEl.innerHTML = gameState.caseData.clues
        .filter(c => gameState.cluesFound.includes(c.id))
        .map(c => `<div class="side-clue-item" style="border-left-color:${SUSPECTS[c.points_to]?.color || '#666'}">${escapeHtml(c.text.substring(0, 60))}...</div>`)
        .join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============== CONFETTI EFFECT ==============
function spawnConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);

    const colors = ['#f0c040', '#ef4444', '#22c55e', '#a855f7', '#14b8a6', '#f97316', '#ec4899'];
    for (let i = 0; i < 80; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.width = (Math.random() * 8 + 4) + 'px';
        piece.style.height = (Math.random() * 8 + 4) + 'px';
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        piece.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
        piece.style.animationDelay = (Math.random() * 0.8) + 's';
        container.appendChild(piece);
    }

    setTimeout(() => container.remove(), 4000);
}

// ============== SCREEN CRACK EFFECT ==============
function showCrackEffect() {
    document.body.classList.add('shaking');
    setTimeout(() => document.body.classList.remove('shaking'), 400);

    const crack = document.createElement('div');
    crack.className = 'crack-overlay';
    crack.style.setProperty('--crack-x', '50%');
    crack.style.setProperty('--crack-y', '50%');
    document.body.appendChild(crack);

    setTimeout(() => {
        crack.style.transition = 'opacity 1.5s';
        crack.style.opacity = '0';
        setTimeout(() => crack.remove(), 1500);
    }, 2000);
}
