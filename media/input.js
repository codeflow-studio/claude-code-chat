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
  
  // Slash command state
  let slashCommandVisible = false;
  let slashCommandSelectedIndex = -1;
  let slashCommandQuery = '';
  let slashCommands = [];
  
  // Base context menu items
  const baseContextItems = [
    { type: 'problems', value: 'problems', label: 'Problems', description: 'Workspace problems' },
    { type: 'terminal', value: 'terminal', label: 'Terminal', description: 'Terminal output' }
  ];
  
  // Slash commands
  const ALL_SLASH_COMMANDS = [
    { command: '/bug', description: 'Report bugs (sends conversation to Anthropic)', icon: '🐛' },
    { command: '/clear', description: 'Clear conversation history', icon: '🗑️' },
    { command: '/compact', description: 'Compact conversation with optional focus instructions', icon: '📦' },
    { command: '/config', description: 'View/modify configuration', icon: '⚙️' },
    { command: '/cost', description: 'Show token usage statistics', icon: '💰' },
    { command: '/doctor', description: 'Checks the health of your Claude Code installation', icon: '🏥' },
    { command: '/help', description: 'Get usage help', icon: '❓' },
    { command: '/init', description: 'Initialize project with CLAUDE.md guide', icon: '🚀' },
    { command: '/login', description: 'Switch Anthropic accounts', icon: '🔐' },
    { command: '/logout', description: 'Sign out from your Anthropic account', icon: '🚪' },
    { command: '/memory', description: 'Edit CLAUDE.md memory files', icon: '🧠' },
    { command: '/pr_comments', description: 'View pull request comments', icon: '💬' },
    { command: '/review', description: 'Request code review', icon: '👀' },
    { command: '/status', description: 'View account and system statuses', icon: '📊' },
    { command: '/terminal-setup', description: 'Install Shift+Enter key binding for newlines', icon: '⌨️' },
    { command: '/vim', description: 'Enter vim mode for alternating insert and command modes', icon: '📝' },
  ];

  // Function to filter slash commands based on query
  function filterSlashCommands(query) {
    const searchTerm = query.toLowerCase();
    return ALL_SLASH_COMMANDS.filter(cmd => 
      cmd.command.toLowerCase().includes(searchTerm) ||
      cmd.description.toLowerCase().includes(searchTerm)
    );
  }
  
  // Function to check if slash command menu should be shown
  function shouldShowSlashCommands(text, position) {
    // Check if text starts with "/" (at the beginning of input or after newline)
    const beforeCursor = text.slice(0, position);
    const lines = beforeCursor.split('\n');
    const currentLine = lines[lines.length - 1];
    
    // Only show if current line starts with "/" and no space before cursor
    if (currentLine.startsWith('/')) {
      const afterSlash = currentLine.substring(1, position - (beforeCursor.length - currentLine.length));
      // Don't show if there's a space after the slash
      if (afterSlash.includes(' ')) {
        return false;
      }
      return true;
    }
    
    return false;
  }

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

  // Function to render the slash command menu
  function renderSlashCommandMenu() {
    // First, remove any existing slash command menu
    const existingMenu = document.getElementById('global-slash-command-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
    
    // If we shouldn't show the menu, just return
    if (!slashCommandVisible) {
      return;
    }
    
    // Create a new slash command menu element
    const globalSlashMenu = document.createElement('div');
    globalSlashMenu.id = 'global-slash-command-menu';
    globalSlashMenu.className = 'slash-command-menu-container';
    
    // Get input wrapper position for menu placement
    const inputWrapper = document.querySelector('.input-wrapper');
    const inputRect = inputWrapper ? inputWrapper.getBoundingClientRect() : document.getElementById('messageInput').getBoundingClientRect();
    
    // Set styles to ensure visibility
    globalSlashMenu.style.position = 'fixed';
    globalSlashMenu.style.zIndex = '999999';
    globalSlashMenu.style.backgroundColor = 'var(--vscode-dropdown-background, #252526)';
    globalSlashMenu.style.border = '2px solid var(--vscode-focusBorder, #5A32FB)';
    globalSlashMenu.style.borderRadius = '16px';
    globalSlashMenu.style.boxShadow = '0 8px 16px rgba(0,0,0,0.5)';
    globalSlashMenu.style.overflow = 'hidden';
    globalSlashMenu.style.maxHeight = '300px';
    globalSlashMenu.style.minHeight = '40px';
    
    // Position the menu directly below the input field, aligned with its edges
    globalSlashMenu.style.width = `${inputRect.width}px`;
    globalSlashMenu.style.top = `${inputRect.bottom + window.scrollY + 4}px`;
    globalSlashMenu.style.left = `${inputRect.left + window.scrollX}px`;
    
    // Append to body
    document.body.appendChild(globalSlashMenu);
    
    // Create menu items HTML
    const itemsHtml = slashCommands.map((command, index) => {
      const isSelected = index === slashCommandSelectedIndex;
      
      return `
        <div class="slash-command-menu-item ${isSelected ? 'selected' : ''}" data-index="${index}">
          <div class="slash-command-item-content">
            <span class="slash-command-icon">${command.icon || '/'}</span>
            <div class="slash-command-text">
              <div class="slash-command-name">${command.command}</div>
              <div class="slash-command-description">${command.description}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    // Create the final menu HTML
    const menuHTML = `
      <div class="slash-command-menu">
        ${itemsHtml || '<div class="slash-command-menu-item not-selectable">No matching commands</div>'}
      </div>
    `;
    
    // Set the HTML content
    globalSlashMenu.innerHTML = menuHTML;
    
    // Add event listeners
    setTimeout(() => {
      const menuItemElements = globalSlashMenu.querySelectorAll('.slash-command-menu-item:not(.not-selectable)');
      menuItemElements.forEach((item) => {
        const itemIndex = parseInt(item.getAttribute('data-index'));
        
        // Add click handler
        item.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleSlashCommandSelect(itemIndex);
        });
        
        // Add hover handler
        item.addEventListener('mouseenter', () => {
          slashCommandSelectedIndex = itemIndex;
          updateSelectedSlashMenuItem();
        });
      });
    }, 10);
  }
  
  // Function to update selected slash command menu item visual state
  function updateSelectedSlashMenuItem() {
    const globalSlashMenu = document.getElementById('global-slash-command-menu');
    if (!globalSlashMenu) return;
    
    const menuItems = globalSlashMenu.querySelectorAll('.slash-command-menu-item:not(.not-selectable)');
    menuItems.forEach((item, index) => {
      if (index === slashCommandSelectedIndex) {
        item.classList.add('selected');
        
        // Scroll the selected item into view if needed
        item.scrollIntoView({ 
          block: 'nearest',
          inline: 'nearest',
          behavior: 'smooth'
        });
      } else {
        item.classList.remove('selected');
      }
    });
  }
  
  // Function to handle slash command selection
  function handleSlashCommandSelect(index) {
    if (index < 0 || index >= slashCommands.length) {
      return;
    }
    
    const selectedCommand = slashCommands[index];
    
    // Replace the current line with the selected command
    if (messageInputElement) {
      const text = messageInputElement.value;
      const lines = text.split('\n');
      const currentLineIndex = text.slice(0, messageInputElement.selectionStart).split('\n').length - 1;
      
      // Replace the current line with the selected command
      lines[currentLineIndex] = selectedCommand.command + ' ';
      messageInputElement.value = lines.join('\n');
      
      // Set cursor position after the command
      const newPosition = lines.slice(0, currentLineIndex).join('\n').length + 
                         (currentLineIndex > 0 ? 1 : 0) + 
                         selectedCommand.command.length + 1;
      messageInputElement.setSelectionRange(newPosition, newPosition);
      messageInputElement.focus();
      
      // Update highlights
      updateHighlights();
      
      // Auto-resize textarea
      autoResizeTextarea();
      
      // Hide slash command menu
      slashCommandVisible = false;
      renderSlashCommandMenu();
    }
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
    
    // Get input wrapper position for menu placement - align with the bordered container
    const inputWrapper = document.querySelector('.input-wrapper');
    const inputRect = inputWrapper ? inputWrapper.getBoundingClientRect() : document.getElementById('messageInput').getBoundingClientRect();
    
    // Set styles to ensure visibility
    globalContextMenu.style.position = 'fixed';
    globalContextMenu.style.zIndex = '999999';
    globalContextMenu.style.backgroundColor = 'var(--vscode-dropdown-background, #252526)';
    globalContextMenu.style.border = '2px solid var(--vscode-focusBorder, #5A32FB)';
    globalContextMenu.style.borderRadius = '16px';
    globalContextMenu.style.boxShadow = '0 8px 16px rgba(0,0,0,0.5)';
    globalContextMenu.style.overflow = 'auto';
    globalContextMenu.style.maxHeight = '300px';
    globalContextMenu.style.minHeight = '40px';
    
    // Position the menu directly below the input field, aligned with its edges
    // Set menu width to match input field's outer width
    globalContextMenu.style.width = `${inputRect.width}px`;
    
    // Position below the input field with a small gap (4px to account for visual alignment)
    globalContextMenu.style.top = `${inputRect.bottom + window.scrollY + 4}px`;
    globalContextMenu.style.left = `${inputRect.left + window.scrollX}px`;
    
    // Append to body
    document.body.appendChild(globalContextMenu);
    
    // Ensure menu is fully rendered
    setTimeout(() => {
      globalContextMenu.style.display = 'block';
    }, 0);
    
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
        <div class="context-menu-item not-selectable" style="min-height: 40px;">
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
        <div class="context-menu-item loading" style="min-height: 40px;">
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
    globalContextMenu.innerHTML = menuHTML;
    
    // Wait for DOM to be ready then add listeners
    setTimeout(() => {
      const menuItemElements = globalContextMenu.querySelectorAll('.context-menu-item:not(.not-selectable):not(.loading)');
      menuItemElements.forEach((item, idx) => {
        const itemIndex = parseInt(item.getAttribute('data-index'));
        
        // Add click handler
        item.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleContextMenuSelect(itemIndex);
        });
        
        // Add hover handler
        item.addEventListener('mouseenter', () => {
          contextMenuSelectedIndex = itemIndex;
          // Update visual state without re-rendering
          menuItemElements.forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
        });
      });
    }, 10);
  }

  // Function to update selected menu item visual state
  function updateSelectedMenuItem() {
    const globalContextMenu = document.getElementById('global-context-menu');
    if (!globalContextMenu) return;
    
    const menuItems = globalContextMenu.querySelectorAll('.context-menu-item:not(.not-selectable):not(.loading)');
    menuItems.forEach((item, index) => {
      if (index === contextMenuSelectedIndex) {
        item.classList.add('selected');
        
        // Scroll the selected item into view if needed
        item.scrollIntoView({ 
          block: 'nearest',
          inline: 'nearest',
          behavior: 'smooth'
        });
      } else {
        item.classList.remove('selected');
      }
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
      
    if (index < 0 || index >= items.length) {
      return;
    }
    
    const selectedItem = items[index];
    
    // Insert the selected item as a mention
    if (messageInputElement) {
      // Use value if available, otherwise use type as fallback
      const mentionValue = selectedItem.value || selectedItem.type;
      
      const { newValue, mentionIndex } = insertMention(
        messageInputElement.value,
        cursorPosition,
        mentionValue
      );

      // Update the input value
      messageInputElement.value = newValue;
      
      // Update cursor position
      const newPosition = mentionIndex + mentionValue.length + 2; // +2 for the @ and the space after
      messageInputElement.setSelectionRange(newPosition, newPosition);
      messageInputElement.focus();
      
      // Update highlights
      updateHighlights();
      
      // Auto-resize textarea to fit new content
      autoResizeTextarea();
      
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

  // Handle input changes to show/hide context menu or slash commands
  function handleInputChange() {
    cursorPosition = messageInputElement.selectionStart;
    const inputValue = messageInputElement.value;
    
    // Check for slash commands first
    const showSlashMenu = shouldShowSlashCommands(inputValue, cursorPosition);
    
    // Check for @ mentions
    const beforeCursor = inputValue.slice(0, cursorPosition);
    const atIndex = beforeCursor.lastIndexOf('@');
    const hasAtSymbol = atIndex !== -1;
    const showContextMenu = hasAtSymbol && shouldShowContextMenu(inputValue, cursorPosition);
    
    // Handle slash command menu
    if (showSlashMenu) {
      // Hide context menu if visible
      contextMenuVisible = false;
      renderContextMenu();
      
      // Show slash command menu
      slashCommandVisible = true;
      slashCommandSelectedIndex = 0;
      
      // Extract query for slash commands
      const lines = beforeCursor.split('\n');
      const currentLine = lines[lines.length - 1];
      const queryAfterSlash = currentLine.substring(1);
      
      // Filter slash commands based on query
      if (queryAfterSlash.length === 0) {
        slashCommands = ALL_SLASH_COMMANDS;
      } else {
        slashCommands = filterSlashCommands(queryAfterSlash);
      }
      
      renderSlashCommandMenu();
    } else {
      // Hide slash command menu if visible
      if (slashCommandVisible) {
        slashCommandVisible = false;
        renderSlashCommandMenu();
      }
      
      // Handle context menu
      if (showContextMenu !== contextMenuVisible) {
        contextMenuVisible = showContextMenu;
        contextMenuSelectedIndex = contextMenuVisible ? 0 : -1;
      }
      
      // If showing context menu, update search query and trigger search
      if (contextMenuVisible) {
        const newSearchQuery = beforeCursor.slice(atIndex + 1);
        
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
      
      renderContextMenu();
    }
    
    // Update the highlight layer
    updateHighlights();
  }

  // Function to handle key navigation in context menu
  function handleKeyDown(e) {
    if (slashCommandVisible) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          slashCommandSelectedIndex = Math.min(slashCommandSelectedIndex + 1, slashCommands.length - 1);
          updateSelectedSlashMenuItem();
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          slashCommandSelectedIndex = Math.max(slashCommandSelectedIndex - 1, 0);
          updateSelectedSlashMenuItem();
          break;
          
        case 'Enter':
        case 'Tab':
          if (slashCommandSelectedIndex >= 0) {
            e.preventDefault();
            handleSlashCommandSelect(slashCommandSelectedIndex);
          }
          break;
          
        case 'Escape':
          e.preventDefault();
          slashCommandVisible = false;
          renderSlashCommandMenu();
          break;
      }
    } else if (contextMenuVisible) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          const items = Array.isArray(searchResults) && searchResults.length > 0
            ? searchResults : baseContextItems;
          contextMenuSelectedIndex = Math.min(contextMenuSelectedIndex + 1, items.length - 1);
          updateSelectedMenuItem();
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          contextMenuSelectedIndex = Math.max(contextMenuSelectedIndex - 1, 0);
          updateSelectedMenuItem();
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
  
  // Function to resize textarea based on content
  function autoResizeTextarea() {
    if (!messageInputElement) return;
    
    // Store the current scroll position
    const scrollPos = window.scrollY;
    
    // Reset height to auto to get the correct scrollHeight
    messageInputElement.style.height = 'auto';
    
    // Calculate border and padding (if any)
    const style = window.getComputedStyle(messageInputElement);
    const borderHeight = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    
    // Set the height to scrollHeight + border
    const newHeight = Math.min(
      Math.max(messageInputElement.scrollHeight + borderHeight, 24), // Min height is 24px
      200 // Max height is 200px
    );
    
    messageInputElement.style.height = newHeight + 'px';
    
    // Update highlight layer size and scroll position
    updateHighlights();
    
    // Restore scroll position
    window.scrollTo(0, scrollPos);
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
    messageInputElement.addEventListener('input', autoResizeTextarea);
    
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
  
  // Click event listener for document to close menus when clicking outside
  document.addEventListener('mousedown', (e) => {
    // Get the global menus if they exist
    const globalContextMenu = document.getElementById('global-context-menu');
    const globalSlashMenu = document.getElementById('global-slash-command-menu');
    
    // Check if click is outside the context menu and input
    const isClickOutsideContext = 
      !globalContextMenu?.contains(e.target) &&
      !contextMenuContainer?.contains(e.target) && 
      !messageInputElement?.contains(e.target) &&
      e.target !== contextButtonElement;
      
    if (isClickOutsideContext && contextMenuVisible) {
      contextMenuVisible = false;
      renderContextMenu();
    }
    
    // Check if click is outside the slash command menu and input
    const isClickOutsideSlash = 
      !globalSlashMenu?.contains(e.target) &&
      !messageInputElement?.contains(e.target);
      
    if (isClickOutsideSlash && slashCommandVisible) {
      slashCommandVisible = false;
      renderSlashCommandMenu();
    }
  });
  
  // Initialize the UI
  function init() {
    console.log("Initializing terminal input UI");
    
    // Check critical elements and log warnings if missing
    if (!contextMenuContainer) {
      console.warn("Context menu container element not found");
    }
    if (!messageInputElement) {
      console.warn("Message input element not found");
    }
    if (!contextButtonElement) {
      console.warn("Context button element not found");
    }
    if (!highlightLayerElement) {
      console.warn("Highlight layer element not found");
    }
    
    // Set initial height for textarea
    if (messageInputElement) {
      // Initially set to the minimum height (single line)
      messageInputElement.style.height = '24px';
      
      // If there's content already (e.g. after a refresh), adjust height automatically
      if (messageInputElement.value) {
        autoResizeTextarea();
      }
    }
    
    // Set container height based on terminal status
    if (terminalStatusBanner && !terminalStatusBanner.classList.contains('hidden')) {
      // If banner is visible, adjust container as needed
      document.querySelector('.chat-container').style.maxHeight = 'none';
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