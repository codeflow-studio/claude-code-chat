// @ts-check

(function () {
  // Get VS Code API
  const vscode = acquireVsCodeApi();
  
  const messageInputElement = document.getElementById('messageInput');
  const sendButtonElement = document.getElementById('sendButton');
  const terminalStatusBanner = document.getElementById('terminalStatusBanner');
  
  // Function to handle sending a message
  function sendMessage() {
    const text = messageInputElement.value.trim();
    if (!text) {
      return;
    }
    
    // Send the message to the extension
    vscode.postMessage({
      command: 'sendToTerminal',
      text: text
    });
    
    // Clear input after sending
    messageInputElement.value = '';
    messageInputElement.focus();
  }
  
  // Event listener for send button
  if (sendButtonElement) {
    sendButtonElement.addEventListener('click', () => {
      sendMessage();
    });
  }
  
  // Event listener for Enter key in the input field
  if (messageInputElement) {
    messageInputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    
    // Auto-resize textarea as content grows
    messageInputElement.addEventListener('input', () => {
      // Reset height to auto to get the correct scrollHeight
      messageInputElement.style.height = 'auto';
      // Set the height to scrollHeight + border
      messageInputElement.style.height = (messageInputElement.scrollHeight) + 'px';
    });
    
    // Initial focus
    messageInputElement.focus();
  }
  
  // Listen for messages from the extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    
    switch (message.command) {
      case 'terminalStatus':
        // Update terminal status banner visibility
        if (terminalStatusBanner) {
          if (message.isTerminalClosed) {
            terminalStatusBanner.classList.remove('hidden');
          } else {
            terminalStatusBanner.classList.add('hidden');
          }
        }
        break;
    }
  });
  
  // Initialize the UI
  function init() {
    // Set initial height for textarea
    if (messageInputElement) {
      messageInputElement.style.height = 'auto';
      messageInputElement.style.height = (messageInputElement.scrollHeight) + 'px';
    }
  }
  
  // Run initialization
  init();
})();