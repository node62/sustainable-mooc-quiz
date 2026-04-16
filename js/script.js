// --- DEVELOPER TOGGLES ---
const ENABLE_MOBILE_SWIPE = true; 
const ENABLE_EASTER_EGG = true; 
const DISABLE_SCROLL_ON_DRAG = true; 
const VIDEO_SIZE_DIVISOR = 3; 

// Data & State
let rawData = [];
let currentMode = 'study';

// Study State
let studyQueue = [];
let studyIndex = 0;
let currentStudyWeek = null;
let studyQueueCache = {}; 

// Quiz State
let quizWeeksSelected = new Set();
let quizQueue = [];
let quizIndex = 0;
let timerInterval = null;
let secondsElapsed = 0;

// Retry & Accuracy Tracking State
let originalQuizLength = 0;
let wrongCount = 0;
let totalAttempts = 0; 
let weekStats = {}; 

// Mobile Swipe State
let touchstartX = 0;
let touchendX = 0;

// Easter Egg State
let titleClickCount = 0;
let titleClickTimer = null;

// DOM Elements
const mainHeader = document.getElementById('mainHeader'); 
const modeRadios = document.getElementsByName('modeToggle');
const hubView = document.getElementById('hubView');
const hubInstructions = document.getElementById('hubInstructions');
const weekGrid = document.getElementById('weekGrid');
const sharedRandomizeCheck = document.getElementById('sharedRandomizeCheck');
const redoWrongLabel = document.getElementById('redoWrongLabel');
const redoWrongCheck = document.getElementById('redoWrongCheck');
const quizStartContainer = document.getElementById('quizStartContainer');
const startQuizBtn = document.getElementById('startQuizBtn');
const segmentContainer = document.getElementById('quizSegmentedProgress');

// Init
async function init() {
    try {
        const response = await fetch('./data/questions.json');
        if (!response.ok) throw new Error("HTTP Status " + response.status);
        rawData = await response.json();
        setupEventListeners();
        renderGrid();
        if (ENABLE_EASTER_EGG) initEasterEgg(); 
    } catch (error) {
        weekGrid.innerHTML = '<p style="color:red; grid-column: 1/-1;">Error loading data. Run a local web server.</p>';
    }
}

function setupEventListeners() {
    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentMode = e.target.value;
            switchModeUI();
        });
    });

    startQuizBtn.addEventListener('click', startQuiz);
    
    document.getElementById('studyHomeBtn').addEventListener('click', returnToHub);
    document.getElementById('quizHomeBtn').addEventListener('click', returnToHub);
    document.getElementById('backFromResultsBtn').addEventListener('click', returnToHub);

    document.getElementById('studyPrevBtn').addEventListener('click', () => {
        if (studyIndex > 0) {
            renderStudyQuestion(studyIndex - 1);
        } else if (currentStudyWeek !== 'All' && currentStudyWeek > 0) {
            startStudyMode(currentStudyWeek - 1, true);
        }
    });

    document.getElementById('studyNextBtn').addEventListener('click', () => renderStudyQuestion(studyIndex + 1));
    document.getElementById('studyRestartBtn').addEventListener('click', () => renderStudyQuestion(0));
    document.getElementById('studyNextWeekBtn').addEventListener('click', jumpToNextWeek);

    document.getElementById('quizNextBtn').addEventListener('click', processQuizNext);

    document.addEventListener('keydown', handleKeyboardNavigation);

    const studyView = document.getElementById('studyActiveView');
    studyView.addEventListener('touchstart', e => {
        touchstartX = e.changedTouches[0].screenX;
    }, {passive: true});

    studyView.addEventListener('touchend', e => {
        touchendX = e.changedTouches[0].screenX;
        handleSwipeGesture();
    }, {passive: true});

    // --- EASTER EGG RAPID CLICK LISTENER ---
    document.getElementById('secretTriggerTitle').addEventListener('click', () => {
        if (!ENABLE_EASTER_EGG) return; 
        if (window.innerWidth > 768) return; 

        titleClickCount++;
        clearTimeout(titleClickTimer); 
        
        if (titleClickCount >= 10) {
            activateBrainrot();
            titleClickCount = 0; 
        } else {
            titleClickTimer = setTimeout(() => { titleClickCount = 0; }, 2000); 
        }
    });

    document.getElementById('closeEasterEgg').addEventListener('click', (e) => {
        e.stopPropagation(); 
        const egg = document.getElementById('easterEggContainer');
        const vid = document.getElementById('brainrotVideo');
        egg.classList.add('hidden');
        vid.pause(); 
    });
}

// --- EASTER EGG LOGIC ---
function showToast(message) {
    const existingToast = document.getElementById('dynamicToast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'dynamicToast';
    toast.innerText = message;
    
    document.body.appendChild(toast);

    void toast.offsetWidth;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300); 
    }, 3000);
}

function activateBrainrot() {
    const egg = document.getElementById('easterEggContainer');
    const vid = document.getElementById('brainrotVideo');
    
    if (!egg.classList.contains('hidden')) return;

    showToast("Brainrot mode!");
    egg.classList.remove('hidden');
    vid.play(); 
}

function initEasterEgg() {
    const elmnt = document.getElementById("easterEggContainer");
    
    elmnt.style.width = `calc(100vw / ${VIDEO_SIZE_DIVISOR})`;
    
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    elmnt.onmousedown = dragMouseDown;
    elmnt.ontouchstart = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        if (e.target.id === 'closeEasterEgg') return; 
        
        if (DISABLE_SCROLL_ON_DRAG) {
            document.body.style.overflow = 'hidden';
            document.body.style.touchAction = 'none';
        }

        if (e.type === 'touchstart') {
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;
        } else {
            pos3 = e.clientX;
            pos4 = e.clientY;
        }
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        document.ontouchend = closeDragElement;
        document.ontouchmove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault(); 
        
        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        
        pos1 = pos3 - clientX;
        pos2 = pos4 - clientY;
        pos3 = clientX;
        pos4 = clientY;
        
        const rect = elmnt.getBoundingClientRect();
        elmnt.style.top = (rect.top - pos2) + "px";
        elmnt.style.left = (rect.left - pos1) + "px";
        
        elmnt.style.bottom = "auto";
        elmnt.style.right = "auto";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        document.ontouchend = null;
        document.ontouchmove = null;
        
        if (DISABLE_SCROLL_ON_DRAG) {
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
        }
    }
}

// --- GESTURE LOGIC ---
function handleSwipeGesture() {
    if (!ENABLE_MOBILE_SWIPE) return;
    
    if (document.getElementById('studyActiveView').classList.contains('hidden')) return;

    const swipeThreshold = 50; 
    const distance = touchendX - touchstartX;

    if (distance < -swipeThreshold) {
        if (studyIndex < studyQueue.length - 1) {
            document.getElementById('studyNextBtn').click();
        } else {
            document.getElementById('studyNextWeekBtn').click();
        }
    } else if (distance > swipeThreshold) {
        const prevBtn = document.getElementById('studyPrevBtn');
        if (!prevBtn.classList.contains('invisible')) {
            prevBtn.click();
        }
    }
}

// --- OPTION SHUFFLING LOGIC ---
function getSmartShuffledOptions(options) {
    const absoluteDangerPhrases = ["both a", "both b", "a and b", "b and c", "a & b", "neither a", "only a"];
    const collectiveDangerPhrases = ["all of", "none of"];

    const lowerOptions = options.map(opt => String(opt).toLowerCase().replace(/[.,;]$/, "").trim());

    const hasAbsoluteDanger = lowerOptions.some(cleanOpt => 
        absoluteDangerPhrases.some(phrase => cleanOpt.includes(phrase))
    );

    if (hasAbsoluteDanger) {
        return [...options]; 
    }

    let fixedPositions = [];
    let shufflableOptions = [];

    options.forEach((opt, index) => {
        const cleanOpt = lowerOptions[index];
        const isCollectiveDanger = (cleanOpt === "all" || cleanOpt === "none" || cleanOpt === "both") ||
                                   collectiveDangerPhrases.some(phrase => cleanOpt.includes(phrase));

        if (isCollectiveDanger) {
            fixedPositions.push({ index: index, text: opt });
        } else {
            shufflableOptions.push(opt);
        }
    });

    shufflableOptions.sort(() => Math.random() - 0.5);

    let result = [];
    let shuffleIndex = 0;
    
    for (let i = 0; i < options.length; i++) {
        let fixedOpt = fixedPositions.find(f => f.index === i);
        if (fixedOpt) {
            result.push(fixedOpt.text); 
        } else {
            result.push(shufflableOptions[shuffleIndex]); 
            shuffleIndex++;
        }
    }

    return result;
}

// --- KEYBOARD LOGIC ---
function handleKeyboardNavigation(e) {
    const isStudyActive = !document.getElementById('studyActiveView').classList.contains('hidden');
    const isQuizActive = !document.getElementById('quizActiveView').classList.contains('hidden');

    const isNext = e.code === 'Space' || e.key === ' ' || e.code === 'ArrowRight' || e.key === 'ArrowRight';
    const isPrev = e.code === 'ArrowLeft' || e.key === 'ArrowLeft';

    if (isStudyActive) {
        if (isNext) {
            e.preventDefault(); 
            if (studyIndex < studyQueue.length - 1) {
                document.getElementById('studyNextBtn').click();
            } else {
                document.getElementById('studyNextWeekBtn').click();
            }
        } else if (isPrev) {
            e.preventDefault();
            const prevBtn = document.getElementById('studyPrevBtn');
            if (!prevBtn.classList.contains('invisible')) {
                prevBtn.click();
            }
        }
    } else if (isQuizActive) {
        if (isNext) {
            const nextBtn = document.getElementById('quizNextBtn');
            if (!nextBtn.classList.contains('locked-hidden')) {
                e.preventDefault();
                nextBtn.click();
            }
        }
    }
}

// --- HUB LOGIC ---
function switchModeUI() {
    const studyInfoText = document.getElementById('studyInfoText');
    const quizInfoText = document.getElementById('quizInfoText');

    if (currentMode === 'study') {
        hubInstructions.innerText = "Select a week to study:";
        quizStartContainer.classList.add('hidden');
        redoWrongLabel.classList.add('hidden'); 
        studyInfoText.classList.remove('hidden'); // Show blue study instructions
    } else {
        hubInstructions.innerText = "Select weeks for the quiz:";
        quizStartContainer.classList.remove('hidden');
        redoWrongLabel.classList.remove('hidden'); 
        studyInfoText.classList.add('hidden'); // Hide blue study instructions
        quizInfoText.classList.remove('hidden'); // Show red quiz instructions
        quizWeeksSelected.clear();
        updateQuizStartBtn();
    }
    renderGrid();
}

function updateQuizStartBtn() {
    startQuizBtn.disabled = quizWeeksSelected.size === 0;
}

function renderGrid() {
    weekGrid.innerHTML = '';
    const weeks = ['All', ...Array.from({length: 13}, (_, i) => i)]; 
    
    weeks.forEach(w => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.innerText = w;
        
        if (currentMode === 'quiz' && quizWeeksSelected.has(w)) {
            btn.classList.add('selected-multi');
        }

        btn.addEventListener('click', () => handleGridClick(w));
        weekGrid.appendChild(btn);
    });
}

function handleGridClick(week) {
    if (currentMode === 'study') {
        studyQueueCache = {}; 
        startStudyMode(week);
    } else {
        if (week === 'All') {
            if (quizWeeksSelected.has('All')) {
                quizWeeksSelected.clear();
            } else {
                quizWeeksSelected.clear();
                ['All', ...Array.from({length: 13}, (_, i) => i)].forEach(w => quizWeeksSelected.add(w));
            }
        } else {
            if (quizWeeksSelected.has(week)) {
                quizWeeksSelected.delete(week);
                quizWeeksSelected.delete('All'); 
            } else {
                quizWeeksSelected.add(week);
            }
        }
        updateQuizStartBtn();
        renderGrid(); 
    }
}

function returnToHub() {
    stopTimer();
    document.getElementById('studyActiveView').classList.add('hidden');
    document.getElementById('quizActiveView').classList.add('hidden');
    document.getElementById('quizResultsView').classList.add('hidden');
    
    hubView.classList.remove('hidden');
    mainHeader.classList.remove('hidden'); 
}

// --- STUDY MODE ---
function startStudyMode(week, startAtEnd = false) {
    currentStudyWeek = week;
    
    if (!studyQueueCache[week]) {
        let pool = week === 'All' ? [...rawData] : rawData.filter(q => q.week === week);
        if (sharedRandomizeCheck.checked) {
            pool.sort(() => Math.random() - 0.5);
        }
        studyQueueCache[week] = pool;
    }
    
    studyQueue = studyQueueCache[week];
    if(studyQueue.length === 0) return;
    
    hubView.classList.add('hidden');
    mainHeader.classList.add('hidden'); 
    document.getElementById('studyActiveView').classList.remove('hidden');
    
    const initialIndex = startAtEnd ? studyQueue.length - 1 : 0;
    renderStudyQuestion(initialIndex);
}

function renderStudyQuestion(index) {
    const isNext = index >= studyIndex;
    studyIndex = index;
    const q = studyQueue[studyIndex];
    
    const weekLabel = currentStudyWeek === 'All' ? `All Weeks [Week ${q.week}]` : `Week ${currentStudyWeek}`;
    document.getElementById('studyProgressText').innerText = `${weekLabel} - ${studyIndex + 1} / ${studyQueue.length}`;
    
    const container = document.getElementById('studyQuestionContainer');
    container.innerHTML = `
        <div class="question-card" style="animation: ${isNext ? 'slideInRight 0.2s ease-out' : 'slideInLeft 0.2s ease-out'}">
            <div class="question-text">${q.question}</div>
            <div id="studyOptions"></div>
        </div>
    `;

    const optsContainer = document.getElementById('studyOptions');
    
    const displayOptions = getSmartShuffledOptions(q.options);
    
    displayOptions.forEach(opt => {
        const isCorrect = opt === q.answer;
        const btn = document.createElement('div');
        btn.className = `option ${isCorrect ? 'study-correct' : ''}`;
        btn.innerText = opt;
        optsContainer.appendChild(btn);
    });

    manageStudyButtons();
}

function manageStudyButtons() {
    const prevBtn = document.getElementById('studyPrevBtn');
    const navButtons = document.getElementById('studyNavButtons');
    const finishButtons = document.getElementById('studyFinishButtons');
    const nextWeekBtn = document.getElementById('studyNextWeekBtn');

    if (studyIndex === 0) {
        if (currentStudyWeek !== 'All' && currentStudyWeek > 0) {
            prevBtn.classList.remove('invisible');
        } else {
            prevBtn.classList.add('invisible');
        }
    } else {
        prevBtn.classList.remove('invisible');
    }

    if (studyIndex === studyQueue.length - 1) {
        navButtons.classList.add('hidden');
        finishButtons.classList.remove('hidden');
        
        if (currentStudyWeek === 'All' || currentStudyWeek === 12) {
            nextWeekBtn.innerText = "Back to Home";
        } else {
            nextWeekBtn.innerText = `Start Week ${currentStudyWeek + 1}`;
        }
    } else {
        navButtons.classList.remove('hidden');
        finishButtons.classList.add('hidden');
    }
}

function jumpToNextWeek() {
    if (currentStudyWeek === 'All' || currentStudyWeek === 12) {
        returnToHub();
    } else {
        startStudyMode(currentStudyWeek + 1);
    }
}

// --- QUIZ MODE ---
function formatTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function startTimer() {
    secondsElapsed = 0;
    document.getElementById('quizTimerText').innerText = "00:00";
    timerInterval = setInterval(() => {
        secondsElapsed++;
        document.getElementById('quizTimerText').innerText = formatTime(secondsElapsed);
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
}

function startQuiz() {
    if (quizWeeksSelected.size === 0) return;

    let pool = quizWeeksSelected.has('All') 
        ? [...rawData] 
        : rawData.filter(q => quizWeeksSelected.has(q.week));

    if (sharedRandomizeCheck.checked) {
        pool.sort(() => Math.random() - 0.5);
    }

    quizQueue = pool.map((q, i) => ({
        ...q,
        originalIndex: i,
        isRetry: false
    }));

    quizIndex = 0;
    wrongCount = 0;
    totalAttempts = 0; 
    originalQuizLength = quizQueue.length;
    
    weekStats = {};
    quizQueue.forEach(q => {
        if (!weekStats[q.week]) {
            weekStats[q.week] = { total: 0, correct: 0 };
        }
        weekStats[q.week].total++;
    });
    
    segmentContainer.innerHTML = '';
    for(let i=0; i<originalQuizLength; i++) {
        const seg = document.createElement('div');
        seg.className = 'segment';
        seg.id = `segment-${i}`;
        segmentContainer.appendChild(seg);
    }

    hubView.classList.add('hidden');
    mainHeader.classList.add('hidden'); 
    document.getElementById('quizActiveView').classList.remove('hidden');
    
    startTimer();
    renderQuizQuestion();
}

function renderQuizQuestion() {
    const q = quizQueue[quizIndex];
    
    let progressStr = `${quizIndex + 1} / ${originalQuizLength}`;
    if (wrongCount > 0) {
        progressStr += ` ( +${wrongCount} )`;
    }
    document.getElementById('quizProgressText').innerText = progressStr;
    
    const nextBtn = document.getElementById('quizNextBtn');
    nextBtn.classList.add('locked-hidden'); 
    nextBtn.innerText = quizIndex === quizQueue.length - 1 ? 'Finish Quiz' : 'NEXT';

    let retryBadge = q.isRetry ? `<span class="retry-tag">RETRY</span>` : '';

    const container = document.getElementById('quizQuestionContainer');
    
    if (q.isRetry) {
        container.innerHTML = `
            <div class="question-card">
                <div class="question-header">
                    <div class="question-text">${q.question}</div>
                    <div class="retry-tag">RETRY</div>
                </div>
                <div id="quizOptions" class="options-container quiz-active"></div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="question-card">
                <div class="question-text">${q.question}</div>
                <div id="quizOptions" class="options-container quiz-active"></div>
            </div>
        `;
    }

    const optsContainer = document.getElementById('quizOptions');
    
    const displayOptions = getSmartShuffledOptions(q.options);
    
    displayOptions.forEach(opt => {
        const btn = document.createElement('div');
        btn.className = 'option';
        btn.innerText = opt;
        btn.addEventListener('click', () => handleQuizSelection(btn, opt, q.answer));
        optsContainer.appendChild(btn);
    });
}

function handleQuizSelection(selectedDiv, selectedText, correctAnswer) {
    const optsContainer = document.getElementById('quizOptions');
    optsContainer.classList.remove('quiz-active');
    optsContainer.classList.add('locked');

    totalAttempts++;

    const currentQ = quizQueue[quizIndex];
    const seg = document.getElementById(`segment-${currentQ.originalIndex}`);

    if (selectedText === correctAnswer) {
        selectedDiv.classList.add('quiz-correct');
        
        seg.classList.remove('wrong');
        seg.classList.add('correct');
        
        if (!currentQ.isRetry) {
            weekStats[currentQ.week].correct++;
        }
        
        setTimeout(() => {
            processQuizNext();
        }, 800);
        
    } else {
        selectedDiv.classList.add('quiz-wrong');
        
        seg.classList.remove('correct');
        seg.classList.add('wrong');
        
        Array.from(optsContainer.children).forEach(child => {
            if (child.innerText === correctAnswer) {
                child.classList.add('quiz-correct');
            }
        });

        // NEW: Check if the user wants to redo wrong answers
        if (redoWrongCheck.checked) {
            const retryQuestion = {
                ...currentQ,
                isRetry: true
            };

            if (sharedRandomizeCheck.checked) {
                const retryStartIndex = Math.max(quizIndex + 1, originalQuizLength);
                const randomInsertIndex = Math.floor(Math.random() * (quizQueue.length - retryStartIndex + 1)) + retryStartIndex;
                quizQueue.splice(randomInsertIndex, 0, retryQuestion);
            } else {
                quizQueue.push(retryQuestion);
            }
            
            wrongCount++; // Only increment this if we actually pushed a retry question
        }

        const nextBtn = document.getElementById('quizNextBtn');
        nextBtn.innerText = 'NEXT'; 
        nextBtn.classList.remove('locked-hidden');
    }
}

function processQuizNext() {
    quizIndex++;
    if (quizIndex < quizQueue.length) {
        renderQuizQuestion();
    } else {
        showQuizResults();
    }
}

function showQuizResults() {
    stopTimer();
    document.getElementById('quizActiveView').classList.add('hidden');
    document.getElementById('quizResultsView').classList.remove('hidden');

    // NEW: Smart accuracy math based on the retry setting
    let percentage;
    if (redoWrongCheck.checked) {
        // If retries are on, perfect score = (Total Questions / Total Attempts)
        percentage = Math.round((originalQuizLength / totalAttempts) * 100);
    } else {
        // If retries are off, score = (Total Correct First Try / Total Questions)
        let totalCorrectFirstTry = 0;
        Object.values(weekStats).forEach(stat => totalCorrectFirstTry += stat.correct);
        percentage = Math.round((totalCorrectFirstTry / originalQuizLength) * 100);
    }
    
    document.getElementById('scoreDisplay').innerHTML = `${percentage}<span class="percent-sign">%</span>`;
    document.getElementById('finalTimeText').innerText = formatTime(secondsElapsed);

    const statsContainer = document.getElementById('weekStatsContainer');
    statsContainer.innerHTML = '';
    
    const sortedWeeks = Object.keys(weekStats).sort((a, b) => Number(a) - Number(b));
    
    sortedWeeks.forEach(week => {
        const stats = weekStats[week];
        const weekPercentage = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
        
        let cardClass = 'week-stat-card';
        if (weekPercentage < 70) cardClass += ' needs-review';
        if (weekPercentage === 100) cardClass += ' perfect';

        const card = document.createElement('div');
        card.className = cardClass;
        card.innerHTML = `
            <div class="week-stat-title">Week ${week}</div>
            <div class="week-stat-score">${stats.correct}/${stats.total}</div>
        `;
        statsContainer.appendChild(card);
    });
}

init();