// Data & State
let rawData = [];
let currentMode = 'study';

// Study State
let studyQueue = [];
let studyIndex = 0;
let currentStudyWeek = null;

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

// DOM Elements
const mainHeader = document.getElementById('mainHeader'); 
const modeRadios = document.getElementsByName('modeToggle');
const hubView = document.getElementById('hubView');
const hubInstructions = document.getElementById('hubInstructions');
const weekGrid = document.getElementById('weekGrid');
const sharedRandomizeCheck = document.getElementById('sharedRandomizeCheck');
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

    document.getElementById('studyPrevBtn').addEventListener('click', () => renderStudyQuestion(studyIndex - 1));
    document.getElementById('studyNextBtn').addEventListener('click', () => renderStudyQuestion(studyIndex + 1));
    document.getElementById('studyRestartBtn').addEventListener('click', () => renderStudyQuestion(0));
    document.getElementById('studyNextWeekBtn').addEventListener('click', jumpToNextWeek);

    document.getElementById('quizNextBtn').addEventListener('click', processQuizNext);

    // Bulletproof Keyboard Navigation Listener
    document.addEventListener('keydown', handleKeyboardNavigation);
}

// --- KEYBOARD LOGIC ---
function handleKeyboardNavigation(e) {
    const isStudyActive = !document.getElementById('studyActiveView').classList.contains('hidden');
    const isQuizActive = !document.getElementById('quizActiveView').classList.contains('hidden');

    // Using e.code is universally safer than e.key for spacebars
    const isNext = e.code === 'Space' || e.key === ' ' || e.code === 'ArrowRight' || e.key === 'ArrowRight';
    const isPrev = e.code === 'ArrowLeft' || e.key === 'ArrowLeft';

    if (isStudyActive) {
        if (isNext) {
            e.preventDefault(); // Stop spacebar from scrolling down
            if (studyIndex < studyQueue.length - 1) {
                document.getElementById('studyNextBtn').click();
            } else {
                document.getElementById('studyNextWeekBtn').click();
            }
        } else if (isPrev) {
            e.preventDefault();
            if (studyIndex > 0) {
                document.getElementById('studyPrevBtn').click();
            }
        }
    } else if (isQuizActive) {
        if (isNext) {
            const nextBtn = document.getElementById('quizNextBtn');
            // Only simulate the click if the button is actually visible to the user
            if (!nextBtn.classList.contains('locked-hidden')) {
                e.preventDefault();
                nextBtn.click();
            }
        }
    }
}

// --- HUB LOGIC ---
function switchModeUI() {
    if (currentMode === 'study') {
        hubInstructions.innerText = "Select a week to study:";
        quizStartContainer.classList.add('hidden');
    } else {
        hubInstructions.innerText = "Select weeks for the quiz:";
        quizStartContainer.classList.remove('hidden');
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
function startStudyMode(week) {
    currentStudyWeek = week;
    
    studyQueue = week === 'All' ? [...rawData] : rawData.filter(q => q.week === week);
    if(studyQueue.length === 0) return;

    if (sharedRandomizeCheck.checked) {
        studyQueue.sort(() => Math.random() - 0.5);
    }
    
    hubView.classList.add('hidden');
    mainHeader.classList.add('hidden'); 
    document.getElementById('studyActiveView').classList.remove('hidden');
    renderStudyQuestion(0);
}

function renderStudyQuestion(index) {
    studyIndex = index;
    const q = studyQueue[studyIndex];
    
    const weekLabel = currentStudyWeek === 'All' ? 'All Weeks' : `Week ${currentStudyWeek}`;
    document.getElementById('studyProgressText').innerText = `${weekLabel} - ${studyIndex + 1} / ${studyQueue.length}`;
    
    const container = document.getElementById('studyQuestionContainer');
    container.innerHTML = `
        <div class="question-card">
            <div class="question-text">${q.question}</div>
            <div id="studyOptions"></div>
        </div>
    `;

    const optsContainer = document.getElementById('studyOptions');
    q.options.forEach(opt => {
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
        prevBtn.classList.add('invisible');
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
    q.options.forEach(opt => {
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

        quizQueue.push({
            ...currentQ,
            isRetry: true
        });
        wrongCount++;

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

    const percentage = Math.round((originalQuizLength / totalAttempts) * 100);
    
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