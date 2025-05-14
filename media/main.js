// @ts-check

(function() {
  // Get the VS Code API
  const vscode = acquireVsCodeApi();
  
  // DOM Elements
  const messageContainer = document.getElementById('messages');
  const messageInput = document.getElementById('messageInput');
  const sendButton = document.getElementById('sendButton');
  const clearButton = document.getElementById('clearButton');
  const newChatButton = document.getElementById('newChatButton');
  
  // Chat messages array
  let messages = [];
  
  // Initialize from state if available
  const state = vscode.getState();
  if (state && state.messages) {
    messages = state.messages;
    renderMessages();
  }
  
  // Event listeners
  sendButton.addEventListener('click', sendMessage);
  clearButton.addEventListener('click', clearMessages);
  newChatButton.addEventListener('click', startNewChat);
  
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // Process messages from extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    
    switch (message.type) {
      case 'addMessage':
        messages.push(message.message);
        renderMessages();
        saveState();
        break;
        
      case 'clearMessages':
        messages = [];
        renderMessages();
        saveState();
        break;
        
      case 'setLoading':
        setLoading(message.isLoading);
        break;
    }
  });
  
  /**
   * Sends the message from the input field
   */
  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) {
      return;
    }
    
    // Clear input
    messageInput.value = '';
    
    // Send to extension - let the extension add the message to UI
    vscode.postMessage({
      type: 'sendMessage',
      text
    });
    
    // Show loading indicator
    showLoading();
  }
  
  /**
   * Clears all messages
   */
  function clearMessages() {
    messages = [];
    renderMessages();
    saveState();
    
    vscode.postMessage({
      type: 'clearMessages'
    });
  }
  
  /**
   * Starts a new chat
   */
  function startNewChat() {
    clearMessages();
    
    vscode.postMessage({
      type: 'newChat'
    });
  }
  
  /**
   * Shows a loading indicator
   */
  function showLoading() {
    const loadingElement = document.createElement('div');
    loadingElement.className = 'loading';
    loadingElement.id = 'loading-indicator';
    
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    
    const text = document.createElement('span');
    text.textContent = 'Claude is thinking...';
    
    loadingElement.appendChild(spinner);
    loadingElement.appendChild(text);
    
    messageContainer.appendChild(loadingElement);
    messageContainer.scrollTop = messageContainer.scrollHeight;
  }
  
  /**
   * Sets the loading state
   */
  function setLoading(isLoading) {
    const loadingIndicator = document.getElementById('loading-indicator');
    
    if (isLoading) {
      if (!loadingIndicator) {
        showLoading();
      }
    } else {
      if (loadingIndicator) {
        loadingIndicator.remove();
      }
    }
  }
  
  /**
   * Renders all messages in the chat
   */
  function renderMessages() {
    // Clear container
    messageContainer.innerHTML = '';
    
    // Add each message
    messages.forEach((msg) => {
      const messageElement = document.createElement('div');
      messageElement.className = `message ${msg.sender}`;
      
      const header = document.createElement('div');
      header.className = 'message-header';
      
      const sender = document.createElement('span');
      sender.className = `message-sender ${msg.sender}`;
      sender.textContent = msg.sender === 'user' ? 'You' : 'Claude';
      
      const time = document.createElement('span');
      time.className = 'message-time';
      time.textContent = formatTimestamp(msg.timestamp);
      
      header.appendChild(sender);
      header.appendChild(time);
      
      const text = document.createElement('div');
      text.className = 'message-text';
      text.innerHTML = formatMessage(msg.text);
      
      messageElement.appendChild(header);
      messageElement.appendChild(text);
      
      messageContainer.appendChild(messageElement);
      
      // Add copy buttons to code blocks
      addCopyButtonsToCodeBlocks(messageElement);
      
      // Add apply buttons to suggestions
      if (msg.sender === 'claude') {
        addApplyButtonsToSuggestions(messageElement);
      }
    });
    
    // Scroll to bottom
    messageContainer.scrollTop = messageContainer.scrollHeight;
  }
  
  /**
   * Formats the message text with enhanced markdown
   * @param {string} text 
   */
  function formatMessage(text) {
    // Escape HTML
    text = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Format code blocks with syntax highlighting
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, language, code) {
      return `<div class="code-block-container">
        <div class="code-block-header">
          <span class="code-language">${language || 'plaintext'}</span>
        </div>
        <pre class="code-block"><code class="language-${language || 'plaintext'}">${code}</code></pre>
      </div>`;
    });
    
    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    
    // Headings
    text = text.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    
    // Bold
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Lists
    text = text.replace(/^\s*\d+\.\s+(.*$)/gm, '<li>$1</li>');
    text = text.replace(/^\s*[\-\*]\s+(.*$)/gm, '<li>$1</li>');
    
    // Wrap adjacent list items in ul/ol
    text = text.replace(/<li>.*?<\/li>(?:\s*\n\s*<li>.*?<\/li>)*/g, function(match) {
      return '<ul>' + match + '</ul>';
    });
    
    // Links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    
    // Line breaks
    text = text.replace(/\n/g, '<br>');
    
    return text;
  }
  
  /**
   * Adds copy buttons to code blocks
   * @param {HTMLElement} container 
   */
  function addCopyButtonsToCodeBlocks(container) {
    const codeBlocks = container.querySelectorAll('.code-block-container');
    
    codeBlocks.forEach((blockContainer) => {
      const codeBlock = blockContainer.querySelector('code');
      const header = blockContainer.querySelector('.code-block-header');
      
      if (codeBlock && header) {
        const copyButton = document.createElement('button');
        copyButton.className = 'code-block-copy';
        copyButton.textContent = 'Copy';
        copyButton.title = 'Copy code to clipboard';
        
        copyButton.addEventListener('click', () => {
          const code = codeBlock.textContent;
          navigator.clipboard.writeText(code).then(() => {
            // Show copied feedback
            copyButton.textContent = 'Copied!';
            setTimeout(() => {
              copyButton.textContent = 'Copy';
            }, 2000);
          });
        });
        
        header.appendChild(copyButton);
      }
    });
  }
  
  /**
   * Adds apply buttons to suggested code changes
   * @param {HTMLElement} container 
   */
  function addApplyButtonsToSuggestions(container) {
    // This is a placeholder for future implementation
    // In the MVP, we'll just handle the copy functionality
  }
  
  /**
   * Formats a timestamp
   * @param {number} timestamp 
   */
  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  /**
   * Saves the current state
   */
  function saveState() {
    vscode.setState({ messages });
  }
})();