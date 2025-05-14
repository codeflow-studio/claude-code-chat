// Get VS Code API
const vscode = acquireVsCodeApi();

// Elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');

// State
let isWaitingForResponse = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Add welcome message
  addMessage('claude', 'Hello! I\'m Claude Code. How can I help you with your coding tasks today?');
  
  // Focus the input
  messageInput.focus();
  
  // Auto-resize textarea
  messageInput.addEventListener('input', autoResizeTextarea);
});

// Event listeners
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Handle messages from extension
window.addEventListener('message', (event) => {
  const message = event.data;
  
  switch (message.command) {
    case 'receiveMessage':
      isWaitingForResponse = false;
      sendButton.disabled = false;
      removeLoadingIndicator();
      addMessage(message.sender, message.text);
      break;
    case 'updateStatus':
      // Handle status updates
      break;
  }
});

// Functions
function sendMessage() {
  const text = messageInput.value.trim();
  if (text === '' || isWaitingForResponse) return;
  
  // Add user message to UI
  addMessage('user', text);
  
  // Clear input and set loading state
  messageInput.value = '';
  messageInput.style.height = 'auto';
  isWaitingForResponse = true;
  sendButton.disabled = true;
  addLoadingIndicator();
  
  // Send message to extension
  vscode.postMessage({
    command: 'sendMessage',
    text
  });
}

function addMessage(sender, text) {
  // Create message group
  const messageGroup = document.createElement('div');
  messageGroup.classList.add('message-group');
  
  // Create sender element with avatar
  const senderElement = document.createElement('div');
  senderElement.classList.add('message-sender');
  if (sender === 'claude') {
    senderElement.classList.add('claude');
  }
  
  // Add avatar
  const avatar = document.createElement('div');
  avatar.classList.add('avatar');
  if (sender === 'claude') {
    avatar.classList.add('claude');
    
    // Use Claude's flower icon in the avatar
    avatar.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L14.2451 9.75492H22L15.8774 14.4896L18.1226 22.2451L12 17.5104L5.87745 22.2451L8.12255 14.4896L2 9.75492H9.75492L12 2Z" fill="currentColor"/>
      </svg>
    `;
  } else {
    avatar.classList.add('user');
    avatar.textContent = 'Y';
  }
  senderElement.appendChild(avatar);
  
  // Add sender name
  const senderName = document.createElement('span');
  senderName.textContent = sender === 'claude' ? 'Claude' : 'You';
  senderElement.appendChild(senderName);
  
  messageGroup.appendChild(senderElement);
  
  // Create message element
  const messageEl = document.createElement('div');
  messageEl.classList.add('message', sender);
  
  // Process text with enhanced formatting
  const formattedText = formatMessageText(text);
  messageEl.innerHTML = formattedText;
  
  messageGroup.appendChild(messageEl);
  
  // Add message actions (only for Claude messages)
  if (sender === 'claude') {
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
    copyButton.addEventListener('click', () => copyMessageText(text));
    actionsContainer.appendChild(copyButton);
    
    // Copy code button (only if there's code in the message)
    if (text.includes('```')) {
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
      copyCodeButton.addEventListener('click', () => copyCodeFromMessage(text));
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
}

function copyMessageText(text) {
  navigator.clipboard.writeText(text)
    .then(() => showNotification('Message copied to clipboard'))
    .catch(err => console.error('Failed to copy: ', err));
}

function copyCodeFromMessage(text) {
  // Extract code blocks from the message
  const codeRegex = /```(?:[a-z]*\n)?([\s\S]*?)```/g;
  let codeBlocks = [];
  let match;
  
  while ((match = codeRegex.exec(text)) !== null) {
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