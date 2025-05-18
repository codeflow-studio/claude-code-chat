// @ts-check

(function () {
  // Get VS Code API
  const vscode = acquireVsCodeApi();
  
  // Elements
  const messageInputElement = document.getElementById('messageInput');
  const sendButtonElement = document.getElementById('sendButton');
  const contextButtonElement = document.getElementById('contextButton');
  const terminalStatusBanner = document.getElementById('terminalStatusBanner');
  const highlightLayerElement = document.getElementById('highlightLayer');
  const contextMenuContainer = document.getElementById('contextMenuContainer');
  
  // RegExp for detecting @ mentions
  const mentionRegex = /@((?:\/|\w+:\/\/)[^\s]+?|[a-f0-9]{7,40}\b|problems\b|terminal\b|git-changes\b)(?=[.,;:!?]?(?=[\s\r\n]|$))/;
  const mentionRegexGlobal = new RegExp(mentionRegex.source, 'g');
  
  // Context menu state
  let contextMenuVisible = false;
  let contextMenuSelectedIndex = -1;
  let searchQuery = '';
  let searchResults = [];
  let cursorPosition = 0;
  let currentFilePaths = [];
  let isSearchLoading = false;
  let justDeletedSpaceAfterMention = false;
  
  // Base context menu items
  const baseContextItems = [
    { type: 'problems', label: 'Problems', description: 'Workspace problems' },
    { type: 'terminal', label: 'Terminal', description: 'Terminal output' }
  ];

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
    updateHighlights();
  }
  
  // Function to update highlights in the text area
  function updateHighlights() {
    if (!highlightLayerElement || !messageInputElement) return;

    let processedText = messageInputElement.value;

    // Replace special characters with HTML entities for safety
    processedText = processedText
      .replace(/\n$/, '\n\n')
      .replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] || c)
      // Highlight @mentions
      .replace(mentionRegexGlobal, '<mark class="mention-highlight">$&</mark>');

    highlightLayerElement.innerHTML = processedText;
    // Match scroll position
    highlightLayerElement.scrollTop = messageInputElement.scrollTop;
    highlightLayerElement.scrollLeft = messageInputElement.scrollLeft;
  }

  // Function to check if context menu should be shown
  function shouldShowContextMenu(text, position) {
    const beforeCursor = text.slice(0, position);
    const atIndex = beforeCursor.lastIndexOf('@');
    
    // If there's no @ symbol, don't show the menu
    if (atIndex === -1) {
      return false;
    }

    // Check if there's whitespace between the @ and the cursor
    // If there is, and it's not right after the @, we don't show the menu
    const textAfterAt = beforeCursor.substring(atIndex + 1);
    const hasSpace = /\s/.test(textAfterAt);
    
    // Only show the menu if we're typing directly after the @ symbol
    // or if we're typing a continuous string without spaces
    if (hasSpace && textAfterAt.length > 0) {
      return false;
    }
    
    return true;
  }

  // Function to render the context menu
  function renderContextMenu() {
    // First, remove any existing global context menu
    const existingMenu = document.getElementById('global-context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
    
    // If we shouldn't show the menu, just return
    if (!contextMenuVisible) {
      return;
    }
    
    // Create a new context menu element
    const globalContextMenu = document.createElement('div');
    globalContextMenu.id = 'global-context-menu';
    globalContextMenu.className = 'context-menu-container';
    
    // Get input position for menu placement
    const input = document.getElementById('messageInput');
    const inputRect = input.getBoundingClientRect();
    
    // Set styles to ensure visibility
    globalContextMenu.style.position = 'fixed';
    globalContextMenu.style.zIndex = '999999';
    globalContextMenu.style.backgroundColor = 'var(--vscode-dropdown-background, #252526)';
    globalContextMenu.style.border = '1px solid var(--vscode-focusBorder, #5A32FB)';
    globalContextMenu.style.borderRadius = '6px';
    globalContextMenu.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
    globalContextMenu.style.overflow = 'auto';
    globalContextMenu.style.maxHeight = '300px';
    globalContextMenu.style.width = 'auto';
    globalContextMenu.style.minWidth = '300px';
    globalContextMenu.style.maxWidth = '500px';
    
    // Position near the cursor in the input field
    // Find the @ symbol and position menu below it
    const atSymbolIndex = input.value.lastIndexOf('@', input.selectionStart);
    if (atSymbolIndex !== -1) {
      // Calculate the position of the @ symbol
      // We need to measure the text up to the @ symbol to get its position
      const textBeforeAt = input.value.substring(0, atSymbolIndex);
      const tempSpan = document.createElement('span');
      tempSpan.style.position = 'absolute';
      tempSpan.style.visibility = 'hidden';
      tempSpan.style.whiteSpace = 'pre';
      tempSpan.style.font = window.getComputedStyle(input).font;
      tempSpan.textContent = textBeforeAt;
      document.body.appendChild(tempSpan);
      
      // Calculate position based on the @ symbol
      const atPos = tempSpan.getBoundingClientRect().width;
      document.body.removeChild(tempSpan);
      
      // Position the menu below the @ symbol
      const lineHeight = parseInt(window.getComputedStyle(input).lineHeight);
      globalContextMenu.style.top = `${inputRect.top + lineHeight + window.scrollY}px`;
      globalContextMenu.style.left = `${inputRect.left + atPos + window.scrollX}px`;
    } else {
      // Fallback positioning
      globalContextMenu.style.top = `${inputRect.bottom + window.scrollY + 5}px`;
      globalContextMenu.style.left = `${inputRect.left + window.scrollX}px`;
    }
    
    // Append to body
    document.body.appendChild(globalContextMenu);
    
    // Start with base items, add search results if available
    let menuItems = baseContextItems;
    
    // Add search results if available
    if (Array.isArray(searchResults) && searchResults.length > 0) {
      menuItems = searchResults.map(result => ({
        type: result.type,
        value: result.path,
        label: result.label || result.path.split('/').pop()
      }));
    }
        
    // Create menu items HTML
    const itemsHtml = menuItems.map((item, index) => {
      const isSelected = index === contextMenuSelectedIndex;
      
      // Determine icon based on item type
      let icon = 'file';
      if (item.type === 'folder') {
        icon = 'folder';
      } else if (item.type === 'git') {
        icon = 'git-commit';
      } else if (item.type === 'problems') {
        icon = 'warning';
      } else if (item.type === 'terminal') {
        icon = 'terminal';
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
        // For items without a value like "Problems" or "Terminal"
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
    }).join('');
    
    // If no items, show a message
    let finalContent = itemsHtml;
    if (itemsHtml.length === 0) {
      finalContent = `
        <div class="context-menu-item not-selectable">
          <div class="context-menu-item-content">
            <span class="codicon codicon-info"></span>
            <div class="context-menu-text">No results found</div>
          </div>
        </div>
      `;
    }
    
    // Add loading indicator if searching
    if (isSearchLoading) {
      finalContent = `
        <div class="context-menu-item loading">
          <div class="loading-spinner"></div>
          <span>Searching...</span>
        </div>
      ` + finalContent;
    }
    
    // Create the final menu HTML
    const menuHTML = `
      <div class="context-menu">
        ${finalContent}
      </div>
    `;
    
    // Set the HTML content of the global menu
    globalMenu.innerHTML = menuHTML;
    
    // Add click event listeners to menu items
    const menuItemElements = globalMenu.querySelectorAll('.context-menu-item:not(.not-selectable):not(.loading)');
    menuItemElements.forEach((item, index) => {
      item.addEventListener('click', () => handleContextMenuSelect(index));
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
    if (messageInputElement) {
      const { newValue, mentionIndex } = insertMention(
        messageInputElement.value,
        cursorPosition,
        selectedItem.value
      );

      // Update the input value
      messageInputElement.value = newValue;
      
      // Update cursor position
      const newPosition = mentionIndex + selectedItem.value.length + 2; // +2 for the @ and the space after
      messageInputElement.setSelectionRange(newPosition, newPosition);
      messageInputElement.focus();
      
      // Update highlights
      updateHighlights();
      
      // Hide context menu
      contextMenuVisible = false;
      renderContextMenu();
    }
  }

  // Create a debounced search function
  const debounce = (fn, delay) => {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fn(...args);
      }, delay);
    };
  };

  // Search for files with debouncing
  const searchFilesDebounced = debounce((query, requestId) => {
    if (!query || query.length < 1) return;
    
    // Set loading state
    isSearchLoading = true;
    renderContextMenu();
    
    // Check if query looks like a git commit reference
    if (/^[a-f0-9]{7,40}$/i.test(query)) {
      // Send git commit search request
      vscode.postMessage({
        command: 'searchCommits',
        query: query,
        mentionsRequestId: requestId
      });
    } else {
      // Send file search request
      vscode.postMessage({
        command: 'searchFiles',
        query: query,
        mentionsRequestId: requestId
      });
    }
  }, 250);

  // Handle input changes to show/hide context menu
  function handleInputChange() {
    cursorPosition = messageInputElement.selectionStart;
    const inputValue = messageInputElement.value;
    
    // Debug the input and cursor position
    console.log("Input value:", inputValue, "Position:", cursorPosition);
    
    // Always show menu if we detect an @ character
    const beforeCursor = inputValue.slice(0, cursorPosition);
    const atIndex = beforeCursor.lastIndexOf('@');
    const hasAtSymbol = atIndex !== -1;
    
    // Check if there's text after the @ that would disqualify showing the menu
    const showMenu = hasAtSymbol && shouldShowContextMenu(inputValue, cursorPosition);
    
    console.log("Show menu:", showMenu, "Has @ symbol:", hasAtSymbol, "At index:", atIndex);
    
    // Update context menu visibility
    if (showMenu !== contextMenuVisible) {
      contextMenuVisible = showMenu;
      contextMenuSelectedIndex = contextMenuVisible ? 0 : -1;
      console.log("Context menu visibility changed to:", contextMenuVisible);
    }
    
    // If showing context menu, update search query and trigger search
    if (contextMenuVisible) {
      const newSearchQuery = beforeCursor.slice(atIndex + 1);
      console.log("Search query:", newSearchQuery);
      
      // Show default items immediately regardless of query
      if (newSearchQuery.length === 0) {
        searchResults = [];
        searchQuery = '';
      } 
      // Only trigger search if query changed and is not empty
      else if (newSearchQuery !== searchQuery) {
        searchQuery = newSearchQuery;
        const requestId = `search-${Date.now()}`;
        currentSearchRequestId = requestId;
        
        if (newSearchQuery.length > 0) {
          searchFilesDebounced(searchQuery, requestId);
        }
      }
    } else {
      searchQuery = '';
    }
    
    // Update the highlight layer
    updateHighlights();
    
    // Render context menu
    renderContextMenu();
  }

  // Function to handle key navigation in context menu
  function handleKeyDown(e) {
    if (contextMenuVisible) {
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
  }
  
  // Function to handle context button click
  function handleContextButtonClick() {
    // Focus the textarea first
    messageInputElement.focus();
    
    // If input is empty, just insert @
    if (!messageInputElement.value.trim()) {
      messageInputElement.value = '@';
      messageInputElement.setSelectionRange(1, 1);
      handleInputChange();
      return;
    }
    
    // If input ends with space or is empty, just append @
    if (messageInputElement.value.endsWith(' ')) {
      messageInputElement.value += '@';
      messageInputElement.setSelectionRange(messageInputElement.value.length, messageInputElement.value.length);
      handleInputChange();
      return;
    }
    
    // Otherwise add space then @
    messageInputElement.value += ' @';
    messageInputElement.setSelectionRange(messageInputElement.value.length, messageInputElement.value.length);
    handleInputChange();
  }
  
  // Event listener for send button
  if (sendButtonElement) {
    sendButtonElement.addEventListener('click', () => {
      sendMessage();
    });
  }
  
  // Event listener for context button
  if (contextButtonElement) {
    contextButtonElement.addEventListener('click', handleContextButtonClick);
  }
  
  // Event listeners for input field
  if (messageInputElement) {
    // Listen for key presses
    messageInputElement.addEventListener('keydown', handleKeyDown);
    
    // Listen for input changes to show/hide context menu
    messageInputElement.addEventListener('input', handleInputChange);
    
    // Listen for click/selection changes
    messageInputElement.addEventListener('click', handleInputChange);
    messageInputElement.addEventListener('select', handleInputChange);
    
    // Auto-resize textarea as content grows
    messageInputElement.addEventListener('input', () => {
      // Reset height to auto to get the correct scrollHeight
      messageInputElement.style.height = 'auto';
      // Set the height to scrollHeight + border
      messageInputElement.style.height = (messageInputElement.scrollHeight) + 'px';
      
      // Update highlight layer size and scroll position
      updateHighlights();
    });
    
    // Handle scrolling in the textarea
    messageInputElement.addEventListener('scroll', () => {
      if (highlightLayerElement) {
        highlightLayerElement.scrollTop = messageInputElement.scrollTop;
        highlightLayerElement.scrollLeft = messageInputElement.scrollLeft;
      }
    });
    
    // Initial focus
    messageInputElement.focus();
  }
  
  // Variable to keep track of current search query
  let currentSearchRequestId = '';

  // Listen for messages from the extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    
    switch (message.command || message.type) {
      case 'terminalStatus':
        // Update terminal status banner visibility
        if (terminalStatusBanner) {
          const wasHidden = terminalStatusBanner.classList.contains('hidden');
          
          if (message.isTerminalClosed) {
            terminalStatusBanner.classList.remove('hidden');
            // If the banner was previously hidden and is now shown, adjust the container
            if (wasHidden) {
              // Allow layout to adjust by forcing a reflow
              document.querySelector('.chat-container').style.maxHeight = '280px';
            }
          } else {
            terminalStatusBanner.classList.add('hidden');
            // If the banner was previously shown and is now hidden, restore original size
            if (!wasHidden) {
              document.querySelector('.chat-container').style.maxHeight = '250px';
            }
          }
          
          // Ensure input height is correct
          if (messageInputElement) {
            messageInputElement.style.height = 'auto';
            messageInputElement.style.height = (messageInputElement.scrollHeight) + 'px';
          }
        }
        break;
        
      case 'fileSearchResults':
        // Only update results if they match the current query or if there's no mentionsRequestId - better UX
        if (!message.mentionsRequestId || message.mentionsRequestId === currentSearchRequestId) {
          // Handle file search results from extension
          searchResults = message.results || [];
          isSearchLoading = false;
          
          // Reset the selected index when new results come in
          if (searchResults.length > 0) {
            contextMenuSelectedIndex = 0;
          }
          
          // Update the context menu
          renderContextMenu();
        }
        break;
        
      case 'commitSearchResults':
        // Handle commit search results from extension
        const commits = message.commits || [];
        searchResults = commits.map(commit => ({
          type: 'git',
          path: commit.hash,
          label: commit.subject,
          description: `${commit.shortHash} by ${commit.author} on ${commit.date}`
        }));
        isSearchLoading = false;
        
        // Reset the selected index when new results come in
        if (searchResults.length > 0) {
          contextMenuSelectedIndex = 0;
        }
        
        // Update the context menu
        renderContextMenu();
        break;
    }
  });
  
  // Click event listener for document to close context menu when clicking outside
  document.addEventListener('click', (e) => {
    // Check if click is outside the context menu and input
    const isClickOutside = 
      !contextMenuContainer?.contains(e.target) && 
      !messageInputElement?.contains(e.target) &&
      e.target !== contextButtonElement;
      
    if (isClickOutside && contextMenuVisible) {
      contextMenuVisible = false;
      renderContextMenu();
    }
  });
  
  // Initialize the UI
  function init() {
    console.log("Initializing terminal input UI");
    
    // Log element references for debugging
    console.log("Context menu container:", contextMenuContainer);
    console.log("Message input:", messageInputElement);
    console.log("Context button:", contextButtonElement);
    console.log("Highlight layer:", highlightLayerElement);
    
    // Set initial height for textarea
    if (messageInputElement) {
      messageInputElement.style.height = 'auto';
      messageInputElement.style.height = (messageInputElement.scrollHeight) + 'px';
    }
    
    // Set container height based on terminal status
    if (terminalStatusBanner && !terminalStatusBanner.classList.contains('hidden')) {
      // If banner is visible, ensure container has enough height
      document.querySelector('.chat-container').style.maxHeight = '280px';
    }
    
    // Initialize highlight layer
    updateHighlights();
  }
  
  // Run initialization
  init();
  
  // Removed debugging code that forced the context menu to show after a delay
  // The renderContextMenu function is now updated to correctly show the menu
  // with proper positioning and z-index
})();