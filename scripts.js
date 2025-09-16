const SERVER_URL = 'http://127.0.0.1:8080';
let allFiles = [];
let chats = [];
let activeChatId = null;
let currentlyFilteredFiles = null; // NEU: Speichert die aktuell gefilterten Dateien

// --- Datenmanagement (LocalStorage) ---
function loadData() {
    chats = JSON.parse(localStorage.getItem('zettel-chats-v3')) || [];
    renderChatHistory();
}

function saveData() {
    localStorage.setItem('zettel-chats-v3', JSON.stringify(chats));
}

// --- UI Rendering (mit Filter-Logik) ---
function renderAllFiles(filteredFiles) {
    const filesList = document.getElementById('files-list');
    const libraryPanel = document.getElementById('library-panel');
    
    // Wenn `filteredFiles` übergeben wird, nutze diese Liste, ansonsten die globale `allFiles`-Liste
    const filesToRender = Array.isArray(filteredFiles) ? filteredFiles : allFiles;
    currentlyFilteredFiles = filteredFiles; // Speichere den aktuellen Filterstatus

    // Hebe die Bibliothek visuell hervor, wenn sie gefiltert ist
    libraryPanel.style.background = filteredFiles ? '#fffbe6' : 'var(--panel-bg)';

    if (filesToRender.length > 0) {
        filesList.innerHTML = filesToRender.map(file => `<div class="list-item" title="${file}">${file}</div>`).join('');
    } else if (filteredFiles) {
        filesList.innerHTML = '<div style="padding: 16px; color: var(--text-secondary);">No relevant documents found for this focus.</div>';
    } else {
        filesList.innerHTML = '<div style="padding: 16px; color: var(--text-secondary);">Library is empty. Use the browser extension to add documents.</div>';
    }
}

function renderChatHistory() {
    const chatList = document.getElementById('chat-history-list');
    chatList.innerHTML = '';
    chats.forEach(chat => {
        const item = document.createElement('div');
        item.className = 'list-item';
        if (chat.id === activeChatId) {
            item.classList.add('active');
        }
        const title = chat.filterPrompt ? `Focused: ${chat.filterPrompt}` : chat.title;
        item.textContent = title.length > 30 ? title.substring(0, 27) + '...' : title;
        item.title = title;
        item.onclick = () => selectChat(chat.id);
        chatList.appendChild(item);
    });
}

function renderChatWindow() {
    const chat = chats.find(c => c.id === activeChatId);
    const chatWindow = document.getElementById('chat-window');
    const innerWindow = document.createElement('div');
    innerWindow.className = 'chat-window-inner';

    if (!chat) {
        innerWindow.innerHTML = `<div class="welcome-message">
            <h2>Welcome to your Zettel AI Hub</h2>
            <p>Select a chat on the left or start a new one to begin.</p>
        </div>`;
    } else {
        chat.messages.forEach(msg => {
            const msgContainer = document.createElement('div');
            msgContainer.className = `chat-message ${msg.role}`;
            
            const avatar = document.createElement('div');
            avatar.className = 'avatar';
            avatar.innerHTML = `<span class="material-symbols-outlined">${msg.role === 'user' ? 'person' : 'smart_toy'}</span>`;

            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            // Wandelt die Antwort der KI von Markdown in HTML um
            bubble.innerHTML = marked.parse(msg.content); 
            
            msgContainer.appendChild(avatar);
            msgContainer.appendChild(bubble);
            innerWindow.appendChild(msgContainer);
        });
    }
    chatWindow.innerHTML = '';
    chatWindow.appendChild(innerWindow);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// --- Aktionen (mit neuer Filter-Logik) ---
async function selectChat(chatId) {
    activeChatId = chatId;
    const chat = chats.find(c => c.id === activeChatId);
    
    if (chat && chat.isFiltered) {
        // --- NEU: Ruft den intelligenten Filter im Backend auf ---
        const filesList = document.getElementById('files-list');
        filesList.innerHTML = '<div style="padding: 16px; color: var(--text-secondary);">Filtering documents...</div>';
        try {
            const response = await fetch(`${SERVER_URL}/filter-documents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filter_prompt: chat.filterPrompt })
            });
            const data = await response.json();
            if (data.status === 'success') {
                renderAllFiles(data.files); // Zeigt NUR die gefilterten Dateien an
            } else {
                filesList.innerHTML = `<div style="padding: 16px; color: red;">Filter Error: ${data.message}</div>`;
            }
        } catch (e) {
             filesList.innerHTML = '<div style="padding: 16px; color: red;">Server not reachable.</div>';
        }
    } else {
        // Bei einem "General Chat" werden alle Dokumente angezeigt
        renderAllFiles(null);
    }
    
    renderChatHistory();
    renderChatWindow();
}

function startNewChat(isFiltered = false, filterPrompt = '') {
    const newChat = {
        id: Date.now(),
        title: `General Chat #${chats.filter(c => !c.isFiltered).length + 1}`,
        isFiltered,
        filterPrompt,
        messages: [],
    };
    if (isFiltered && filterPrompt) {
        newChat.messages.push({ role: 'ai', content: `This chat is focused on: **${filterPrompt}**` });
    }
    chats.unshift(newChat);
    saveData();
    selectChat(newChat.id);
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const question = input.value.trim();
    if (!question || !activeChatId) return;

    const chat = chats.find(c => c.id === activeChatId);
    chat.messages.push({ role: 'user', content: question });
    renderChatWindow();
    input.value = '';
    autoGrow(input);
    
    // WICHTIG: Diese Logik ist noch ein PLATZHALTER.
    // Wir senden immer noch nur eine Datei. Der nächste Schritt wird sein,
    // ALLE gefilterten Dateien zu nehmen und deren Inhalt zu kombinieren.
    const filesForContext = currentlyFilteredFiles || allFiles;
    const filename = filesForContext.length > 0 ? filesForContext[0] : null;

    if (!filename) {
        chat.messages.push({ role: 'ai', content: 'Error: No relevant documents found to answer the question.' });
        renderChatWindow();
        return;
    }
    
    const thinkingMsg = { role: 'ai', content: '...' };
    chat.messages.push(thinkingMsg);
    renderChatWindow();

    try {
        const response = await fetch(`${SERVER_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, question }) 
        });
        const data = await response.json();
        thinkingMsg.content = data.status === 'success' ? data.answer : `Server Error: ${data.message}`;
    } catch (e) {
        thinkingMsg.content = 'Error: Could not reach the server.';
    } finally {
        saveData();
        renderChatWindow();
    }
}

function handleTextareaKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function autoGrow(element) {
    element.style.height = "auto";
    element.style.height = (element.scrollHeight) + "px";
}

// --- Modal-Logik ---
function showFocusPromptModal() {
    document.getElementById('focus-prompt-text').value = '';
    document.getElementById('focus-prompt-modal').style.display = 'flex';
}
function hideFocusPromptModal() {
    document.getElementById('focus-prompt-modal').style.display = 'none';
}
function saveFocusPrompt() {
    const promptText = document.getElementById('focus-prompt-text').value.trim();
    if (promptText) {
        startNewChat(true, promptText);
        hideFocusPromptModal();
    }
}

// --- Initialisierung ---
async function initialize() {
    loadData();
    await renderAllFiles(); // Warte, bis die Dateien geladen sind, bevor du fortfährst
}

window.onload = initialize;