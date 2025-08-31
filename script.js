// Initialize Supabase
const SUPABASE_URL = 'https://rimyvppplwtkspbxhpuu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpbXl2cHBwbHd0a3NwYnhocHV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2MjA4NjUsImV4cCI6MjA3MjE5Njg2NX0.WfnZ7OtWtJBmWrmAy-5ZnjNso2io9tZKr4eGNtYrecA';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global app state
let appState = {
    sidebar: {
        collapsed: false,
        mobileVisible: false
    },
    subjects: [],
    currentSubject: null,
    roomTimer: {
        running: false,
        startTime: null,
        elapsed: 0,
        subject: null
    }
};

// Initialize app after DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// Global authManager variable
let authManager = null;

function initializeApp() {
    setupSidebarToggle();
    setupNavigation();
    setupMobileResponsiveness();
    
    // Initialize auth manager
    authManager = new AuthManager();
    
    // Make it globally accessible
    window.authManager = authManager;
    
    // Initialize other components when authenticated
    authManager.onAuthChange((isAuthenticated) => {
        if (isAuthenticated) {
            initializeMainApp();
        }
    });
}

function setupSidebarToggle() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    const overlay = document.getElementById('sidebarOverlay');
    
    // Desktop toggle (collapse)
    sidebarToggle.addEventListener('click', function() {
        if (window.innerWidth > 768) {
            appState.sidebar.collapsed = !appState.sidebar.collapsed;
            sidebar.classList.toggle('collapsed', appState.sidebar.collapsed);
            mainContent.classList.toggle('sidebar-collapsed', appState.sidebar.collapsed);
        } else {
            // Mobile toggle (show/hide)
            appState.sidebar.mobileVisible = !appState.sidebar.mobileVisible;
            sidebar.classList.toggle('mobile-visible', appState.sidebar.mobileVisible);
            overlay.classList.toggle('active', appState.sidebar.mobileVisible);
        }
    });
    
    // Mobile overlay click to close
    overlay.addEventListener('click', function() {
        appState.sidebar.mobileVisible = false;
        sidebar.classList.remove('mobile-visible');
        overlay.classList.remove('active');
    });
}

function setupMobileResponsiveness() {
    window.addEventListener('resize', function() {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.querySelector('.main-content');
        const overlay = document.getElementById('sidebarOverlay');
        
        if (window.innerWidth > 768) {
            // Desktop: restore collapse state, hide mobile elements
            sidebar.classList.remove('mobile-visible');
            overlay.classList.remove('active');
            sidebar.classList.toggle('collapsed', appState.sidebar.collapsed);
            mainContent.classList.toggle('sidebar-collapsed', appState.sidebar.collapsed);
            appState.sidebar.mobileVisible = false;
        } else {
            // Mobile: remove desktop collapse, use mobile visibility
            sidebar.classList.remove('collapsed');
            mainContent.classList.remove('sidebar-collapsed');
            sidebar.classList.toggle('mobile-visible', appState.sidebar.mobileVisible);
        }
    });
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const section = this.dataset.section;
            switchSection(section);
            
            // Close mobile sidebar after navigation
            if (window.innerWidth <= 768) {
                appState.sidebar.mobileVisible = false;
                document.getElementById('sidebar').classList.remove('mobile-visible');
                document.getElementById('sidebarOverlay').classList.remove('active');
            }
        });
    });
}

function switchSection(sectionName) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
    
    // Update content sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionName).classList.add('active');
    
    // Update header title
    const titles = {
        'dashboard': 'Dashboard',
        'timer': 'Pomodoro Timer',
        'subjects': 'Subjects',
        'rooms': 'Study Rooms',
        'sessions': 'Study Sessions',
        'history': 'History'
    };
    document.getElementById('sectionTitle').textContent = titles[sectionName] || sectionName;
}

function initializeMainApp() {
    // Initialize all components
    const subjectManager = new SubjectManager();
    const timerManager = new ModernTimerManager(subjectManager);
    const roomManager = new RoomManager(subjectManager);
    const studyTracker = new StudyTracker();
    
    // Setup logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            authManager.logout();
        });
    }
}

// Subject Manager Class
class SubjectManager {
    constructor() {
        this.subjects = [];
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        await this.loadSubjects();
        this.updateDisplay();
        this.populateSelectors();
    }
    
    setupEventListeners() {
        const form = document.getElementById('subjectForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleAddSubject(e));
        }
    }
    
    async handleAddSubject(e) {
        e.preventDefault();
        
        const name = document.getElementById('subjectName').value.trim();
        const weeklyTarget = parseInt(document.getElementById('weeklyTarget').value);
        
        if (!name || !weeklyTarget || weeklyTarget <= 0) {
            this.showNotification('Please fill in all fields with valid values', 'error');
            return;
        }
        
        // Check if subject already exists
        if (this.subjects.find(s => s.name.toLowerCase() === name.toLowerCase())) {
            this.showNotification('Subject already exists', 'error');
            return;
        }
        
        const subject = {
            id: Date.now(),
            name: name,
            weeklyTarget: weeklyTarget,
            hoursCompleted: 0,
            createdAt: new Date().toISOString()
        };
        
        const saved = await this.saveSubject(subject);
        if (saved) {
            this.subjects.push(subject);
            this.updateDisplay();
            this.populateSelectors();
            document.getElementById('subjectForm').reset();
            this.showNotification('Subject added successfully!', 'success');
        }
    }
    
    async saveSubject(subject) {
        if (!authManager?.isAuthenticated) {
            this.showNotification('Please log in to save subjects', 'error');
            return false;
        }
        
        try {
            const { data, error } = await supabase
                .from('subjects')
                .insert([{
                    name: subject.name,
                    weekly_target: subject.weeklyTarget,
                    hours_completed: subject.hoursCompleted,
                    user_id: authManager.currentUser.id
                }]);
            
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error saving subject:', error);
            this.showNotification('Error saving subject', 'error');
            return false;
        }
    }
    
    async loadSubjects() {
        if (!authManager?.isAuthenticated) {
            console.log('User not authenticated, skipping subject loading');
            return;
        }
        
        try {
            const { data, error } = await supabase
                .from('subjects')
                .select('*')
                .eq('user_id', authManager.currentUser.id);
            
            if (error) throw error;
            
            this.subjects = data.map(item => ({
                id: item.id,
                name: item.name,
                weeklyTarget: item.weekly_target,
                hoursCompleted: item.hours_completed || 0,
                createdAt: item.created_at
            }));
        } catch (error) {
            console.error('Error loading subjects:', error);
        }
    }
    
    async updateSubjectProgress(subjectId, additionalHours) {
        const subject = this.subjects.find(s => s.id === subjectId);
        if (!subject) return;
        
        subject.hoursCompleted += additionalHours;
        
        try {
            const { error } = await supabase
                .from('subjects')
                .update({ hours_completed: subject.hoursCompleted })
                .eq('id', subjectId);
            
            if (error) throw error;
            
            this.updateDisplay();
        } catch (error) {
            console.error('Error updating subject progress:', error);
        }
    }
    
    async deleteSubject(subjectId) {
        try {
            const { error } = await supabase
                .from('subjects')
                .delete()
                .eq('id', subjectId);
            
            if (error) throw error;
            
            this.subjects = this.subjects.filter(s => s.id !== subjectId);
            this.updateDisplay();
            this.populateSelectors();
            this.showNotification('Subject deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting subject:', error);
            this.showNotification('Error deleting subject', 'error');
        }
    }
    
    updateDisplay() {
        const container = document.getElementById('subjectsList');
        if (!container) return;
        
        if (this.subjects.length === 0) {
            container.innerHTML = '<p class="no-subjects">No subjects yet. Add a subject to start tracking your progress!</p>';
            return;
        }
        
        container.innerHTML = this.subjects.map(subject => {
            const progress = Math.min((subject.hoursCompleted / subject.weeklyTarget) * 100, 100);
            return `
                <div class="subject-card">
                    <div class="subject-header">
                        <h4 class="subject-name">${subject.name}</h4>
                        <button class="subject-delete" onclick="subjectManager.deleteSubject(${subject.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <div class="subject-progress">
                        <div class="progress-info">
                            <span class="progress-text">Weekly Progress</span>
                            <span class="progress-percentage">${progress.toFixed(1)}%</span>
                        </div>
                        <div class="progress-bar-subject">
                            <div class="progress-fill-subject" style="width: ${progress}%"></div>
                        </div>
                    </div>
                    <div class="subject-stats">
                        <span>${subject.hoursCompleted.toFixed(1)}h completed</span>
                        <span>${subject.weeklyTarget}h target</span>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    populateSelectors() {
        const selectors = [
            document.getElementById('timerSubject'),
            document.getElementById('roomTimerSubject'),
            document.getElementById('subject')
        ];
        
        selectors.forEach(selector => {
            if (!selector) return;
            
            // Store current value
            const currentValue = selector.value;
            
            // Clear and repopulate
            selector.innerHTML = '<option value="">Select a subject</option>';
            this.subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject.id;
                option.textContent = subject.name;
                selector.appendChild(option);
            });
            
            // Restore selection if still valid
            if (currentValue && this.subjects.find(s => s.id.toString() === currentValue)) {
                selector.value = currentValue;
            }
        });
    }
    
    getSubject(id) {
        return this.subjects.find(s => s.id.toString() === id.toString());
    }
    
    showNotification(message, type) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Set background color based on type
        let backgroundColor;
        switch (type) {
            case 'success':
                backgroundColor = '#10b981';
                break;
            case 'error':
                backgroundColor = '#ef4444';
                break;
            case 'warning':
                backgroundColor = '#f59e0b';
                break;
            default:
                backgroundColor = '#6366f1';
        }
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${backgroundColor};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Store globally for deletion function
let subjectManager;

// Modern Timer Manager Class
class ModernTimerManager {
    constructor(subjectManager) {
        this.subjectManager = subjectManager;
        this.timer = {
            isRunning: false,
            isPaused: false,
            mode: 'work', // work, break, longBreak
            timeLeft: 25 * 60, // in seconds
            totalTime: 25 * 60,
            session: 1,
            selectedSubject: null
        };
        
        this.settings = {
            workTime: 25,
            breakTime: 5,
            longBreakTime: 15
        };
        
        this.interval = null;
        this.audioContext = null;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.updateDisplay();
        this.updateProgressRing();
    }
    
    setupEventListeners() {
        // Timer controls
        const startBtn = document.getElementById('startTimer');
        const pauseBtn = document.getElementById('pauseTimer');
        const resetBtn = document.getElementById('resetTimer');
        
        if (startBtn) startBtn.addEventListener('click', () => this.start());
        if (pauseBtn) pauseBtn.addEventListener('click', () => this.pause());
        if (resetBtn) resetBtn.addEventListener('click', () => this.reset());
        
        // Settings
        const workTimeInput = document.getElementById('workTime');
        const breakTimeInput = document.getElementById('breakTime');
        const longBreakTimeInput = document.getElementById('longBreakTime');
        
        if (workTimeInput) workTimeInput.addEventListener('change', () => this.updateSettings());
        if (breakTimeInput) breakTimeInput.addEventListener('change', () => this.updateSettings());
        if (longBreakTimeInput) longBreakTimeInput.addEventListener('change', () => this.updateSettings());
        
        // Subject selection
        const subjectSelect = document.getElementById('timerSubject');
        if (subjectSelect) {
            subjectSelect.addEventListener('change', (e) => {
                this.timer.selectedSubject = e.target.value;
            });
        }
    }
    
    start() {
        if (!this.timer.selectedSubject) {
            this.showNotification('Please select a subject first', 'warning');
            return;
        }
        
        if (!this.audioContext) {
            this.initAudioContext();
        }
        
        this.timer.isRunning = true;
        this.timer.isPaused = false;
        
        this.interval = setInterval(() => {
            this.tick();
        }, 1000);
        
        this.updateControls();
    }
    
    pause() {
        this.timer.isRunning = false;
        this.timer.isPaused = true;
        
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        
        this.updateControls();
    }
    
    reset() {
        this.timer.isRunning = false;
        this.timer.isPaused = false;
        this.timer.mode = 'work';
        this.timer.session = 1;
        
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        
        this.updateTimeFromSettings();
        this.updateDisplay();
        this.updateProgressRing();
        this.updateControls();
    }
    
    tick() {
        this.timer.timeLeft--;
        
        if (this.timer.timeLeft <= 0) {
            this.completePhase();
        }
        
        this.updateDisplay();
        this.updateProgressRing();
    }
    
    completePhase() {
        this.timer.isRunning = false;
        
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        
        // Play notification sound
        this.playNotificationSound();
        
        // Update subject progress if work session completed
        if (this.timer.mode === 'work' && this.timer.selectedSubject) {
            const minutes = this.settings.workTime;
            const hours = minutes / 60;
            this.subjectManager.updateSubjectProgress(parseInt(this.timer.selectedSubject), hours);
        }
        
        // Switch to next phase
        if (this.timer.mode === 'work') {
            if (this.timer.session % 4 === 0) {
                this.timer.mode = 'longBreak';
                this.timer.timeLeft = this.settings.longBreakTime * 60;
                this.timer.totalTime = this.settings.longBreakTime * 60;
                this.showNotification('Work session complete! Time for a long break.', 'success');
            } else {
                this.timer.mode = 'break';
                this.timer.timeLeft = this.settings.breakTime * 60;
                this.timer.totalTime = this.settings.breakTime * 60;
                this.showNotification('Work session complete! Time for a short break.', 'success');
            }
        } else {
            this.timer.mode = 'work';
            this.timer.timeLeft = this.settings.workTime * 60;
            this.timer.totalTime = this.settings.workTime * 60;
            this.timer.session++;
            this.showNotification('Break complete! Ready for the next work session?', 'info');
        }
        
        this.updateDisplay();
        this.updateProgressRing();
        this.updateControls();
    }
    
    updateSettings() {
        this.settings.workTime = parseInt(document.getElementById('workTime').value) || 25;
        this.settings.breakTime = parseInt(document.getElementById('breakTime').value) || 5;
        this.settings.longBreakTime = parseInt(document.getElementById('longBreakTime').value) || 15;
        
        if (!this.timer.isRunning && !this.timer.isPaused) {
            this.updateTimeFromSettings();
            this.updateDisplay();
            this.updateProgressRing();
        }
    }
    
    updateTimeFromSettings() {
        if (this.timer.mode === 'work') {
            this.timer.timeLeft = this.settings.workTime * 60;
            this.timer.totalTime = this.settings.workTime * 60;
        } else if (this.timer.mode === 'break') {
            this.timer.timeLeft = this.settings.breakTime * 60;
            this.timer.totalTime = this.settings.breakTime * 60;
        } else if (this.timer.mode === 'longBreak') {
            this.timer.timeLeft = this.settings.longBreakTime * 60;
            this.timer.totalTime = this.settings.longBreakTime * 60;
        }
    }
    
    updateDisplay() {
        const display = document.getElementById('timerDisplay');
        const phase = document.getElementById('timerPhase');
        const session = document.getElementById('timerSession');
        
        if (display) {
            const minutes = Math.floor(this.timer.timeLeft / 60);
            const seconds = this.timer.timeLeft % 60;
            display.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        
        if (phase) {
            const phaseNames = {
                'work': 'Focus Time',
                'break': 'Short Break',
                'longBreak': 'Long Break'
            };
            phase.textContent = phaseNames[this.timer.mode];
        }
        
        if (session) {
            session.textContent = `Session ${this.timer.session} of 4`;
        }
    }
    
    updateProgressRing() {
        const ring = document.getElementById('timerProgressRing');
        if (!ring) return;
        
        const progress = 1 - (this.timer.timeLeft / this.timer.totalTime);
        const circumference = 2 * Math.PI * 140; // radius = 140
        const offset = circumference * (1 - progress);
        
        ring.style.strokeDashoffset = offset;
        
        // Change color based on mode
        const colors = {
            'work': '#6366f1',
            'break': '#10b981',
            'longBreak': '#f59e0b'
        };
        ring.setAttribute('stroke', colors[this.timer.mode]);
    }
    
    updateControls() {
        const startBtn = document.getElementById('startTimer');
        const pauseBtn = document.getElementById('pauseTimer');
        const resetBtn = document.getElementById('resetTimer');
        
        if (startBtn && pauseBtn) {
            if (this.timer.isRunning) {
                startBtn.disabled = true;
                pauseBtn.disabled = false;
            } else {
                startBtn.disabled = false;
                pauseBtn.disabled = true;
            }
        }
    }
    
    initAudioContext() {
        // Initialize audio context on first user interaction
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.warn('Audio context not supported:', error);
        }
    }
    
    playNotificationSound() {
        if (!this.audioContext) return;
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.5);
        } catch (error) {
            console.warn('Failed to play notification sound:', error);
        }
    }
    
    showNotification(message, type) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Set background color based on type
        let backgroundColor;
        switch (type) {
            case 'success':
                backgroundColor = '#10b981';
                break;
            case 'error':
                backgroundColor = '#ef4444';
                break;
            case 'warning':
                backgroundColor = '#f59e0b';
                break;
            default:
                backgroundColor = '#6366f1';
        }
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${backgroundColor};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Room Manager Class
class RoomManager {
    constructor(subjectManager) {
        this.subjectManager = subjectManager;
        this.currentRoom = null;
        this.roomTimer = {
            running: false,
            startTime: null,
            elapsed: 0,
            subject: null
        };
        this.timerInterval = null;
        this.members = new Map();
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.updateDisplay();
    }
    
    setupEventListeners() {
        // Room action selector
        const actionBtns = document.querySelectorAll('.room-action-btn');
        actionBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchRoomAction(btn.dataset.action));
        });
        
        // Forms
        const joinForm = document.getElementById('joinRoomForm');
        const createForm = document.getElementById('createRoomForm');
        
        if (joinForm) joinForm.addEventListener('submit', (e) => this.handleJoinRoom(e));
        if (createForm) createForm.addEventListener('submit', (e) => this.handleCreateRoom(e));
        
        // Room timer
        const timerBtn = document.getElementById('roomTimerBtn');
        if (timerBtn) timerBtn.addEventListener('click', () => this.toggleRoomTimer());
        
        // Leave room
        const leaveBtn = document.getElementById('leaveRoom');
        if (leaveBtn) leaveBtn.addEventListener('click', () => this.leaveRoom());
        
        // Chat
        const chatForm = document.getElementById('chatForm');
        if (chatForm) chatForm.addEventListener('submit', (e) => this.handleSendMessage(e));
    }
    
    switchRoomAction(action) {
        // Update buttons
        document.querySelectorAll('.room-action-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-action="${action}"]`).classList.add('active');
        
        // Update forms
        document.querySelectorAll('.room-form').forEach(form => {
            form.classList.remove('active');
        });
        document.getElementById(`${action}RoomSection`).classList.add('active');
    }
    
    async handleJoinRoom(e) {
        e.preventDefault();
        
        const roomCode = document.getElementById('joinRoomCode').value.trim().toUpperCase();
        
        if (!roomCode) {
            this.showNotification('Please enter a room code', 'error');
            return;
        }
        
        try {
            // Simulate joining room (replace with actual implementation)
            this.currentRoom = {
                id: Date.now(),
                name: `Room ${roomCode}`,
                code: roomCode,
                creator: false
            };
            
            this.showRoomInterface();
            this.showNotification(`Joined room ${roomCode}`, 'success');
            
        } catch (error) {
            console.error('Error joining room:', error);
            this.showNotification('Failed to join room', 'error');
        }
    }
    
    async handleCreateRoom(e) {
        e.preventDefault();
        
        const roomName = document.getElementById('roomName').value.trim();
        const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
        
        if (!roomName || !roomCode) {
            this.showNotification('Please fill in all fields', 'error');
            return;
        }
        
        if (roomCode.length < 4) {
            this.showNotification('Room code must be at least 4 characters', 'error');
            return;
        }
        
        try {
            // Simulate creating room (replace with actual implementation)
            this.currentRoom = {
                id: Date.now(),
                name: roomName,
                code: roomCode,
                creator: true
            };
            
            this.showRoomInterface();
            this.showNotification(`Room ${roomName} created`, 'success');
            
        } catch (error) {
            console.error('Error creating room:', error);
            this.showNotification('Failed to create room', 'error');
        }
    }
    
    showRoomInterface() {
        const actionBar = document.getElementById('roomActionBar');
        const roomInterface = document.getElementById('roomInterface');
        
        if (actionBar) actionBar.style.display = 'none';
        if (roomInterface) {
            roomInterface.style.display = 'block';
            
            // Update room info
            const nameEl = document.getElementById('currentRoomName');
            const codeEl = document.getElementById('currentRoomCode');
            
            if (nameEl) nameEl.textContent = this.currentRoom.name;
            if (codeEl) codeEl.textContent = this.currentRoom.code;
        }
        
        // Add current user as member
        this.addMember({
            id: 'current-user',
            name: 'You',
            status: 'idle'
        });
        
        // Clear chat and add welcome message
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '';
            this.addChatMessage({
                id: 'system',
                sender: 'System',
                text: 'Welcome to the room! Start studying together.',
                timestamp: new Date(),
                own: false,
                system: true
            });
        }
    }
    
    hideRoomInterface() {
        const actionBar = document.getElementById('roomActionBar');
        const roomInterface = document.getElementById('roomInterface');
        
        if (actionBar) actionBar.style.display = 'block';
        if (roomInterface) roomInterface.style.display = 'none';
        
        this.currentRoom = null;
        this.members.clear();
        this.stopRoomTimer();
    }
    
    leaveRoom() {
        if (this.currentRoom) {
            this.showNotification(`Left room ${this.currentRoom.code}`, 'info');
            this.hideRoomInterface();
        }
    }
    
    toggleRoomTimer() {
        const subjectSelect = document.getElementById('roomTimerSubject');
        const selectedSubject = subjectSelect?.value;
        
        if (!this.roomTimer.running && !selectedSubject) {
            this.showNotification('Please select a subject first', 'warning');
            return;
        }
        
        if (this.roomTimer.running) {
            this.stopRoomTimer();
        } else {
            this.startRoomTimer(selectedSubject);
        }
    }
    
    startRoomTimer(subjectId) {
        this.roomTimer.running = true;
        this.roomTimer.startTime = Date.now() - this.roomTimer.elapsed;
        this.roomTimer.subject = subjectId;
        
        // Update user status to studying
        this.updateMemberStatus('current-user', 'studying');
        
        // Start timer interval
        this.timerInterval = setInterval(() => {
            this.updateRoomTimerDisplay();
        }, 1000);
        
        this.updateRoomTimerButton();
    }
    
    stopRoomTimer() {
        if (this.roomTimer.running) {
            this.roomTimer.running = false;
            
            // Calculate session duration and update subject progress
            const sessionDuration = (Date.now() - this.roomTimer.startTime) / 1000 / 3600; // hours
            
            if (this.roomTimer.subject && sessionDuration > 0) {
                this.subjectManager.updateSubjectProgress(
                    parseInt(this.roomTimer.subject),
                    sessionDuration
                );
            }
            
            // Update user status to idle
            this.updateMemberStatus('current-user', 'idle');
            
            // Clear timer interval
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            
            this.roomTimer.elapsed = 0;
            this.updateRoomTimerDisplay();
        }
        
        this.updateRoomTimerButton();
    }
    
    updateRoomTimerDisplay() {
        const display = document.getElementById('roomTimerDisplay');
        if (!display) return;
        
        if (this.roomTimer.running) {
            const elapsed = Date.now() - this.roomTimer.startTime;
            const totalSeconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            
            display.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            this.roomTimer.elapsed = elapsed;
        } else {
            display.textContent = '00:00';
        }
    }
    
    updateRoomTimerButton() {
        const btn = document.getElementById('roomTimerBtn');
        if (!btn) return;
        
        if (this.roomTimer.running) {
            btn.innerHTML = '<i class="fas fa-pause"></i>';
            btn.classList.add('paused');
        } else {
            btn.innerHTML = '<i class="fas fa-play"></i>';
            btn.classList.remove('paused');
        }
    }
    
    addMember(member) {
        this.members.set(member.id, member);
        this.updateMembersDisplay();
    }
    
    updateMemberStatus(memberId, status) {
        const member = this.members.get(memberId);
        if (member) {
            member.status = status;
            this.updateMembersDisplay();
        }
    }
    
    updateMembersDisplay() {
        const container = document.getElementById('membersList');
        if (!container) return;
        
        container.innerHTML = Array.from(this.members.values()).map(member => `
            <div class="member-tag">
                <div class="member-status ${member.status}"></div>
                <span>${member.name}</span>
                <small>(${member.status === 'studying' ? 'Studying' : 'Idle'})</small>
            </div>
        `).join('');
    }
    
    handleSendMessage(e) {
        e.preventDefault();
        
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (!message) return;
        
        this.addChatMessage({
            id: Date.now(),
            sender: 'You',
            text: message,
            timestamp: new Date(),
            own: true
        });
        
        input.value = '';
    }
    
    addChatMessage(message) {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${message.own ? 'own' : ''} ${message.system ? 'system' : ''}`;
        
        if (message.system) {
            messageEl.innerHTML = `
                <div class="system-message">
                    <i class="fas fa-info-circle"></i>
                    ${message.text}
                </div>
            `;
        } else {
            messageEl.innerHTML = `
                <div class="message-avatar">${message.sender.charAt(0).toUpperCase()}</div>
                <div class="message-content">
                    <div class="message-header ${message.own ? 'own' : ''}">
                        <span class="message-sender">${message.sender}</span>
                        <span class="message-time">${message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div class="message-bubble">${message.text}</div>
                </div>
            `;
        }
        
        container.appendChild(messageEl);
        container.scrollTop = container.scrollHeight;
    }
    
    updateDisplay() {
        // Update room interface visibility
        if (this.currentRoom) {
            this.showRoomInterface();
        } else {
            this.hideRoomInterface();
        }
    }
    
    showNotification(message, type) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Set background color based on type
        let backgroundColor;
        switch (type) {
            case 'success':
                backgroundColor = '#10b981';
                break;
            case 'error':
                backgroundColor = '#ef4444';
                break;
            case 'warning':
                backgroundColor = '#f59e0b';
                break;
            default:
                backgroundColor = '#6366f1';
        }
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${backgroundColor};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Authentication Manager Class
// Study Tracker Class
class StudyTracker {
    constructor() {
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.updateDisplay();
    }
    
    setupEventListeners() {
        // Example event listener setup
        const exampleBtn = document.getElementById('exampleBtn');
        if (exampleBtn) {
            exampleBtn.addEventListener('click', () => this.handleExampleAction());
        }
    }
    
    handleExampleAction() {
        this.showNotification('Example action triggered', 'info');
    }
    
    updateDisplay() {
        // Update study tracker display
    }
    
    showNotification(message, type) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Set background color based on type
        let backgroundColor;
        switch (type) {
            case 'success':
                backgroundColor = '#10b981';
                break;
            case 'error':
                backgroundColor = '#ef4444';
                break;
            case 'warning':
                backgroundColor = '#f59e0b';
                break;
            default:
                backgroundColor = '#6366f1';
        }
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${backgroundColor};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Authentication Manager Class
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.onAuthChangeCallbacks = [];
        
        this.init();
    }

    async init() {
        // Set up auth state listener
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth state changed:', event, session);
            
            if (session?.user) {
                this.currentUser = session.user;
                this.isAuthenticated = true;
                await this.handleUserLogin();
            } else {
                this.currentUser = null;
                this.isAuthenticated = false;
                this.handleUserLogout();
            }
            
            // Notify all callbacks about auth state change
            this.onAuthChangeCallbacks.forEach(callback => {
                callback(this.isAuthenticated, this.currentUser);
            });
        });

        // Check if user is already logged in
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            this.currentUser = session.user;
            this.isAuthenticated = true;
        }
        
        this.setupEventListeners();
        this.updateUI();
    }

    onAuthChange(callback) {
        this.onAuthChangeCallbacks.push(callback);
    }

    setupEventListeners() {
        // Auth tab switching
        const authTabs = document.querySelectorAll('.auth-tab');
        authTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabType = tab.dataset.tab;
                this.switchAuthTab(tabType);
            });
        });

        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Signup form
        const signupForm = document.getElementById('signupForm');
        if (signupForm) {
            signupForm.addEventListener('submit', (e) => this.handleSignup(e));
        }
    }

    switchAuthTab(tabType) {
        // Update tab buttons
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabType}"]`).classList.add('active');

        // Update forms
        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.remove('active');
        });
        document.getElementById(`${tabType}Form`).classList.add('active');

        // Clear messages
        this.clearAuthMessage();
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        if (!email || !password) {
            this.showAuthMessage('Please fill in all fields', 'error');
            return;
        }
        
        this.showAuthLoading(true);
        this.clearAuthMessage();
        
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });
            
            if (error) {
                throw error;
            }
            
            this.showAuthMessage('Login successful! Redirecting...', 'success');
            
            // The auth state change will handle the rest
            
        } catch (error) {
            console.error('Login error:', error);
            this.showAuthMessage(error.message || 'Login failed. Please try again.', 'error');
        } finally {
            this.showAuthLoading(false);
        }
    }

    async handleSignup(e) {
        e.preventDefault();
        
        const username = document.getElementById('signupUsername').value.trim();
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        // Comprehensive validation following project specifications
        if (!username || !email || !password || !confirmPassword) {
            this.showAuthMessage('Please fill in all fields', 'error');
            return;
        }
        
        if (username.length < 3) {
            this.showAuthMessage('Username must be at least 3 characters long', 'error');
            return;
        }
        
        if (password.length < 6) {
            this.showAuthMessage('Password must be at least 6 characters long', 'error');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showAuthMessage('Passwords do not match', 'error');
            return;
        }
        
        if (!this.isValidEmail(email)) {
            this.showAuthMessage('Please enter a valid email address', 'error');
            return;
        }
        
        this.showAuthLoading(true);
        this.clearAuthMessage();
        
        try {
            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        username: username
                    }
                }
            });
            
            if (error) {
                throw error;
            }
            
            if (data.user && !data.session) {
                this.showAuthMessage('Please check your email to confirm your account before logging in.', 'success');
                this.switchAuthTab('login');
            } else {
                this.showAuthMessage('Account created successfully!', 'success');
            }
            
        } catch (error) {
            console.error('Signup error:', error);
            this.showAuthMessage(error.message || 'Signup failed. Please try again.', 'error');
        } finally {
            this.showAuthLoading(false);
        }
    }

    async handleUserLogin() {
        // Hide auth modal and show main app
        document.getElementById('authModal').classList.remove('active');
        document.body.classList.remove('auth-active');
        
        // Update username display
        try {
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('username')
                .eq('id', this.currentUser.id)
                .single();
            
            if (profile?.username) {
                document.getElementById('username').textContent = profile.username;
            } else {
                document.getElementById('username').textContent = this.currentUser.email;
            }
        } catch (error) {
            console.warn('Failed to load user profile:', error);
            document.getElementById('username').textContent = this.currentUser.email;
        }
        
        // Initialize app with user data
        this.showNotification('Welcome back!', 'success');
        
        // Initialize main app components
        setTimeout(() => {
            const subjectManagerInstance = new SubjectManager();
            window.subjectManager = subjectManagerInstance;
        }, 100);
    }

    handleUserLogout() {
        // Show auth modal and hide main app
        document.getElementById('authModal').classList.add('active');
        document.body.classList.add('auth-active');
        
        // Reset forms
        document.getElementById('loginForm').reset();
        document.getElementById('signupForm').reset();
        this.clearAuthMessage();
        
        // Switch to login tab
        this.switchAuthTab('login');
    }

    async logout() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            
            this.showNotification('Logged out successfully', 'info');
        } catch (error) {
            console.error('Logout error:', error);
            this.showNotification('Error logging out', 'error');
        }
    }

    updateUI() {
        if (this.isAuthenticated) {
            document.getElementById('authModal').classList.remove('active');
            document.body.classList.remove('auth-active');
        } else {
            document.getElementById('authModal').classList.add('active');
            document.body.classList.add('auth-active');
        }
    }

    showAuthMessage(message, type) {
        const messageEl = document.getElementById('authMessage');
        messageEl.textContent = message;
        messageEl.className = `auth-message ${type}`;
        messageEl.style.display = 'block';
    }

    clearAuthMessage() {
        const messageEl = document.getElementById('authMessage');
        messageEl.style.display = 'none';
    }

    showAuthLoading(show) {
        const loadingEl = document.getElementById('authLoading');
        if (show) {
            loadingEl.classList.add('active');
        } else {
            loadingEl.classList.remove('active');
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Set background color based on type
        let backgroundColor;
        switch (type) {
            case 'success':
                backgroundColor = '#10b981';
                break;
            case 'error':
                backgroundColor = '#ef4444';
                break;
            case 'warning':
                backgroundColor = '#f59e0b';
                break;
            default:
                backgroundColor = '#6366f1';
        }
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${backgroundColor};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}
class StudyTracker {
    constructor() {
        this.sessions = [];
        this.isLoading = false;
        this.authManager = null;
        
        // Don't initialize immediately, wait for auth
    }

    async init(authManager) {
        this.authManager = authManager;
        this.setupEventListeners();
        
        if (authManager.isAuthenticated) {
            await this.loadSessionsFromSupabase();
        }
        
        this.updateDisplay();
    }

    setupEventListeners() {
        const form = document.getElementById('studyForm');
        form.addEventListener('submit', (e) => this.handleFormSubmit(e));
    }

    handleFormSubmit(e) {
        e.preventDefault();
        
        const subject = document.getElementById('subject').value.trim();
        const duration = parseInt(document.getElementById('duration').value);
        const notes = document.getElementById('notes').value.trim();
        
        if (!subject || !duration || duration <= 0 || isNaN(duration)) {
            alert('Please fill in all required fields with valid values');
            return;
        }

        const session = {
            id: Date.now(),
            subject: subject,
            duration: duration,
            notes: notes,
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString()
        };

        this.addSession(session);
        this.resetForm();
    }

    async addSession(session) {
        // Add to local array first for immediate UI update
        this.sessions.unshift(session);
        this.updateDisplay();
        
        // Save to Supabase
        const saved = await this.saveSessionToSupabase(session);
        
        if (saved) {
            this.showNotification('Study session added successfully!', 'success');
        } else {
            // Remove from local array if save failed
            this.sessions = this.sessions.filter(s => s !== session);
            this.updateDisplay();
        }
    }

    async deleteSession(id) {
        // Remove from local array first for immediate UI update
        const originalSessions = [...this.sessions];
        this.sessions = this.sessions.filter(session => session.id !== id);
        this.updateDisplay();
        
        // Delete from Supabase
        const deleted = await this.deleteSessionFromSupabase(id);
        
        if (deleted) {
            this.showNotification('Study session deleted!', 'success');
        } else {
            // Restore local array if delete failed
            this.sessions = originalSessions;
            this.updateDisplay();
        }
    }

    resetForm() {
        document.getElementById('studyForm').reset();
    }

    // Remove localStorage methods as we're using Supabase now
    // Keep as fallback methods but don't use them by default

    async loadSessionsFromSupabase() {
        if (!this.authManager?.isAuthenticated) {
            return;
        }
        
        this.isLoading = true;
        
        try {
            const { data, error } = await supabase
                .from('study_sessions')
                .select('*')
                .eq('user_id', this.authManager.currentUser.id)
                .order('created_at', { ascending: false });
            
            if (error) {
                throw error;
            }
            
            this.sessions = data.map(session => ({
                id: session.id,
                subject: session.subject,
                duration: session.duration,
                notes: session.notes,
                timestamp: session.created_at,
                date: new Date(session.session_date).toLocaleDateString()
            }));
            
        } catch (error) {
            console.error('Failed to load sessions from Supabase:', error);
            this.showNotification('Failed to load your study sessions', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    async saveSessionToSupabase(session) {
        if (!this.authManager?.isAuthenticated) {
            this.showNotification('Please log in to save sessions', 'error');
            return false;
        }
        
        try {
            const { data, error } = await supabase
                .from('study_sessions')
                .insert({
                    user_id: this.authManager.currentUser.id,
                    subject: session.subject,
                    duration: session.duration,
                    notes: session.notes,
                    session_date: new Date().toISOString().split('T')[0] // Today's date
                })
                .select()
                .single();
            
            if (error) {
                throw error;
            }
            
            // Update local session with server data
            session.id = data.id;
            session.timestamp = data.created_at;
            
            return true;
            
        } catch (error) {
            console.error('Failed to save session to Supabase:', error);
            this.showNotification('Failed to save session', 'error');
            return false;
        }
    }

    async deleteSessionFromSupabase(sessionId) {
        if (!this.authManager?.isAuthenticated) {
            return false;
        }
        
        try {
            const { error } = await supabase
                .from('study_sessions')
                .delete()
                .eq('id', sessionId)
                .eq('user_id', this.authManager.currentUser.id);
            
            if (error) {
                throw error;
            }
            
            return true;
            
        } catch (error) {
            console.error('Failed to delete session from Supabase:', error);
            this.showNotification('Failed to delete session', 'error');
            return false;
        }
    }

    getTodaySessions() {
        const today = new Date().toLocaleDateString();
        return this.sessions.filter(session => session.date === today);
    }

    calculateTodayStats() {
        const todaySessions = this.getTodaySessions();
        const totalSessions = todaySessions.length;
        const totalTime = todaySessions.reduce((sum, session) => sum + session.duration, 0);
        
        return { totalSessions, totalTime };
    }

    updateDisplay() {
        this.updateSummary();
        this.updateSessionsList();
    }

    updateSummary() {
        const stats = this.calculateTodayStats();
        document.getElementById('totalSessions').textContent = stats.totalSessions;
        document.getElementById('totalTime').textContent = stats.totalTime;
    }

    updateSessionsList() {
        const sessionsList = document.getElementById('sessionsList');
        
        if (this.sessions.length === 0) {
            sessionsList.innerHTML = '<p class="no-sessions">No study sessions yet. Start studying to see your progress!</p>';
            return;
        }

        const sessionsHTML = this.sessions.map(session => this.createSessionHTML(session)).join('');
        sessionsList.innerHTML = sessionsHTML;

        // Add delete event listeners
        this.sessions.forEach(session => {
            const deleteBtn = document.querySelector(`[data-session-id="${session.id}"]`);
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => this.deleteSession(session.id));
            }
        });
    }

    createSessionHTML(session) {
        const time = new Date(session.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        return `
            <div class="session-item">
                <div class="session-header">
                    <span class="session-subject">${session.subject}</span>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="session-time">${time}</span>
                        <span class="session-duration">${session.duration} min</span>
                        <button class="delete-btn" data-session-id="${session.id}">×</button>
                    </div>
                </div>
                ${session.notes ? `<div class="session-notes">${session.notes}</div>` : ''}
            </div>
        `;
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#48bb78' : '#4299e1'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}

// Pomodoro Timer Class
class PomodoroTimer {
    constructor() {
        this.workTime = 25;
        this.breakTime = 5;
        this.longBreakTime = 15;
        this.sessionsPerLongBreak = 4;
        
        this.currentTime = this.workTime * 60;
        this.isRunning = false;
        this.isPaused = false;
        this.currentPhase = 'work'; // 'work', 'break', 'long-break'
        this.sessionCount = 1;
        this.timerInterval = null;
        this.audioContext = null;
        this.audioInitialized = false;
        this.authManager = null;
        
        // Don't initialize immediately, wait for auth
    }

    async init(authManager) {
        this.authManager = authManager;
        this.setupEventListeners();
        
        if (authManager.isAuthenticated) {
            await this.loadSettingsFromSupabase();
        } else {
            this.loadSettings(); // Fallback to localStorage
        }
        
        this.updateDisplay();
        this.setupCleanup();
    }

    setupCleanup() {
        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        // Clean up on visibility change (e.g., tab switch)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isRunning) {
                // Optionally pause timer when tab is hidden
                console.log('Tab hidden, timer continues running');
            }
        });
    }

    cleanup() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
    }

    setupEventListeners() {
        document.getElementById('startTimer').addEventListener('click', () => this.start());
        document.getElementById('pauseTimer').addEventListener('click', () => this.pause());
        document.getElementById('resetTimer').addEventListener('click', () => this.reset());
        
        // Settings inputs
        document.getElementById('workTime').addEventListener('change', (e) => {
            this.workTime = parseInt(e.target.value);
            this.saveSettingsToSupabase();
            if (!this.isRunning) this.reset();
        });
        
        document.getElementById('breakTime').addEventListener('change', (e) => {
            this.breakTime = parseInt(e.target.value);
            this.saveSettingsToSupabase();
        });
        
        document.getElementById('longBreakTime').addEventListener('change', (e) => {
            this.longBreakTime = parseInt(e.target.value);
            this.saveSettingsToSupabase();
        });
    }

    start() {
        // Initialize audio context on first user interaction
        this.initializeAudioContext();
        
        if (this.isPaused) {
            this.resume();
        } else {
            this.isRunning = true;
            this.isPaused = false;
            this.updateButtons();
            this.startTimer();
        }
    }

    pause() {
        this.isPaused = true;
        this.isRunning = false;
        this.updateButtons();
        this.stopTimer();
    }

    resume() {
        this.isRunning = true;
        this.isPaused = false;
        this.updateButtons();
        this.startTimer();
    }

    reset() {
        this.stopTimer();
        this.isRunning = false;
        this.isPaused = false;
        this.currentPhase = 'work';
        this.sessionCount = 1;
        this.currentTime = this.workTime * 60;
        this.updateDisplay();
        this.updateButtons();
        this.updateProgress();
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            this.currentTime--;
            this.updateDisplay();
            this.updateProgress();
            
            if (this.currentTime <= 0) {
                this.handleTimerComplete();
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    handleTimerComplete() {
        this.stopTimer();
        
        if (this.currentPhase === 'work') {
            this.showNotification('Work session completed! Time for a break.', 'success');
            this.playNotificationSound();
            
            if (this.sessionCount % this.sessionsPerLongBreak === 0) {
                this.currentPhase = 'long-break';
                this.currentTime = this.longBreakTime * 60;
            } else {
                this.currentPhase = 'break';
                this.currentTime = this.breakTime * 60;
            }
        } else {
            this.showNotification('Break completed! Time to work.', 'info');
            this.playNotificationSound();
            this.currentPhase = 'work';
            this.currentTime = this.workTime * 60;
            this.sessionCount++;
        }
        
        this.updateDisplay();
        this.updateProgress();
        this.updateButtons();
        
        // Auto-start next phase
        setTimeout(() => {
            if (!this.isPaused) {
                this.start();
            }
        }, 1000);
    }

    updateDisplay() {
        const minutes = Math.floor(this.currentTime / 60);
        const seconds = this.currentTime % 60;
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        document.getElementById('timerDisplay').textContent = timeString;
        document.getElementById('sessionCount').textContent = this.sessionCount;
        
        // Update phase text
        let phaseText = '';
        switch (this.currentPhase) {
            case 'work':
                phaseText = 'Work Time';
                break;
            case 'break':
                phaseText = 'Break Time';
                break;
            case 'long-break':
                phaseText = 'Long Break';
                break;
        }
        document.getElementById('timerPhase').textContent = phaseText;
        
        // Update timer circle appearance
        const timerCircle = document.querySelector('.timer-circle');
        timerCircle.className = 'timer-circle ' + this.currentPhase;
    }

    updateProgress() {
        let totalTime, elapsedTime;
        
        switch (this.currentPhase) {
            case 'work':
                totalTime = this.workTime * 60;
                elapsedTime = totalTime - this.currentTime;
                break;
            case 'break':
                totalTime = this.breakTime * 60;
                elapsedTime = totalTime - this.currentTime;
                break;
            case 'long-break':
                totalTime = this.longBreakTime * 60;
                elapsedTime = totalTime - this.currentTime;
                break;
        }
        
        const progressPercent = (elapsedTime / totalTime) * 100;
        document.getElementById('progressFill').style.width = progressPercent + '%';
    }

    updateButtons() {
        const startBtn = document.getElementById('startTimer');
        const pauseBtn = document.getElementById('pauseTimer');
        
        if (this.isRunning) {
            startBtn.style.display = 'none';
            pauseBtn.disabled = false;
        } else if (this.isPaused) {
            startBtn.textContent = 'Resume';
            startBtn.style.display = 'inline-block';
            pauseBtn.disabled = true;
        } else {
            startBtn.textContent = 'Start';
            startBtn.style.display = 'inline-block';
            pauseBtn.disabled = true;
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#48bb78' : '#4299e1'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after 5 seconds for timer notifications
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }

    initializeAudioContext() {
        if (!this.audioInitialized && !this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.audioInitialized = true;
            } catch (error) {
                console.warn('Audio context not available:', error);
            }
        }
    }

    playNotificationSound() {
        if (!this.audioContext || !this.audioInitialized) {
            console.log('Audio not available, skipping notification sound');
            return;
        }

        try {
            // Resume audio context if it's suspended (required by some browsers)
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
            oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.1);
            
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.3);
        } catch (error) {
            console.warn('Failed to play notification sound:', error);
        }
    }

    loadSettings() {
        try {
            const savedSettings = JSON.parse(localStorage.getItem('pomodoroSettings')) || {};
            this.workTime = savedSettings.workTime || 25;
            this.breakTime = savedSettings.breakTime || 5;
            this.longBreakTime = savedSettings.longBreakTime || 15;
            
            document.getElementById('workTime').value = this.workTime;
            document.getElementById('breakTime').value = this.breakTime;
            document.getElementById('longBreakTime').value = this.longBreakTime;
        } catch (error) {
            console.error('Failed to load timer settings:', error);
        }
    }

    saveSettings() {
        try {
            const settings = {
                workTime: this.workTime,
                breakTime: this.breakTime,
                longBreakTime: this.longBreakTime
            };
            localStorage.setItem('pomodoroSettings', JSON.stringify(settings));
        } catch (error) {
            console.error('Failed to save timer settings:', error);
        }
    }

    async loadSettingsFromSupabase() {
        if (!this.authManager?.isAuthenticated) {
            return;
        }
        
        try {
            const { data, error } = await supabase
                .from('timer_settings')
                .select('*')
                .eq('user_id', this.authManager.currentUser.id)
                .single();
            
            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
                throw error;
            }
            
            if (data) {
                this.workTime = data.work_time || 25;
                this.breakTime = data.break_time || 5;
                this.longBreakTime = data.long_break_time || 15;
            }
            
            // Update UI inputs
            document.getElementById('workTime').value = this.workTime;
            document.getElementById('breakTime').value = this.breakTime;
            document.getElementById('longBreakTime').value = this.longBreakTime;
            
        } catch (error) {
            console.error('Failed to load timer settings from Supabase:', error);
            // Fallback to localStorage
            this.loadSettings();
        }
    }

    async saveSettingsToSupabase() {
        if (!this.authManager?.isAuthenticated) {
            // Fallback to localStorage
            this.saveSettings();
            return;
        }
        
        try {
            const { error } = await supabase
                .from('timer_settings')
                .upsert({
                    user_id: this.authManager.currentUser.id,
                    work_time: this.workTime,
                    break_time: this.breakTime,
                    long_break_time: this.longBreakTime
                });
            
            if (error) {
                throw error;
            }
            
        } catch (error) {
            console.error('Failed to save timer settings to Supabase:', error);
            // Fallback to localStorage
            this.saveSettings();
        }
    }
}

// Study Rooms with MQTT
class StudyRooms {
    constructor() {
        this.client = null;
        this.currentRoom = null;
        this.username = '';
        this.rooms = new Map();
        this.mqttBroker = 'wss://broker.emqx.io:8084/mqtt'; // Free public MQTT broker
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.messageQueue = [];
        this.isProcessingQueue = false;
        this.authManager = null;
        
        // Don't initialize immediately, wait for auth
    }

    async init(authManager) {
        this.authManager = authManager;
        
        if (authManager.isAuthenticated) {
            this.username = await this.getAuthenticatedUsername();
        } else {
            this.username = this.generateUsername();
        }
        
        this.loadPersistedData();
        this.setupEventListeners();
        this.connectMQTT();
        this.setupCleanup();
    }

    async getAuthenticatedUsername() {
        try {
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('username')
                .eq('id', this.authManager.currentUser.id)
                .single();
            
            return profile?.username || this.authManager.currentUser.email.split('@')[0];
        } catch (error) {
            return this.authManager.currentUser.email.split('@')[0];
        }
    }

    setupCleanup() {
        // Clean up MQTT connection on page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Optionally disconnect when tab is hidden to save resources
                console.log('Tab hidden, MQTT connection maintained');
            } else if (!this.client || !this.client.connected) {
                // Reconnect when tab becomes visible again
                this.connectMQTT();
            }
        });
    }

    cleanup() {
        if (this.currentRoom) {
            this.leaveRoom();
        }
        
        if (this.client && this.client.connected) {
            try {
                this.client.end(true); // Force close
            } catch (error) {
                console.warn('Error closing MQTT connection:', error);
            }
        }
    }

    handleMQTTError(error) {
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts <= this.maxReconnectAttempts) {
            console.log(`MQTT reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            
            setTimeout(() => {
                if (!this.client || !this.client.connected) {
                    this.connectMQTT();
                }
            }, this.reconnectDelay * this.reconnectAttempts); // Exponential backoff
        } else {
            console.error('Max MQTT reconnection attempts reached');
            this.showNotification('Connection failed. Some features may not work.', 'error');
        }
    }

    handleMQTTDisconnect() {
        // Handle graceful disconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.handleMQTTError(new Error('Connection lost'));
        }
    }

    loadPersistedData() {
        try {
            // Load persisted username
            const savedUsername = localStorage.getItem('studyRoomsUsername');
            if (savedUsername) {
                this.username = savedUsername;
            } else {
                this.username = this.generateUsername();
                localStorage.setItem('studyRoomsUsername', this.username);
            }
            
            // Load last known rooms (for offline display)
            const savedRooms = localStorage.getItem('studyRoomsCache');
            if (savedRooms) {
                const roomsData = JSON.parse(savedRooms);
                roomsData.forEach(room => {
                    this.rooms.set(room.code, room);
                });
            }
        } catch (error) {
            console.warn('Failed to load persisted room data:', error);
        }
    }

    savePersistedData() {
        try {
            // Save current rooms to localStorage as cache
            const roomsArray = Array.from(this.rooms.values());
            localStorage.setItem('studyRoomsCache', JSON.stringify(roomsArray));
            
            // Save username
            localStorage.setItem('studyRoomsUsername', this.username);
        } catch (error) {
            console.warn('Failed to save room data:', error);
        }
    }

    queueMessage(action) {
        this.messageQueue.push(action);
        this.processMessageQueue();
    }

    async processMessageQueue() {
        if (this.isProcessingQueue || this.messageQueue.length === 0) {
            return;
        }
        
        this.isProcessingQueue = true;
        
        while (this.messageQueue.length > 0) {
            const action = this.messageQueue.shift();
            try {
                await action();
                // Small delay to prevent overwhelming the MQTT broker
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error('Error processing queued message:', error);
            }
        }
        
        this.isProcessingQueue = false;
    }

    setupEventListeners() {
        document.getElementById('createRoomForm').addEventListener('submit', (e) => this.handleCreateRoom(e));
        document.getElementById('joinRoomForm').addEventListener('submit', (e) => this.handleJoinRoom(e));
        document.getElementById('leaveRoom').addEventListener('click', () => this.leaveRoom());
        document.getElementById('chatForm').addEventListener('submit', (e) => this.handleChatMessage(e));
    }

    async connectMQTT() {
        try {
            this.updateMQTTStatus('connecting');
            
            this.client = mqtt.connect(this.mqttBroker, {
                clientId: `study_tracker_${Math.random().toString(16).slice(2, 8)}`,
                clean: true,
                connectTimeout: 4000,
                reconnectPeriod: 1000,
                keepalive: 60,
                will: {
                    topic: `study_rooms/user/${this.username}/status`,
                    payload: JSON.stringify({ status: 'offline', timestamp: new Date().toISOString() }),
                    qos: 1,
                    retain: false
                }
            });

            this.client.on('connect', () => {
                console.log('Connected to MQTT broker');
                this.updateMQTTStatus('connected');
                this.reconnectAttempts = 0; // Reset on successful connection
                this.subscribeToRooms();
                
                // Publish online status
                this.client.publish(`study_rooms/user/${this.username}/status`, 
                    JSON.stringify({ status: 'online', timestamp: new Date().toISOString() }));
            });

            this.client.on('message', (topic, message) => {
                this.handleMQTTMessage(topic, message);
            });

            this.client.on('error', (error) => {
                console.error('MQTT Error:', error);
                this.updateMQTTStatus('disconnected');
                this.handleMQTTError(error);
            });

            this.client.on('close', () => {
                console.log('MQTT connection closed');
                this.updateMQTTStatus('disconnected');
                this.handleMQTTDisconnect();
            });

            this.client.on('offline', () => {
                console.log('MQTT client offline');
                this.updateMQTTStatus('disconnected');
            });

            this.client.on('reconnect', () => {
                console.log('MQTT attempting to reconnect');
                this.updateMQTTStatus('connecting');
            });

        } catch (error) {
            console.error('Failed to connect to MQTT:', error);
            this.updateMQTTStatus('disconnected');
            this.handleMQTTError(error);
        }
    }

    updateMQTTStatus(status) {
        const statusElement = document.getElementById('mqttStatus');
        statusElement.className = `mqtt-status mqtt-${status}`;
        
        switch (status) {
            case 'connected':
                statusElement.textContent = 'MQTT: Connected';
                break;
            case 'connecting':
                statusElement.textContent = 'MQTT: Connecting...';
                break;
            case 'disconnected':
                statusElement.textContent = 'MQTT: Disconnected';
                break;
        }
    }

    subscribeToRooms() {
        if (this.client && this.client.connected) {
            // Subscribe to room discovery
            this.client.subscribe('study_rooms/discovery');
            // Subscribe to room updates
            this.client.subscribe('study_rooms/+/update');
            // Subscribe to room chat
            this.client.subscribe('study_rooms/+/chat');
            // Subscribe to room members
            this.client.subscribe('study_rooms/+/members');
        }
    }

    handleMQTTMessage(topic, message) {
        try {
            const data = JSON.parse(message.toString());
            
            if (topic === 'study_rooms/discovery') {
                this.handleRoomDiscovery(data);
            } else if (topic.includes('/update')) {
                this.handleRoomUpdate(data);
            } else if (topic.includes('/chat')) {
                this.handleRoomChat(data);
            } else if (topic.includes('/members')) {
                this.handleRoomMembers(data);
            }
        } catch (error) {
            console.warn('Error parsing MQTT message:', error, 'Topic:', topic, 'Message:', message.toString());
            // Don't crash the app on malformed messages
        }
    }

    handleRoomDiscovery(data) {
        if (data.type === 'room_list') {
            this.rooms.clear();
            data.rooms.forEach(room => {
                this.rooms.set(room.code, room);
            });
            this.updateRoomsList();
            this.savePersistedData();
        }
    }

    handleRoomUpdate(data) {
        if (data.type === 'room_created' || data.type === 'room_updated') {
            this.rooms.set(data.room.code, data.room);
            this.updateRoomsList();
            this.savePersistedData();
        } else if (data.type === 'room_deleted') {
            this.rooms.delete(data.room.code);
            this.updateRoomsList();
            this.savePersistedData();
        }
    }

    handleRoomChat(data) {
        if (this.currentRoom && data.roomCode === this.currentRoom.code) {
            this.addChatMessage(data.username, data.message, data.timestamp);
        }
    }

    handleRoomMembers(data) {
        if (this.currentRoom && data.roomCode === this.currentRoom.code) {
            this.updateRoomMembers(data.members);
        }
    }

    handleCreateRoom(e) {
        e.preventDefault();
        
        const roomName = document.getElementById('roomName').value.trim();
        const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
        
        if (!roomName || !roomCode) {
            alert('Please fill in all fields');
            return;
        }

        if (this.rooms.has(roomCode)) {
            alert('Room code already exists. Please choose a different one.');
            return;
        }

        const room = {
            name: roomName,
            code: roomCode,
            creator: this.username,
            members: [this.username],
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString()
        };

        this.createRoom(room);
        document.getElementById('createRoomForm').reset();
    }

    handleJoinRoom(e) {
        e.preventDefault();
        
        const roomCode = document.getElementById('joinRoomCode').value.trim().toUpperCase();
        
        if (!roomCode) {
            alert('Please enter a room code');
            return;
        }

        const room = this.rooms.get(roomCode);
        if (!room) {
            alert('Room not found. Please check the room code.');
            return;
        }

        this.joinRoom(room);
        document.getElementById('joinRoomForm').reset();
    }

    createRoom(room) {
        if (this.client && this.client.connected) {
            // Use message queue to prevent race conditions
            this.queueMessage(async () => {
                // Publish room creation
                this.client.publish('study_rooms/discovery', JSON.stringify({
                    type: 'room_created',
                    room: room
                }));
            });

            // Join the room immediately
            this.joinRoom(room);
        }
    }

    joinRoom(room) {
        if (this.client && this.client.connected) {
            this.currentRoom = room;
            
            // Add user to room members if not already there
            if (!room.members.includes(this.username)) {
                room.members.push(this.username);
            }

            // Use message queue to prevent race conditions
            this.queueMessage(async () => {
                // Publish room update
                this.client.publish(`study_rooms/${room.code}/update`, JSON.stringify({
                    type: 'room_updated',
                    room: room
                }));
            });

            this.queueMessage(async () => {
                // Publish member update
                this.client.publish(`study_rooms/${room.code}/members`, JSON.stringify({
                    type: 'members_update',
                    roomCode: room.code,
                    members: room.members
                }));
            });

            this.showCurrentRoom();
            this.showNotification(`Joined room: ${room.name}`, 'success');
        }
    }

    joinRoomByCode(roomCode) {
        const room = this.rooms.get(roomCode);
        if (room) {
            this.joinRoom(room);
        } else {
            this.showNotification('Room not found', 'error');
        }
    }

    leaveRoom() {
        if (this.currentRoom && this.client && this.client.connected) {
            // Remove user from room members
            const memberIndex = this.currentRoom.members.indexOf(this.username);
            if (memberIndex > -1) {
                this.currentRoom.members.splice(memberIndex, 1);
            }

            // Use message queue to prevent race conditions
            this.queueMessage(async () => {
                // Publish member update
                this.client.publish(`study_rooms/${this.currentRoom.code}/members`, JSON.stringify({
                    type: 'members_update',
                    roomCode: this.currentRoom.code,
                    members: this.currentRoom.members
                }));
            });

            // If room is empty, delete it
            if (this.currentRoom.members.length === 0) {
                this.queueMessage(async () => {
                    this.client.publish('study_rooms/discovery', JSON.stringify({
                        type: 'room_deleted',
                        room: this.currentRoom
                    }));
                });
                this.rooms.delete(this.currentRoom.code);
                this.updateRoomsList();
                this.savePersistedData();
            }

            this.currentRoom = null;
            this.hideCurrentRoom();
            this.showNotification('Left the room', 'info');
        }
    }

    handleChatMessage(e) {
        e.preventDefault();
        
        const messageInput = document.getElementById('chatInput');
        const message = messageInput.value.trim();
        
        if (!message || !this.currentRoom) return;

        if (this.client && this.client.connected) {
            const chatData = {
                type: 'chat_message',
                roomCode: this.currentRoom.code,
                username: this.username,
                message: message,
                timestamp: new Date().toISOString()
            };

            // Use message queue to prevent race conditions
            this.queueMessage(async () => {
                this.client.publish(`study_rooms/${this.currentRoom.code}/chat`, JSON.stringify(chatData));
            });
        }

        messageInput.value = '';
    }

    addChatMessage(username, message, timestamp) {
        const chatMessages = document.getElementById('chatMessages');
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        
        const time = new Date(timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        messageElement.innerHTML = `
            <div class="chat-message-header">
                <span class="chat-username">${username}</span>
                <span class="chat-timestamp">${time}</span>
            </div>
            <div class="chat-content">${message}</div>
        `;
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    updateRoomMembers(members) {
        this.currentRoom.members = members;
        this.updateMemberDisplay();
    }

    updateMemberDisplay() {
        const memberCount = document.getElementById('roomMemberCount');
        const memberList = document.getElementById('roomMembers');
        
        memberCount.textContent = this.currentRoom.members.length;
        
        memberList.innerHTML = `
            <div class="member-list">
                ${this.currentRoom.members.map(member => 
                    `<span class="member-tag">${member}</span>`
                ).join('')}
            </div>
        `;
    }

    showCurrentRoom() {
        document.getElementById('currentRoom').style.display = 'block';
        document.getElementById('currentRoomName').textContent = this.currentRoom.name;
        document.getElementById('currentRoomCode').textContent = this.currentRoom.code;
        this.updateMemberDisplay();
        
        // Clear chat
        document.getElementById('chatMessages').innerHTML = '';
        
        // Add welcome message
        this.addChatMessage('System', `Welcome to ${this.currentRoom.name}! Start chatting with your study group.`, new Date().toISOString());
    }

    hideCurrentRoom() {
        document.getElementById('currentRoom').style.display = 'none';
    }

    updateRoomsList() {
        const roomsList = document.getElementById('activeRoomsList');
        
        if (this.rooms.size === 0) {
            roomsList.innerHTML = '<p class="no-rooms">No active rooms. Create or join a room to start studying together!</p>';
            return;
        }

        const roomsHTML = Array.from(this.rooms.values()).map(room => `
            <div class="room-item" onclick="studyRooms.joinRoomByCode('${room.code}')">
                <div class="room-item-header">
                    <span class="room-name">${room.name}</span>
                    <span class="room-code">${room.code}</span>
                </div>
                <div class="room-members-count">${room.members.length} member(s)</div>
            </div>
        `).join('');
        
        roomsList.innerHTML = roomsHTML;
    }

    generateUsername() {
        // If user is authenticated, use their profile username or email
        if (this.authManager?.isAuthenticated) {
            return this.authManager.currentUser.email.split('@')[0];
        }
        
        // Fallback for non-authenticated users (shouldn't happen with new auth system)
        const adjectives = ['Studious', 'Focused', 'Dedicated', 'Curious', 'Brilliant', 'Eager', 'Motivated'];
        const nouns = ['Student', 'Learner', 'Scholar', 'Researcher', 'Explorer', 'Achiever', 'Dreamer'];
        
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const number = Math.floor(Math.random() * 1000);
        
        return `${adj}${noun}${number}`;
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Set background color based on type
        let backgroundColor;
        switch (type) {
            case 'success':
                backgroundColor = '#10b981';
                break;
            case 'error':
                backgroundColor = '#ef4444';
                break;
            case 'warning':
                backgroundColor = '#f59e0b';
                break;
            default:
                backgroundColor = '#6366f1';
        }
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${backgroundColor};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Navigation and UI Management
class NavigationManager {
    constructor() {
        this.currentSection = 'dashboard';
        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupSidebarToggle();
        this.updateDashboard();
    }

    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this.switchSection(section);
            });
        });
    }

    setupSidebarToggle() {
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sidebar = document.querySelector('.sidebar');
        
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 1024) {
                if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
                    sidebar.classList.remove('open');
                }
            }
        });
    }

    switchSection(section) {
        // Hide all sections
        document.querySelectorAll('.content-section').forEach(s => {
            s.classList.remove('active');
        });

        // Remove active class from all nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });

        // Show selected section
        document.getElementById(section).classList.add('active');

        // Add active class to selected nav item
        document.querySelector(`[data-section="${section}"]`).classList.add('active');

        // Update section title
        document.getElementById('sectionTitle').textContent = this.getSectionTitle(section);

        // Update current section
        this.currentSection = section;

        // Update dashboard if switching to dashboard
        if (section === 'dashboard') {
            this.updateDashboard();
        }
    }

    getSectionTitle(section) {
        const titles = {
            'dashboard': 'Dashboard',
            'timer': 'Pomodoro Timer',
            'sessions': 'Study Sessions',
            'rooms': 'Study Rooms',
            'history': 'Study History'
        };
        return titles[section] || 'Dashboard';
    }

    updateDashboard() {
        // Update dashboard stats
        const studyTracker = window.studyTracker;
        if (studyTracker) {
            const stats = studyTracker.calculateTodayStats();
            document.getElementById('todaySessions').textContent = stats.totalSessions;
            document.getElementById('todayFocusTime').textContent = `${stats.totalTime} min`;
        }

        // Update active rooms count
        const studyRooms = window.studyRooms;
        if (studyRooms) {
            document.getElementById('activeRoomsCount').textContent = studyRooms.rooms.size;
        }

        // Calculate weekly progress (placeholder for now)
        const weeklyProgress = Math.min(100, Math.floor(Math.random() * 100));
        document.getElementById('weeklyProgress').textContent = `${weeklyProgress}%`;
    }
}

// Global function for quick actions
function switchSection(section) {
    if (window.navigationManager) {
        window.navigationManager.switchSection(section);
    }
}

// Add some sample data for demonstration (remove this in production)
function addSampleData() {
    const sampleSessions = [
        {
            id: Date.now() - 1000,
            subject: 'Mathematics',
            duration: 45,
            notes: 'Studied calculus - derivatives and integrals',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            date: new Date().toLocaleDateString()
        },
        {
            id: Date.now() - 2000,
            subject: 'Physics',
            duration: 30,
            notes: 'Reviewed Newton\'s laws of motion',
            timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
            date: new Date().toLocaleDateString()
        }
    ];
    
    // Only add sample data if no sessions exist
    if (localStorage.getItem('studySessions') === null) {
        localStorage.setItem('studySessions', JSON.stringify(sampleSessions));
        location.reload(); // Reload to show sample data
    }
}

// Uncomment the line below to add sample data for demonstration
// addSampleData();

// Add logout functionality
function addLogoutButton() {
    const userInfo = document.querySelector('.user-info');
    const logoutBtn = document.createElement('button');
    logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
    logoutBtn.className = 'logout-btn';
    logoutBtn.title = 'Logout';
    logoutBtn.style.cssText = `
        background: #ef4444;
        color: white;
        border: none;
        padding: 8px 10px;
        border-radius: 6px;
        cursor: pointer;
        margin-left: 10px;
        font-size: 0.9rem;
        transition: all 0.3s ease;
    `;
    
    logoutBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to logout?')) {
            window.authManager.logout();
        }
    });
    
    logoutBtn.addEventListener('mouseenter', () => {
        logoutBtn.style.background = '#dc2626';
    });
    
    logoutBtn.addEventListener('mouseleave', () => {
        logoutBtn.style.background = '#ef4444';
    });
    
    userInfo.appendChild(logoutBtn);
}
