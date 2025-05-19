// Get VS Code API
const vscode = acquireVsCodeApi();

// Elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const resetButton = document.getElementById('resetButton');
const contextButtonElement = document.getElementById('contextButton');
const highlightLayerElement = document.getElementById('highlightLayer');
const contextMenuContainer = document.getElementById('contextMenuContainer');

// Context menu elements and state
let contextMenuVisible = false;
let contextMenuSelectedIndex = -1;
let searchQuery = '';
let searchResults = [];
let cursorPosition = 0;
let currentFilePaths = [];
let isSearchLoading = false;
let justDeletedSpaceAfterMention = false;

// RegExp for detecting @ mentions
const mentionRegex = /@((?:\/|\w+:\/\/)[^\s]+?|[a-f0-9]{7,40}\b|problems\b|git-changes\b)(?=[.,;:!?]?(?=[\s\r\n]|$))/;
const mentionRegexGlobal = new RegExp(mentionRegex.source, 'g');

// Base context menu items
const baseContextItems = [
  { type: 'problems', value: 'problems', label: 'Problems', description: 'Workspace problems' }
];

// State
let isWaitingForResponse = false;
let isRestoringHistory = false;

// Try to restore state from vscode storage
try {
  const previousState = vscode.getState();
  if (previousState && previousState.messages) {
    // We'll use this state later during init
    console.log('Found previous webview state to restore');
  }
} catch (e) {
  console.error('Error restoring state:', e);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Focus the input
  messageInput.focus();
  
  // Auto-resize textarea
  messageInput.addEventListener('input', () => {
    autoResizeTextarea();
    updateHighlights();
  });
  
  // Set up context menu functionality
  if (messageInput) {
    // Listen for input changes to show/hide context menu
    messageInput.addEventListener('input', handleInputChange);
    
    // Listen for click/selection changes
    messageInput.addEventListener('click', handleInputChange);
    messageInput.addEventListener('select', handleInputChange);
    
    // Handle scrolling in the textarea
    messageInput.addEventListener('scroll', () => {
      if (highlightLayerElement) {
        highlightLayerElement.scrollTop = messageInput.scrollTop;
        highlightLayerElement.scrollLeft = messageInput.scrollLeft;
      }
    });
  }
  
  // Event listener for context button (if exists)
  if (contextButtonElement) {
    contextButtonElement.addEventListener('click', handleContextButtonClick);
  }
  
  // Click event listener for document to close context menu when clicking outside
  document.addEventListener('click', (e) => {
    // Check if click is outside the context menu and input
    const isClickOutside = 
      !contextMenuContainer?.contains(e.target) && 
      !messageInput?.contains(e.target) &&
      e.target !== contextButtonElement;
      
    if (isClickOutside && contextMenuVisible) {
      contextMenuVisible = false;
      renderContextMenu();
    }
  });
  
  // Initialize highlight layer
  updateHighlights();
  
  // Attempt to restore from local webview state first
  const previousState = vscode.getState();
  if (previousState && previousState.messages && previousState.messages.length > 0) {
    console.log('Restoring UI from webview state');
    handleRestoreMessageHistory(previousState.messages, previousState.status);
  } else {
    // If no local state, request history from extension
    console.log('Requesting message history from extension');
    requestMessageHistory();
  }
});

// Event listeners
sendButton.addEventListener('click', sendMessage);
resetButton.addEventListener('click', resetConversation);
messageInput.addEventListener('keydown', (e) => {
  if (contextMenuVisible) {
    // Handle context menu navigation
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        const items = Array.isArray(searchResults) && searchResults.length > 0
          ? searchResults : baseContextItems;
        contextMenuSelectedIndex = Math.min(contextMenuSelectedIndex + 1, items.length - 1);
        renderContextMenu();
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        contextMenuSelectedIndex = Math.max(contextMenuSelectedIndex - 1, 0);
        renderContextMenu();
        break;
        
      case 'Enter':
      case 'Tab':
        if (contextMenuSelectedIndex >= 0) {
          e.preventDefault();
          handleContextMenuSelect(contextMenuSelectedIndex);
        }
        break;
        
      case 'Escape':
        e.preventDefault();
        contextMenuVisible = false;
        renderContextMenu();
        break;
    }
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Store for maintaining messages locally
let localMessages = [];

// Handle messages from extension
window.addEventListener('message', (event) => {
  const message = event.data;
  
  switch (message.command) {
    case 'receiveMessage':
      // Don't add duplicate messages if we're restoring history
      if (!isRestoringHistory) {
        console.log("Received message:", message);
        
        // Handle both the new protocol (role/content) and compatibility with older protocol (sender/text)
        const role = message.role || message.sender;
        const content = message.content || message.text;
        
        // Add message to local storage
        localMessages.push({
          role: role,
          content: content,
          timestamp: message.timestamp
        });
        
        // Update webview state
        vscode.setState({ 
          messages: localMessages,
          status: isWaitingForResponse ? 'thinking' : 'ready'
        });
        
        // Display the message
        addMessage(role, content);
      }
      break;
    case 'updateStatus':
      handleStatusUpdate(message.status);
      // Save status in state
      const currentState = vscode.getState() || {};
      vscode.setState({ 
        ...currentState,
        status: message.status
      });
      break;
    case 'conversationReset':
      handleConversationReset();
      break;
    case 'restoreMessageHistory':
      // Update local messages array
      localMessages = message.messages || [];
      handleRestoreMessageHistory(message.messages, message.status);
      break;
  }
});

// Function to request message history from extension
function requestMessageHistory() {
  vscode.postMessage({
    command: 'requestMessageHistory'
  });
}

// Function to handle restored message history
function handleRestoreMessageHistory(messages, status) {
  // Set flag to prevent duplicate messages
  isRestoringHistory = true;
  
  // Clear existing messages first
  messagesContainer.innerHTML = '';
  
  // Add each message in history
  if (messages && messages.length) {
    console.log("Restoring messages:", messages);
    
    messages.forEach(msg => {
      // Handle both new protocol (role/content) and compatibility with older protocol (sender/text)
      const role = msg.role || msg.sender;
      const content = msg.content || msg.text;
      
      // Display message with the appropriate role and content
      addMessage(role, content);
    });
    
    // Save state to webview state storage
    vscode.setState({ 
      messages: messages,
      status: status
    });
  }
  
  // Reset flag
  isRestoringHistory = false;
  
  // Update UI status
  if (status) {
    handleStatusUpdate(status);
  }
}

// Functions
// Function to update highlights in the text area
function updateHighlights() {
  if (!highlightLayerElement || !messageInput) return;

  let processedText = messageInput.value;

  // Replace special characters with HTML entities for safety
  processedText = processedText
    .replace(/\n$/, '\n\n')
    .replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] || c)
    // Highlight @mentions
    .replace(mentionRegexGlobal, '<mark class="mention-highlight">$&</mark>');

  highlightLayerElement.innerHTML = processedText;
  // Match scroll position
  highlightLayerElement.scrollTop = messageInput.scrollTop;
  highlightLayerElement.scrollLeft = messageInput.scrollLeft;
}

// Function to check if context menu should be shown
function shouldShowContextMenu(text, position) {
  const beforeCursor = text.slice(0, position);
  const atIndex = beforeCursor.lastIndexOf('@');

  if (atIndex === -1) {
    return false;
  }

  const textAfterAt = beforeCursor.slice(atIndex + 1);

  // Check if there's any whitespace after the '@'
  if (/\s/.test(textAfterAt)) {
    return false;
  }

  // Don't show the menu if it's a URL
  if (textAfterAt.toLowerCase().startsWith('http')) {
    return false;
  }

  // Don't show the menu if it's already a problems or terminal
  if (textAfterAt.toLowerCase().startsWith('problems') || textAfterAt.toLowerCase().startsWith('terminal')) {
    return false;
  }

  // Show the menu if there's just '@' or '@' followed by some text (but not a URL)
  return true;
}

// Function to render the context menu
function renderContextMenu() {
  if (!contextMenuContainer) return;

  // Show/hide context menu
  contextMenuContainer.style.display = contextMenuVisible ? 'block' : 'none';
  
  if (!contextMenuVisible) return;

  // Use search results if available, otherwise use basic filter
  const filteredItems = Array.isArray(searchResults) && searchResults.length > 0
    ? searchResults.map(result => ({
        type: result.type,
        value: result.path,
        label: result.label || result.path.split('/').pop()
      }))
    : baseContextItems;

  // Create menu items HTML
  const menuItems = filteredItems.map((item, index) => {
    const isSelected = index === contextMenuSelectedIndex;
    
    // Determine icon based on item type
    let icon = 'file';
    if (item.type === 'folder') {
      icon = 'folder';
    } else if (item.type === 'git') {
      icon = 'git-commit';
    } else if (item.type === 'problems') {
      icon = 'warning';
    }
    
    // Format based on item type
    let itemContent = '';
    if (item.type === 'git') {
      // Git commit formatting
      itemContent = `
        <div class="git-option">
          <span>${item.label || item.value || ''}</span>
          ${item.description ? `<span class="description">${item.description}</span>` : ''}
        </div>
      `;
    } else if (item.value) {
      // File path formatting for items with a value 
      itemContent = `
        <span class="path-option">
          <span>/</span>
          <span class="path-text">${item.value.startsWith('/') ? item.value.substring(1) : item.value}</span>
        </span>
      `;
    } else {
      // For items without a value like "Problems"
      itemContent = `<span>${item.label || item.type}</span>`;
    }
    
    return `
      <div class="context-menu-item ${isSelected ? 'selected' : ''}" data-index="${index}">
        <div class="context-menu-item-content">
          <span class="codicon codicon-${icon}"></span>
          <div class="context-menu-text">
            ${itemContent}
          </div>
        </div>
        <span class="codicon codicon-add"></span>
      </div>
    `;
  });

  // If no results found
  if (filteredItems.length === 0) {
    menuItems.push(`
      <div class="context-menu-item not-selectable">
        <div class="context-menu-item-content">
          <span class="codicon codicon-info"></span>
          <div class="context-menu-text">No results found</div>
        </div>
      </div>
    `);
  }

  // Add loading state if searching
  if (isSearchLoading) {
    menuItems.unshift(`
      <div class="context-menu-item loading">
        <div class="loading-spinner"></div>
        <span>Searching...</span>
      </div>
    `);
  }

  // Build the menu HTML
  const menuHTML = `
    <div class="context-menu">
      ${menuItems.join('')}
    </div>
  `;

  // Update the context menu container
  contextMenuContainer.innerHTML = menuHTML;

  // Add click event listeners to menu items
  document.querySelectorAll('.context-menu-item:not(.not-selectable):not(.loading)').forEach((item, index) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleContextMenuSelect(index);
    });
    item.addEventListener('mouseenter', () => {
      contextMenuSelectedIndex = index;
      renderContextMenu();
    });
  });
}

// Function to insert a mention at the cursor position
function insertMention(text, position, value) {
  const beforeCursor = text.slice(0, position);
  const afterCursor = text.slice(position);

  // Find the position of the last '@' symbol before the cursor
  const lastAtIndex = beforeCursor.lastIndexOf('@');

  let newValue;
  let mentionIndex;

  if (lastAtIndex !== -1) {
    // If there's an '@' symbol, replace everything after it with the new mention
    const beforeMention = text.slice(0, lastAtIndex);
    newValue = beforeMention + '@' + value + ' ' + afterCursor.replace(/^[^\s]*/, '');
    mentionIndex = lastAtIndex;
  } else {
    // If there's no '@' symbol, insert the mention at the cursor position
    newValue = beforeCursor + '@' + value + ' ' + afterCursor;
    mentionIndex = position;
  }

  return { newValue, mentionIndex };
}

// Function to handle context menu selection
function handleContextMenuSelect(index) {
  const items = Array.isArray(searchResults) && searchResults.length > 0
    ? searchResults.map(result => ({
        type: result.type,
        value: result.path,
        label: result.label || result.path.split('/').pop()
      }))
    : baseContextItems;
  
  if (index < 0 || index >= items.length) return;
  
  const selectedItem = items[index];
  
  // Insert the selected item as a mention
  if (messageInput) {
    // Use value if available, otherwise use type as fallback
    const mentionValue = selectedItem.value || selectedItem.type;
    
    const { newValue, mentionIndex } = insertMention(
      messageInput.value,
      cursorPosition,
      mentionValue
    );

    // Update the input value
    messageInput.value = newValue;
    
    // Update cursor position
    const newPosition = mentionIndex + mentionValue.length + 2; // +2 for the @ and the space after
    messageInput.setSelectionRange(newPosition, newPosition);
    messageInput.focus();
    
    // Update highlights
    updateHighlights();
    
    // Auto-resize textarea to fit new content
    autoResizeTextarea();
    
    // Hide context menu
    contextMenuVisible = false;
    renderContextMenu();
  }
}

// Handle input changes to show/hide context menu
function handleInputChange() {
  cursorPosition = messageInput.selectionStart;
  const inputValue = messageInput.value;
  
  // Check if context menu should be shown
  const showMenu = shouldShowContextMenu(inputValue, cursorPosition);
  
  // Update context menu visibility
  if (showMenu !== contextMenuVisible) {
    contextMenuVisible = showMenu;
    contextMenuSelectedIndex = contextMenuVisible ? 0 : -1;
  }
  
  // If showing context menu, update search query
  if (contextMenuVisible) {
    const beforeCursor = inputValue.slice(0, cursorPosition);
    const atIndex = beforeCursor.lastIndexOf('@');
    searchQuery = beforeCursor.slice(atIndex + 1);
  } else {
    searchQuery = '';
  }
  
  // Update the highlight layer
  updateHighlights();
  
  // Render context menu
  renderContextMenu();
}

// Function to handle context button click
function handleContextButtonClick() {
  // Focus the textarea first
  messageInput.focus();
  
  // If input is empty, just insert @
  if (!messageInput.value.trim()) {
    messageInput.value = '@';
    messageInput.setSelectionRange(1, 1);
    handleInputChange();
    return;
  }
  
  // If input ends with space or is empty, just append @
  if (messageInput.value.endsWith(' ')) {
    messageInput.value += '@';
    messageInput.setSelectionRange(messageInput.value.length, messageInput.value.length);
    handleInputChange();
    return;
  }
  
  // Otherwise add space then @
  messageInput.value += ' @';
  messageInput.setSelectionRange(messageInput.value.length, messageInput.value.length);
  handleInputChange();
}

function sendMessage() {
  const text = messageInput.value.trim();
  if (text === '' || isWaitingForResponse) return;
  
  // Add user message to UI
  addMessage('user', text);
  
  // Clear input and set loading state
  messageInput.value = '';
  messageInput.style.height = 'auto';
  
  // Update highlights
  updateHighlights();
  
  // Hide context menu if visible
  if (contextMenuVisible) {
    contextMenuVisible = false;
    renderContextMenu();
  }
  
  // Send message to extension
  vscode.postMessage({
    command: 'sendMessage',
    text
  });
}

function resetConversation() {
  // Ask for confirmation before resetting
  const confirmation = confirm('Are you sure you want to reset the conversation? This will clear the current context and start fresh.');
  
  if (confirmation) {
    vscode.postMessage({
      command: 'resetConversation'
    });
  }
}

function handleConversationReset() {
  // Clear all messages
  messagesContainer.innerHTML = '';
  
  // Reset local messages
  localMessages = [{
    role: 'assistant',
    content: 'Conversation has been reset. How can I help you today?',
    timestamp: new Date().toISOString()
  }];
  
  // Update webview state
  vscode.setState({ 
    messages: localMessages,
    status: 'ready'
  });
  
  // Add system message about reset
  addMessage('assistant', 'Conversation has been reset. How can I help you today?');
}

function handleStatusUpdate(status) {
  switch (status) {
    case 'thinking':
      isWaitingForResponse = true;
      sendButton.disabled = true;
      removeLoadingIndicator(); // Remove any existing indicators first
      addLoadingIndicator();
      break;
    case 'ready':
      isWaitingForResponse = false;
      sendButton.disabled = false;
      removeLoadingIndicator();
      break;
    case 'error':
      isWaitingForResponse = false;
      sendButton.disabled = false;
      removeLoadingIndicator();
      break;
    case 'restarting':
      isWaitingForResponse = true;
      sendButton.disabled = true;
      removeLoadingIndicator();
      addLoadingIndicator();
      break;
  }
}

function addMessage(role, content) {
  // Create message group
  const messageGroup = document.createElement('div');
  messageGroup.classList.add('message-group');
  
  // Create sender element with avatar
  const senderElement = document.createElement('div');
  senderElement.classList.add('message-sender');
  if (role === 'assistant') {
    senderElement.classList.add('claude');
  }
  
  // Add avatar
  const avatar = document.createElement('div');
  avatar.classList.add('avatar');
  if (role === 'assistant') {
    avatar.classList.add('claude');
    
    // Use Claude's flower icon in the avatar
    avatar.innerHTML = `
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clip-path="url(#clip0_115_4)">
      <path d="M5.88625 19.9437L11.7862 16.635L11.8862 16.3475L11.7862 16.1875H11.5L10.5125 16.1275L7.14 16.0363L4.21625 15.915L1.38375 15.7625L0.67 15.6113L0 14.73L0.06875 14.29L0.66875 13.8888L1.52625 13.9637L3.42625 14.0925L6.27375 14.29L8.33875 14.4113L11.4 14.73H11.8862L11.955 14.5337L11.7875 14.4113L11.6587 14.29L8.71125 12.295L5.52125 10.185L3.85125 8.97L2.94625 8.35625L2.49125 7.77875L2.29375 6.51875L3.11375 5.61625L4.215 5.69125L4.49625 5.7675L5.6125 6.625L7.9975 8.47L11.1112 10.7613L11.5675 11.1413L11.7488 11.0125L11.7725 10.9213L11.5675 10.5788L9.87375 7.52125L8.06625 4.40875L7.26125 3.11875L7.04875 2.345C6.96778 2.04782 6.92411 1.74172 6.91875 1.43375L7.85375 0.1675L8.37 0L9.615 0.1675L10.14 0.6225L10.915 2.39L12.1675 5.17625L14.1112 8.96375L14.6812 10.0863L14.985 11.1263L15.0988 11.445H15.2963V11.2625L15.4562 9.13L15.7525 6.51125L16.04 3.1425L16.14 2.1925L16.61 1.055L17.5437 0.44L18.2738 0.79L18.8737 1.64625L18.79 2.20125L18.4325 4.515L17.7338 8.14375L17.2787 10.5712H17.5437L17.8475 10.2688L19.0787 8.63625L21.1438 6.05625L22.0563 5.03125L23.1188 3.90125L23.8025 3.3625H25.0938L26.0437 4.77375L25.6188 6.23125L24.2887 7.915L23.1875 9.3425L21.6075 11.4675L20.62 13.1675L20.7113 13.305L20.9462 13.28L24.5163 12.5225L26.445 12.1725L28.7462 11.7788L29.7875 12.2637L29.9012 12.7575L29.4913 13.7662L27.03 14.3737L24.1438 14.9513L19.845 15.9675L19.7925 16.005L19.8538 16.0812L21.79 16.2637L22.6175 16.3087H24.645L28.42 16.59L29.4075 17.2425L30 18.04L29.9012 18.6462L28.3825 19.4212L26.3325 18.935L21.5462 17.7975L19.9063 17.3863H19.6788V17.5238L21.045 18.8587L23.5525 21.1212L26.6887 24.0337L26.8475 24.7563L26.445 25.325L26.02 25.2638L23.2638 23.1925L22.2 22.2587L19.7925 20.2338H19.6325V20.4463L20.1875 21.2575L23.1188 25.6588L23.2713 27.0088L23.0588 27.45L22.2988 27.7163L21.4637 27.5638L19.7462 25.1575L17.9775 22.4487L16.5488 20.02L16.3737 20.12L15.5313 29.1875L15.1363 29.65L14.225 30L13.4662 29.4237L13.0638 28.49L13.4662 26.645L13.9525 24.24L14.3463 22.3275L14.7037 19.9525L14.9162 19.1625L14.9012 19.11L14.7263 19.1325L12.9338 21.5913L10.2087 25.2725L8.05125 27.5787L7.53375 27.7837L6.6375 27.3213L6.72125 26.4937L7.2225 25.7575L10.2075 21.9625L12.0075 19.61L13.17 18.2525L13.1625 18.055H13.0938L5.165 23.2L3.7525 23.3825L3.14375 22.8125L3.22 21.88L3.50875 21.5762L5.89375 19.9363L5.88625 19.9437Z" fill="#D97757"/>
      </g>
      <defs>
      <clipPath id="clip0_115_4">
      <rect width="30" height="30" fill="white"/>
      </clipPath>
      </defs>
      </svg>
    `;
  } else {
    avatar.classList.add('user');
    avatar.textContent = 'Y';
  }
  senderElement.appendChild(avatar);
  
  // Add sender name
  const senderName = document.createElement('span');
  senderName.textContent = role === 'assistant' ? 'Claude' : 'You';
  senderElement.appendChild(senderName);
  
  messageGroup.appendChild(senderElement);
  
  // Create message element
  const messageEl = document.createElement('div');
  messageEl.classList.add('message', role);
  
  // Process text with enhanced formatting
  const formattedText = formatMessageText(content);
  messageEl.innerHTML = formattedText;
  
  messageGroup.appendChild(messageEl);
  
  // Add message actions (only for Claude messages)
  if (role === 'assistant') {
    const actionsContainer = document.createElement('div');
    actionsContainer.classList.add('message-actions');
    
    // Copy button
    const copyButton = document.createElement('button');
    copyButton.classList.add('action-button');
    copyButton.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z" fill="currentColor"/>
      </svg>
      Copy
    `;
    copyButton.setAttribute('data-tooltip', 'Copy message');
    copyButton.classList.add('tooltip');
    copyButton.addEventListener('click', () => copyMessageText(content));
    actionsContainer.appendChild(copyButton);
    
    // Copy code button (only if there's code in the message)
    if (content.includes('```')) {
      const copyCodeButton = document.createElement('button');
      copyCodeButton.classList.add('action-button');
      copyCodeButton.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9.4 16.6L4.8 12L9.4 7.4L8 6L2 12L8 18L9.4 16.6ZM14.6 16.6L19.2 12L14.6 7.4L16 6L22 12L16 18L14.6 16.6Z" fill="currentColor"/>
        </svg>
        Copy Code
      `;
      copyCodeButton.setAttribute('data-tooltip', 'Copy only code blocks');
      copyCodeButton.classList.add('tooltip');
      copyCodeButton.addEventListener('click', () => copyCodeFromMessage(content));
      actionsContainer.appendChild(copyCodeButton);
    }
    
    messageGroup.appendChild(actionsContainer);
  }
  
  messagesContainer.appendChild(messageGroup);
  
  // Scroll to bottom
  scrollToBottom();
}

function formatMessageText(text) {
  // Handle basic markdown
  let formatted = text
    // Handle code blocks with syntax highlighting
    .replace(/```([a-z]*)\n([\s\S]*?)```/g, (match, language, code) => {
      // Determine language class if provided
      const langClass = language ? ` class="language-${language}"` : '';
      return `<pre><code${langClass}>${escapeHtml(code)}</code></pre>`;
    })
    
    // Handle inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    
    // Handle bold text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    
    // Handle italic text
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    
    // Handle links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    
    // Handle headings (h1, h2, h3)
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>');
  
  // Handle paragraphs (split by double newlines)
  const paragraphs = formatted.split(/\n\n+/g);
  
  // Process each paragraph (but preserve code blocks)
  const processedParagraphs = paragraphs.map(paragraph => {
    // Skip processing for code blocks
    if (paragraph.startsWith('<pre>') && paragraph.endsWith('</pre>')) {
      return paragraph;
    }
    
    // Handle lists
    if (/^[*-] /.test(paragraph)) {
      const listItems = paragraph.split(/\n[*-] /);
      const firstItem = listItems.shift();
      return '<ul><li>' + firstItem.replace(/^[*-] /, '') + '</li><li>' + 
        listItems.join('</li><li>') + '</li></ul>';
    }
    
    // Handle numbered lists
    if (/^\d+\. /.test(paragraph)) {
      const listItems = paragraph.split(/\n\d+\. /);
      const firstItem = listItems.shift();
      return '<ol><li>' + firstItem.replace(/^\d+\. /, '') + '</li><li>' + 
        listItems.join('</li><li>') + '</li></ol>';
    }
    
    // Handle regular paragraphs with single line breaks converted to <br>
    if (!paragraph.startsWith('<h') && !paragraph.startsWith('<ul') && !paragraph.startsWith('<ol')) {
      return '<p>' + paragraph.replace(/\n/g, '<br>') + '</p>';
    }
    
    return paragraph;
  });
  
  return processedParagraphs.join('\n');
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function addLoadingIndicator() {
  const loadingEl = document.createElement('div');
  loadingEl.classList.add('loading');
  loadingEl.id = 'loadingIndicator';
  
  // Add Claude flower spinner animation
  const flowerSpinner = document.createElement('div');
  flowerSpinner.classList.add('claude-flower-spinner');
  flowerSpinner.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L14.2451 9.75492H22L15.8774 14.4896L18.1226 22.2451L12 17.5104L5.87745 22.2451L8.12255 14.4896L2 9.75492H9.75492L12 2Z" fill="#5A32FB"/>
    </svg>
  `;
  
  loadingEl.appendChild(flowerSpinner);
  messagesContainer.appendChild(loadingEl);
  
  // Scroll to bottom
  scrollToBottom();
}

function removeLoadingIndicator() {
  const loadingEl = document.getElementById('loadingIndicator');
  if (loadingEl) {
    loadingEl.remove();
  }
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
  
  // Ensure minimum height of 48px
  if (parseInt(messageInput.style.height) < 48) {
    messageInput.style.height = '48px';
  }
}

function copyMessageText(content) {
  navigator.clipboard.writeText(content)
    .then(() => showNotification('Message copied to clipboard'))
    .catch(err => console.error('Failed to copy: ', err));
}

function copyCodeFromMessage(content) {
  // Extract code blocks from the message
  const codeRegex = /```(?:[a-z]*\n)?([\s\S]*?)```/g;
  let codeBlocks = [];
  let match;
  
  while ((match = codeRegex.exec(content)) !== null) {
    codeBlocks.push(match[1]);
  }
  
  if (codeBlocks.length > 0) {
    // If multiple code blocks, join them with newlines
    const code = codeBlocks.join('\n\n');
    navigator.clipboard.writeText(code)
      .then(() => showNotification('Code copied to clipboard'))
      .catch(err => console.error('Failed to copy code: ', err));
  }
}

function showNotification(message) {
  // Create notification element
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.left = '50%';
  notification.style.transform = 'translateX(-50%)';
  notification.style.backgroundColor = 'var(--vscode-notificationToast-background, #252526)';
  notification.style.color = 'var(--vscode-notificationToast-foreground, #cccccc)';
  notification.style.padding = '8px 16px';
  notification.style.borderRadius = '4px';
  notification.style.zIndex = '1000';
  notification.style.opacity = '0';
  notification.style.transition = 'opacity 0.3s ease';
  
  // Add to body
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.style.opacity = '1';
  }, 10);
  
  // Remove after delay
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 2000);
}