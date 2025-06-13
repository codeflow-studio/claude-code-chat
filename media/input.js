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
  const imageButtonElement = document.getElementById('imageButton');
  const imageInputElement = document.getElementById('imageInput');
  const imagePreviewContainer = document.getElementById('imagePreviewContainer');
  const problemPreviewContainer = document.getElementById('problemPreviewContainer');
  const modeToggleButtonElement = document.getElementById('modeToggleButton');
  const mainModeToggleElement = document.getElementById('mainModeToggle');
  const directModeContainer = document.getElementById('directModeContainer');
  const clearResponsesBtn = document.getElementById('clearResponsesBtn');
  const pauseProcessBtn = document.getElementById('pauseProcessBtn');
  const inputBottomActions = document.querySelector('.input-bottom-actions');
  const utilityRow = document.querySelector('.utility-row');
  const launchOptionsContainer = document.getElementById('launchOptionsContainer');
  
  // Mode state
  let isDirectMode = false;
  let isProcessRunning = false;
  
  // RegExp for detecting @ mentions
  const mentionRegex = /@((?:\/|\w+:\/\/)[^\s]+?|[a-f0-9]{7,40}\b|problems\b|git-changes\b)(?=[.,;:!?]?(?=[\s\r\n]|$))/;
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
  
  // Image upload state
  let pendingImages = [];
  
  // Problem selection state
  let pendingProblems = [];
  
  // Base context menu items
  const baseContextItems = [
    { type: 'problems', value: 'problems', label: 'Problems', description: 'Workspace problems' }
  ];
  
  // Slash commands
  const BUILT_IN_SLASH_COMMANDS = [
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
  
  // Initialize ALL_SLASH_COMMANDS as a new array
  let ALL_SLASH_COMMANDS = [...BUILT_IN_SLASH_COMMANDS];
  
  // Custom command storage
  let CUSTOM_SLASH_COMMANDS = [];

  // Function to filter slash commands based on query
  function filterSlashCommands(query) {
    const searchTerm = query.toLowerCase();
    // Use ALL_SLASH_COMMANDS which already contains both built-in and custom commands
    return ALL_SLASH_COMMANDS.filter(cmd => 
      cmd.command.toLowerCase().includes(searchTerm) ||
      cmd.description.toLowerCase().includes(searchTerm)
    );
  }
  
  // Function to add custom commands to the list
  function updateCustomCommands(customCommands) {
    if (Array.isArray(customCommands) && customCommands.length > 0) {
      console.log('Updating custom commands:', customCommands);
      // Clear any previous custom commands
      CUSTOM_SLASH_COMMANDS = [];
      // Add new custom commands, ensuring no duplicates by checking if command already exists
      customCommands.forEach(cmd => {
        // Check if we already have this command (prevents duplicates)
        const exists = CUSTOM_SLASH_COMMANDS.some(existing => existing.command === cmd.command);
        if (!exists) {
          CUSTOM_SLASH_COMMANDS.push(cmd);
        }
      });
      
      // Reset ALL_SLASH_COMMANDS to just built-in commands
      ALL_SLASH_COMMANDS = [...BUILT_IN_SLASH_COMMANDS];
      // Add unique custom commands
      ALL_SLASH_COMMANDS.push(...CUSTOM_SLASH_COMMANDS);
      
      console.log('Updated ALL_SLASH_COMMANDS:', ALL_SLASH_COMMANDS);
    }
  }
  
  // Function to request rescan of custom commands from extension
  function rescanCustomCommands() {
    vscode.postMessage({
      command: 'rescanCustomCommands'
    });
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
    if (!messageInputElement) return;
    
    const text = messageInputElement.value.trim();
    const problemIds = pendingProblems.map(problem => problem.originalIndex);
    if (!text && pendingImages.length === 0 && pendingProblems.length === 0 && problemIds.length === 0) {
      return;
    }

    vscode.postMessage({
      command: 'sendToTerminal',
      text: text,
      images: pendingImages,
      selectedProblemIds: problemIds
    });
    
    // Clear input, images, and problems after sending
    messageInputElement.value = '';
    pendingImages = [];
    pendingProblems = [];
    updateImagePreview();
    updateProblemPreview();
    updateHighlights();
    
    // Reset textarea height to minimum after clearing content
    autoResizeTextarea();
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
            <span class="path-text">${item.value}</span>
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
      menuItemElements.forEach((item) => {
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
    
    // Special handling for problems - show problem selector instead of inserting mention
    if (selectedItem.type === 'problems') {
      // Hide context menu first
      contextMenuVisible = false;
      renderContextMenu();
      
      // Show problem selection dialog
      showProblemSelector();
      return;
    }
    
    // Insert the selected item as a mention
    if (messageInputElement) {
      // Use value if available, otherwise use type as fallback
      let mentionValue = selectedItem.value || selectedItem.type;
      
      // Remove leading "/" if present
      if (mentionValue.startsWith('/')) {
        mentionValue = mentionValue.substring(1);
      }
      
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
      // Rescan custom commands when showing slash menu (just typed "/" at beginning)
      const lines = beforeCursor.split('\n');
      const currentLine = lines[lines.length - 1];
      const queryAfterSlash = currentLine.substring(1);
      
      // If we just typed "/" (no query yet), rescan custom commands
      if (queryAfterSlash.length === 0) {
        rescanCustomCommands();
      }
      
      // Hide context menu if visible
      contextMenuVisible = false;
      renderContextMenu();
      
      // Show slash command menu
      slashCommandVisible = true;
      slashCommandSelectedIndex = 0;
      
      // Filter slash commands based on query 
      if (queryAfterSlash.length === 0) {
        // Use ALL_SLASH_COMMANDS which already contains both built-in and custom commands
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
    if (problemSelectorVisible) {
      // Handle problem selector navigation
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          cancelProblemSelection();
          break;
          
        case 'Enter':
          e.preventDefault();
          confirmProblemSelection();
          break;
      }
    } else if (slashCommandVisible) {
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
  
  // Event listener for main mode toggle switch
  if (mainModeToggleElement) {
    mainModeToggleElement.addEventListener('change', () => {
      isDirectMode = mainModeToggleElement.checked;
      updateModeUI();
      vscode.postMessage({
        command: 'toggleMainMode',
        isDirectMode: isDirectMode
      });
    });
  }
  
  // Helper function to update an assistant message to a result message
  function updateMessageToResult(messageElement, content, timestamp, metadata) {
    const time = new Date(timestamp).toLocaleTimeString();
    
    let resultInfo = '';
    if (metadata) {
      const parts = [];
      if (metadata.cost) parts.push(`$${metadata.cost.toFixed(4)}`);
      if (metadata.duration) parts.push(`${(metadata.duration / 1000).toFixed(1)}s`);
      if (parts.length > 0) {
        resultInfo = ` <span class="result-info">(${parts.join(', ')})</span>`;
      }
    }
    
    // Update the message class to result-message
    messageElement.className = 'direct-mode-message result-message';
    
    // Update the header to show "Summary" instead of "Claude"
    const header = messageElement.querySelector('.message-header');
    if (header) {
      header.innerHTML = `
        <span class="message-sender result-sender">Summary${resultInfo}</span>
        <span class="message-time">${time}</span>
      `;
    }
    
    // Content stays the same since it should be identical
    // But ensure it has the result-content class
    const contentElement = messageElement.querySelector('.message-content');
    if (contentElement) {
      contentElement.className = 'message-content result-content';
    }
    
    // Ensure loading indicator stays at the bottom if process is running
    if (isProcessRunning) {
      updateLoadingIndicator(true);
    }
  }
  
  // Function to add a message to the Direct Mode container
  function addDirectModeMessage(type, content, timestamp, subtype, metadata, displayName, isUpdate) {
    const directModeMessages = document.getElementById('directModeMessages');
    if (!directModeMessages) return;
    
    // Remove placeholder message if it exists
    const placeholder = directModeMessages.querySelector('.placeholder-message');
    if (placeholder) {
      placeholder.remove();
    }
    
    // If this is an update, find the last assistant message and update it
    if (isUpdate && type === 'result') {
      const assistantMessages = directModeMessages.querySelectorAll('.assistant-message');
      if (assistantMessages.length > 0) {
        const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
        updateMessageToResult(lastAssistantMessage, content, timestamp, metadata);
        
        // Auto-scroll to bottom
        directModeMessages.scrollTop = directModeMessages.scrollHeight;
        return;
      }
    }
    
    // Create message element
    const messageElement = document.createElement('div');
    messageElement.className = `direct-mode-message ${type}-message`;
    
    // Format timestamp
    const time = new Date(timestamp).toLocaleTimeString();
    
    let messageHTML = '';
    
    switch (type) {
      case 'user':
        const userContent = content || 'User message';
        messageHTML = `
          <div class="message-header">
            <span class="message-sender">You</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-content user-content">${escapeHtml(userContent)}</div>
        `;
        break;
        
      case 'system':
        let systemContent = content || 'System message';
        let senderLabel = 'System';
        
        if (subtype === 'init') {
          senderLabel = 'Session';
          if (metadata?.tools || metadata?.mcpServers) {
            systemContent = formatSystemInitContent(content, metadata);
          }
        }
        
        messageHTML = `
          <div class="message-header">
            <span class="message-sender system-sender">${senderLabel}</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-content system-content">${systemContent}</div>
        `;
        break;
        
      case 'assistant':
        const assistantContent = content || '';
        let usageInfo = '';
        
        if (metadata?.usage) {
          const usage = metadata.usage;
          if (usage.input_tokens || usage.output_tokens) {
            usageInfo = ` <span class="usage-info">(${usage.input_tokens || 0}→${usage.output_tokens || 0} tokens)</span>`;
          }
        }
        
        messageHTML = `
          <div class="message-header">
            <span class="message-sender assistant-sender">Claude${usageInfo}</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-content assistant-content">${formatAssistantContent(assistantContent, metadata)}</div>
        `;
        break;
        
      case 'result':
        let resultInfo = '';
        if (metadata) {
          const parts = [];
          if (metadata.cost) parts.push(`$${metadata.cost.toFixed(4)}`);
          if (metadata.duration) parts.push(`${(metadata.duration / 1000).toFixed(1)}s`);
          if (parts.length > 0) {
            resultInfo = ` <span class="result-info">(${parts.join(', ')})</span>`;
          }
        }
        
        messageHTML = `
          <div class="message-header">
            <span class="message-sender result-sender">Summary${resultInfo}</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-content result-content">${formatAssistantContent(content || 'Conversation complete', metadata)}</div>
        `;
        break;
        
      case 'error':
        messageHTML = `
          <div class="message-header">
            <span class="message-sender error-sender">Error</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-content error-content">${escapeHtml(content || 'An error occurred')}</div>
        `;
        break;
        
      case 'user_input':
        const userInputContent = content || 'User input';
        messageHTML = `
          <div class="message-header">
            <span class="message-sender">You</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-content user-content">${escapeHtml(userInputContent)}</div>
        `;
        break;
        
      default:
        // Fallback for unknown types - use displayName if provided
        const senderName = displayName || `Unknown (${type})`;
        messageHTML = `
          <div class="message-header">
            <span class="message-sender">${escapeHtml(senderName)}</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-content">${escapeHtml(content || '')}</div>
        `;
    }
    
    messageElement.innerHTML = messageHTML;
    directModeMessages.appendChild(messageElement);
    
    // Ensure loading indicator stays at the bottom if process is running
    if (isProcessRunning) {
      updateLoadingIndicator(true);
    }
    
    // Auto-scroll to bottom
    directModeMessages.scrollTop = directModeMessages.scrollHeight;
  }
  
  // Helper function to format system init content
  function formatSystemInitContent(content, metadata) {
    if (!metadata) return escapeHtml(content || 'Session initialized');
    
    const parts = [];
    
    if (metadata.model) {
      parts.push(`<strong>Model:</strong> ${escapeHtml(metadata.model)}`);
    }
    
    if (metadata.tools && metadata.tools.length > 0) {
      parts.push(`<strong>Tools:</strong> ${metadata.tools.length} available`);
    }
    
    if (metadata.mcpServers && metadata.mcpServers.length > 0) {
      const connectedServers = metadata.mcpServers
        .filter(server => server.status === 'connected')
        .map(server => server.name);
      if (connectedServers.length > 0) {
        parts.push(`<strong>MCP:</strong> ${connectedServers.join(', ')}`);
      }
    }
    
    return parts.length > 0 ? 
      `<div class="system-init">Session initialized<br>${parts.join('<br>')}</div>` :
      escapeHtml(content || 'Session initialized');
  }
  
  // Helper function to escape HTML
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Helper function to format assistant content (supports structured content and markdown)
  function formatAssistantContent(content, metadata) {
    if (!content) return '';
    
    // Handle structured content (tool_use, tool_result, etc.)
    if (metadata && metadata.originalMessage && metadata.originalMessage.message && 
        Array.isArray(metadata.originalMessage.message.content)) {
      return formatStructuredContent(metadata.originalMessage.message.content);
    }
    
    // Handle string content with markdown-like formatting
    let formatted = escapeHtml(content);
    
    // Convert thinking blocks with special styling
    formatted = formatted.replace(/🤔 Thinking: (.*?)(?=🔧|$)/gs, function(match, thinkingContent) {
      return `<div class="thinking-block">
        <div class="thinking-header">🤔 Thinking</div>
        <div class="thinking-content">${thinkingContent.trim()}</div>
      </div>`;
    });
    
    // Convert tool usage blocks
    formatted = formatted.replace(/🔧 Using tool: (.*?)$/gm, '<div class="tool-usage">🔧 Using tool: $1</div>');
    
    // Convert code blocks
    formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Convert inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Convert bold
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Convert italic
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Convert line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
  }
  
  // Helper function to format structured content (tool_use, tool_result, thinking, etc.)
  function formatStructuredContent(contentArray) {
    if (!Array.isArray(contentArray)) return '';
    
    let formattedParts = [];
    
    contentArray.forEach(item => {
      if (!item || !item.type) return;
      
      switch (item.type) {
        case 'text':
          if (item.text) {
            let textFormatted = escapeHtml(item.text);
            // Apply basic markdown formatting to text blocks
            textFormatted = textFormatted
              .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
              .replace(/`([^`]+)`/g, '<code>$1</code>')
              .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
              .replace(/\*([^*]+)\*/g, '<em>$1</em>')
              .replace(/\n/g, '<br>');
            formattedParts.push(`<div class="content-text">${textFormatted}</div>`);
          }
          break;
          
        case 'thinking':
          if (item.thinking) {
            formattedParts.push(`
              <div class="thinking-block">
                <div class="thinking-header">🤔 Claude is thinking...</div>
                <div class="thinking-content">${escapeHtml(item.thinking)}</div>
              </div>
            `);
          }
          break;
          
        case 'tool_use':
          formattedParts.push(formatToolUse(item));
          break;
          
        case 'tool_result':
          if (item.content) {
            formattedParts.push(`
              <div class="tool-result">
                <div class="tool-result-header">✅ Tool Result</div>
                <div class="tool-result-content">${escapeHtml(item.content)}</div>
              </div>
            `);
          }
          break;
          
        default:
          // Fallback for unknown content types
          if (item.text || item.content) {
            formattedParts.push(`<div class="content-unknown">${escapeHtml(item.text || item.content)}</div>`);
          }
      }
    });
    
    return formattedParts.join('');
  }
  
  // Helper function to format tool_use content with enhanced UI
  function formatToolUse(toolUse) {
    if (!toolUse.name) return '';
    
    const toolName = toolUse.name;
    const toolIcon = getToolIcon(toolName);
    let toolDescription = getToolDescription(toolName);
    
    // Special handling for Edit tool
    if (toolName === 'Edit' && toolUse.input) {
      return formatEditTool(toolUse.input, toolIcon);
    }
    
    // Special handling for other file tools
    if (['Write', 'Read', 'MultiEdit'].includes(toolName) && toolUse.input) {
      return formatFileTool(toolName, toolUse.input, toolIcon);
    }
    
    // Generic tool usage display
    let inputDisplay = '';
    if (toolUse.input && Object.keys(toolUse.input).length > 0) {
      const inputKeys = Object.keys(toolUse.input);
      if (inputKeys.length <= 3) {
        inputDisplay = inputKeys.map(key => {
          const value = toolUse.input[key];
          if (typeof value === 'string' && value.length > 50) {
            return `${key}: ${value.substring(0, 50)}...`;
          }
          return `${key}: ${value}`;
        }).join(', ');
      } else {
        inputDisplay = `${inputKeys.length} parameters`;
      }
    }
    
    return `
      <div class="tool-usage-block">
        <div class="tool-header">
          <span class="tool-icon">${toolIcon}</span>
          <span class="tool-name">${toolName}</span>
          <span class="tool-description">${toolDescription}</span>
        </div>
        ${inputDisplay ? `<div class="tool-input">${escapeHtml(inputDisplay)}</div>` : ''}
      </div>
    `;
  }
  
  // Helper function to format Edit tool with enhanced file diff UI
  function formatEditTool(input, toolIcon) {
    if (!input.file_path) return '';
    
    const fileName = input.file_path.split('/').pop() || input.file_path;
    const filePath = input.file_path;
    
    let changeInfo = '';
    if (input.old_string && input.new_string) {
      const oldLines = input.old_string.split('\n').length;
      const newLines = input.new_string.split('\n').length;
      const lineDiff = newLines - oldLines;
      changeInfo = lineDiff === 0 ? 'Modified content' : 
                  lineDiff > 0 ? `+${lineDiff} lines` : 
                  `${lineDiff} lines`;
    }
    
    return `
      <div class="file-edit-block">
        <div class="file-edit-header">
          <div class="file-edit-info">
            <span class="tool-icon">${toolIcon}</span>
            <div class="file-details">
              <div class="file-name">${escapeHtml(fileName)}</div>
              <div class="file-path">${escapeHtml(filePath)}</div>
            </div>
          </div>
          <div class="change-info">${changeInfo}</div>
        </div>
        
        ${input.old_string && input.new_string ? `
          <div class="file-diff">
            <div class="diff-section removed">
              <div class="diff-label">- Removed</div>
              <div class="diff-content"><pre><code>${escapeHtml(input.old_string)}</code></pre></div>
            </div>
            <div class="diff-section added">
              <div class="diff-label">+ Added</div>
              <div class="diff-content"><pre><code>${escapeHtml(input.new_string)}</code></pre></div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }
  
  // Helper function to format other file tools (Write, Read, MultiEdit)
  function formatFileTool(toolName, input, toolIcon) {
    const fileName = input.file_path ? (input.file_path.split('/').pop() || input.file_path) : 'Unknown file';
    const filePath = input.file_path || '';
    
    let actionText = '';
    switch (toolName) {
      case 'Write':
        actionText = 'Writing to file';
        break;
      case 'Read':
        actionText = 'Reading file';
        break;
      case 'MultiEdit':
        actionText = `Making ${input.edits ? input.edits.length : 'multiple'} edits`;
        break;
    }
    
    return `
      <div class="file-tool-block">
        <div class="file-tool-header">
          <span class="tool-icon">${toolIcon}</span>
          <div class="file-details">
            <div class="file-action">${actionText}</div>
            <div class="file-name">${escapeHtml(fileName)}</div>
            ${filePath ? `<div class="file-path">${escapeHtml(filePath)}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }
  
  // Helper function to get tool icons
  function getToolIcon(toolName) {
    const icons = {
      'Edit': '✏️',
      'Write': '📝',
      'Read': '📖',
      'MultiEdit': '📄',
      'Bash': '💻',
      'Grep': '🔍',
      'Glob': '📁',
      'LS': '📋',
      'Task': '⚡'
    };
    return icons[toolName] || '🔧';
  }
  
  // Helper function to get tool descriptions
  function getToolDescription(toolName) {
    const descriptions = {
      'Edit': 'Editing file',
      'Write': 'Writing file',
      'Read': 'Reading file',
      'MultiEdit': 'Multiple edits',
      'Bash': 'Running command',
      'Grep': 'Searching content',
      'Glob': 'Finding files',
      'LS': 'Listing directory',
      'Task': 'Executing task'
    };
    return descriptions[toolName] || 'Using tool';
  }
  
  // Function to update pause button visibility based on process state
  function updatePauseButtonVisibility(processRunning) {
    // Update global state
    isProcessRunning = processRunning;
    
    if (pauseProcessBtn) {
      if (isProcessRunning) {
        pauseProcessBtn.classList.add('visible');
        // Add pulsing animation to indicate active process
        setTimeout(() => {
          if (pauseProcessBtn.classList.contains('visible')) {
            pauseProcessBtn.classList.add('pulsing');
          }
        }, 300); // Wait for slide-in animation to complete
      } else {
        pauseProcessBtn.classList.remove('visible', 'pulsing');
      }
    }
    
    // Update loading indicator visibility
    updateLoadingIndicator(isProcessRunning);
  }
  
  // Function to update loading indicator visibility
  function updateLoadingIndicator(isProcessRunning) {
    if (!isDirectMode) return; // Only show loading indicator in Direct Mode
    
    const directModeMessages = document.getElementById('directModeMessages');
    if (!directModeMessages) return;
    
    // Remove any existing loading indicator first
    const existingIndicator = directModeMessages.querySelector('.loading-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    if (isProcessRunning) {
      // Create new loading indicator and append to the end
      const loadingIndicator = document.createElement('div');
      loadingIndicator.className = 'loading-indicator';
      loadingIndicator.innerHTML = `
        <div class="loading-dots">
          <div class="loading-dot"></div>
          <div class="loading-dot"></div>
          <div class="loading-dot"></div>
        </div>
        <span class="loading-text">Claude is processing...</span>
      `;
      loadingIndicator.style.display = 'flex';
      
      // Always append to the end (after all messages)
      directModeMessages.appendChild(loadingIndicator);
      
      // Auto-scroll to show loading indicator
      directModeMessages.scrollTop = directModeMessages.scrollHeight;
    }
  }

  // Function to update UI based on current mode
  function updateModeUI() {
    // Update mode labels to show active state
    const modeLabels = document.querySelectorAll('.mode-label');
    if (modeLabels.length >= 2) {
      const terminalLabel = modeLabels[0]; // First label is "Terminal"
      const directLabel = modeLabels[1];   // Second label is "Direct"
      
      if (isDirectMode) {
        terminalLabel.classList.remove('active');
        directLabel.classList.add('active');
      } else {
        terminalLabel.classList.add('active');
        directLabel.classList.remove('active');
      }
    }
    
    if (isDirectMode) {
      // Show direct mode container
      if (directModeContainer) {
        directModeContainer.classList.remove('hidden');
      }
      // Hide terminal-specific elements
      if (modeToggleButtonElement) {
        modeToggleButtonElement.style.display = 'none';
      }
      // Hide launch options (Start Claude Code section)
      if (launchOptionsContainer) {
        launchOptionsContainer.style.display = 'none';
      }
      // Hide terminal status banner
      if (terminalStatusBanner) {
        terminalStatusBanner.style.display = 'none';
      }
      // Hide footer
      if (utilityRow) {
        utilityRow.style.display = 'none';
      }
      // Keep bottom actions visible (@ and image buttons remain available)
    } else {
      // Hide direct mode container
      if (directModeContainer) {
        directModeContainer.classList.add('hidden');
      }
      // Show terminal-specific elements
      if (modeToggleButtonElement) {
        modeToggleButtonElement.style.display = 'flex';
      }
      // Show launch options (Start Claude Code section)
      if (launchOptionsContainer) {
        launchOptionsContainer.style.display = 'block';
      }
      // Show terminal status banner (if it was visible)
      if (terminalStatusBanner) {
        terminalStatusBanner.style.display = 'flex';
      }
      // Show footer
      if (utilityRow) {
        utilityRow.style.display = 'flex';
      }
      // Bottom actions (@ and image buttons) remain visible in both modes
    }
  }
  
  // Event listener for clear responses button
  if (clearResponsesBtn) {
    clearResponsesBtn.addEventListener('click', () => {
      const directModeMessages = document.getElementById('directModeMessages');
      if (directModeMessages) {
        directModeMessages.innerHTML = '<div class="placeholder-message">Direct Mode - Ready to receive responses</div>';
      }
      
      // Clear the conversation and reset session ID without stopping the service
      vscode.postMessage({
        command: 'clearDirectMode'
      });
    });
  }
  
  // Event listener for pause process button
  if (pauseProcessBtn) {
    pauseProcessBtn.addEventListener('click', () => {
      // Add visual feedback for the click
      pauseProcessBtn.style.transform = 'scale(0.95)';
      pauseProcessBtn.style.opacity = '0.8';
      
      // Send pause command to extension
      vscode.postMessage({
        command: 'pauseProcess'
      });
      
      // Reset visual feedback after a short delay
      setTimeout(() => {
        pauseProcessBtn.style.transform = '';
        pauseProcessBtn.style.opacity = '';
      }, 150);
    });
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
      Math.max(messageInputElement.scrollHeight + borderHeight, 48), // Min height is 48px to match wrapper
      200 // Max height is 200px
    );
    
    messageInputElement.style.height = newHeight + 'px';
    
    // Update highlight layer size and scroll position
    updateHighlights();
    
    // Ensure the highlight layer matches the textarea's dimensions
    if (highlightLayerElement) {
      highlightLayerElement.style.height = messageInputElement.style.height;
      highlightLayerElement.style.maxHeight = messageInputElement.style.maxHeight;
    }
    
    // Make sure the entire input field is visible
    const inputContainer = document.querySelector('.input-container');
    if (inputContainer) {
      // Ensure there's enough space for the expanded input
      const containerRect = inputContainer.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      
      // If the container bottom is cut off, scroll it into view
      if (containerRect.bottom > viewportHeight) {
        const scrollBy = Math.min(containerRect.bottom - viewportHeight + 20, 200);
        window.scrollBy(0, scrollBy);
      }
    } else {
      // Restore scroll position if no adjustment needed
      window.scrollTo(0, scrollPos);
    }
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
  
  // Launch option button event listeners
  const launchNewButton = document.getElementById('launchNew');
  const launchContinueButton = document.getElementById('launchContinue');
  const launchHistoryButton = document.getElementById('launchHistory');
  
  if (launchNewButton) {
    launchNewButton.addEventListener('click', () => {
      console.log('Launch new session clicked');
      vscode.postMessage({
        command: 'launchClaudeNew'
      });
    });
  }
  
  if (launchContinueButton) {
    launchContinueButton.addEventListener('click', () => {
      console.log('Launch continue session clicked');
      vscode.postMessage({
        command: 'launchClaudeContinue'
      });
    });
  }
  
  if (launchHistoryButton) {
    launchHistoryButton.addEventListener('click', () => {
      console.log('Launch history selection clicked - will call claude -r');
      vscode.postMessage({
        command: 'launchClaudeHistory'
      });
    });
  }
  
  // Variable to keep track of current search query
  let currentSearchRequestId = '';

  // Listen for messages from the extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    
    switch (message.command || message.type) {
      case 'focusInput':
        // Focus the message input when requested by extension
        if (messageInputElement) {
          // Try multiple times to ensure focus is taken
          messageInputElement.focus();
          
          // Also try with a slight delay
          setTimeout(() => {
            messageInputElement.focus();
          }, 10);
          
          setTimeout(() => {
            messageInputElement.focus();
          }, 50);
          
          // Also try to scroll into view in case it's not visible
          setTimeout(() => {
            messageInputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageInputElement.focus();
          }, 100);
        }
        break;
        
      case 'terminalStatus':
        // Update terminal status banner visibility
        if (terminalStatusBanner) {
          const wasHidden = terminalStatusBanner.classList.contains('hidden');
          
          if (message.isTerminalClosed) {
            terminalStatusBanner.classList.remove('hidden');
            terminalStatusBanner.innerHTML = `
              <div class="terminal-status-icon">⚠️</div>
              <div class="terminal-status-message">
                Terminal was closed. Sending a message will reopen it.
              </div>
            `;
            // If the banner was previously hidden and is now shown, adjust the container
            if (wasHidden) {
              // Allow layout to adjust by forcing a reflow
              document.querySelector('.chat-container').style.maxHeight = '280px';
            }
          } else {
            // Terminal is open - check if we're connected to an existing terminal
            if (message.isConnectedToExistingTerminal && message.terminalName) {
              terminalStatusBanner.classList.remove('hidden');
              terminalStatusBanner.innerHTML = `
                <div class="terminal-status-icon">🔗</div>
                <div class="terminal-status-message">
                  Connected to existing terminal: "${message.terminalName}". Send a message to start Claude if needed.
                </div>
              `;
              // Show the banner briefly, then hide it after 5 seconds (longer since there's more info)
              setTimeout(() => {
                terminalStatusBanner.classList.add('hidden');
                document.querySelector('.chat-container').style.maxHeight = '250px';
              }, 5000);
            } else {
              terminalStatusBanner.classList.add('hidden');
              // If the banner was previously shown and is now hidden, restore original size
              if (!wasHidden) {
                document.querySelector('.chat-container').style.maxHeight = '250px';
              }
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
        
      case 'imageFilesSelected':
        // Handle image file paths from VSCode file selection
        if (message.imagePaths && message.imagePaths.length > 0) {
          message.imagePaths.forEach(path => {
            const fileName = path.split('/').pop() || path.split('\\').pop() || 'image';
            pendingImages.push({
              name: fileName,
              type: 'image/*', // We don't know the exact type from path
              path: path,
              isFromClipboard: false
            });
          });
          updateImagePreview();
        }
        break;
        
      case 'droppedPathsResolved':
        // Handle resolved paths from dropped files/folders
        if (message.paths && message.paths.length > 0) {
          insertDroppedPaths(message.paths);
        }
        break;
        
      case 'droppedImagesResolved':
        // Handle resolved image paths from VSCode drops (already saved to temp)
        if (message.imagePaths && message.imagePaths.length > 0) {
          message.imagePaths.forEach(path => {
            const fileName = path.split('/').pop() || path.split('\\').pop() || 'image';
            pendingImages.push({
              name: fileName,
              type: 'image/*', // We don't know the exact type from path
              path: path,
              isFromClipboard: false,
              // Important: path is already a temp file, no need to save again
              alreadySaved: true
            });
          });
          updateImagePreview();
        }
        break;
        
      case 'customCommandsUpdated':
        // Handle custom commands update from the extension
        if (message.customCommands) {
          console.log('Received custom commands from extension:', message.customCommands);
          updateCustomCommands(message.customCommands);
        }
        break;
        
      case 'addTextToInput':
        // Handle adding text to the input field from context menu
        if (message.text && messageInputElement) {
          const currentValue = messageInputElement.value;
          const cursorPosition = messageInputElement.selectionStart || messageInputElement.value.length;
          
          // Add space before if needed
          const needsSpaceBefore = currentValue.length > 0 && !currentValue.endsWith(' ') && !currentValue.endsWith('\n');
          const spaceBefore = needsSpaceBefore ? '\n\n' : '';
          
          // Add space after
          const spaceAfter = '\n';
          
          // Insert the text at cursor position
          const beforeCursor = currentValue.slice(0, cursorPosition);
          const afterCursor = currentValue.slice(cursorPosition);
          const newValue = beforeCursor + spaceBefore + message.text + spaceAfter + afterCursor;
          
          messageInputElement.value = newValue;
          
          // Set cursor position after the inserted text
          const newCursorPosition = cursorPosition + spaceBefore.length + message.text.length + spaceAfter.length;
          messageInputElement.setSelectionRange(newCursorPosition, newCursorPosition);
          
          // Update highlights and resize
          updateHighlights();
          autoResizeTextarea();
          
          // Focus the input
          messageInputElement.focus();
        }
        break;
        
      case 'showLaunchOptions':
        // Show the launch options UI
        const launchOptionsContainer = document.getElementById('launchOptionsContainer');
        if (launchOptionsContainer) {
          launchOptionsContainer.classList.remove('hidden');
          console.log('Launch options shown');
        }
        break;
        
      case 'hideLaunchOptions':
        // Hide the launch options UI
        const launchOptionsContainerHide = document.getElementById('launchOptionsContainer');
        if (launchOptionsContainerHide) {
          launchOptionsContainerHide.classList.add('hidden');
          console.log('Launch options hidden');
        }
        break;
        
      case 'setDirectMode':
        // Set the initial Direct Mode state from saved preferences
        isDirectMode = message.isDirectMode;
        if (mainModeToggleElement) {
          mainModeToggleElement.checked = isDirectMode;
        }
        updateModeUI();
        break;
        
      case 'directModeUserMessage':
        // Display user message in Direct Mode container
        addDirectModeMessage('user', message.text, message.timestamp);
        break;
        
      case 'directModeResponse':
        // Display Claude's response in Direct Mode container
        addDirectModeMessage(
          message.response.type, 
          message.response.content || message.response.error, 
          message.response.timestamp,
          message.response.subtype,
          message.response.metadata,
          message.response.displayName,
          message.response.isUpdate
        );
        break;
        
      case 'updateProcessState':
        // Update pause button visibility based on process state
        updatePauseButtonVisibility(message.isProcessRunning);
        break;
        
    }
  });
  
  // Click event listener for document to close menus when clicking outside
  document.addEventListener('mousedown', (e) => {
    // Get the global menus if they exist
    const globalContextMenu = document.getElementById('global-context-menu');
    const globalSlashMenu = document.getElementById('global-slash-command-menu');
    const globalProblemSelector = document.getElementById('global-problem-selector');
    
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
    
    // Check if click is outside the problem selector
    const isClickOutsideProblemSelector = 
      !globalProblemSelector?.contains(e.target) &&
      !messageInputElement?.contains(e.target);
      
    if (isClickOutsideProblemSelector && problemSelectorVisible) {
      cancelProblemSelection();
    }
  });
  
  // Function to handle image file selection
  function handleImageSelection(files, isFromClipboard = false) {
    const validFiles = Array.from(files).filter(file => {
      return file.type.startsWith('image/');
    });

    if (validFiles.length === 0) {
      vscode.postMessage({
        command: 'showError',
        message: 'Please select valid image files (PNG, JPG, JPEG, GIF, WebP)'
      });
      return;
    }

    validFiles.forEach(file => {
      // For clipboard images, we need to save to temp as they don't have a path
      if (isFromClipboard) {
        const reader = new FileReader();
        reader.onload = (e) => {
          pendingImages.push({
            name: file.name || `clipboard-image-${Date.now()}.png`,
            type: file.type,
            data: e.target.result,
            isFromClipboard: true
          });
          updateImagePreview();
        };
        reader.onerror = (error) => {
          console.error('Error reading clipboard file:', error);
          vscode.postMessage({
            command: 'showError',
            message: `Failed to read clipboard image`
          });
        };
        reader.readAsDataURL(file);
      } else {
        // For file selection and drag-drop, we'll use a special command to get the actual path
        const reader = new FileReader();
        reader.onload = (e) => {
          pendingImages.push({
            name: file.name,
            type: file.type,
            data: e.target.result,
            isFromClipboard: false,
            needsPath: true  // Flag to indicate we need to resolve the actual path
          });
          updateImagePreview();
        };
        reader.onerror = (error) => {
          console.error('Error reading file:', error);
          vscode.postMessage({
            command: 'showError',
            message: `Failed to read file: ${file.name}`
          });
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Function to update image preview display
  function updateImagePreview() {
    if (!imagePreviewContainer) return;

    if (pendingImages.length === 0) {
      imagePreviewContainer.style.display = 'none';
      imagePreviewContainer.innerHTML = '';
      return;
    }

    imagePreviewContainer.style.display = 'flex';
    
    const previewHTML = pendingImages.map((image, index) => {
      // For path-based images, just show the filename
      if (image.path && !image.data) {
        return `
          <div class="image-preview-item">
            <div class="preview-icon">📷</div>
            <span class="preview-name" title="${image.path}">${image.name}</span>
            <button class="image-remove-btn" data-index="${index}" title="Remove image">×</button>
          </div>
        `;
      } else {
        // For clipboard images, show the actual preview
        return `
          <div class="image-preview-item">
            <img src="${image.data}" alt="${image.name}" class="preview-thumbnail" />
            <span class="preview-name">${image.name}</span>
            <button class="image-remove-btn" data-index="${index}" title="Remove image">×</button>
          </div>
        `;
      }
    }).join('');

    imagePreviewContainer.innerHTML = previewHTML;

    // Add event listeners to remove buttons
    const removeButtons = imagePreviewContainer.querySelectorAll('.image-remove-btn');
    removeButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const index = parseInt(e.target.getAttribute('data-index'));
        pendingImages.splice(index, 1);
        updateImagePreview();
      });
    });
  }

  // Function to update problem preview display
  function updateProblemPreview() {
    if (!problemPreviewContainer) return;

    if (pendingProblems.length === 0) {
      problemPreviewContainer.style.display = 'none';
      problemPreviewContainer.innerHTML = '';
      return;
    }

    problemPreviewContainer.style.display = 'flex';
    
    const previewHTML = pendingProblems.map((problem, index) => {
      const fileName = problem.file.split('/').pop() || problem.file;
      const severityClass = problem.severity.toLowerCase();
      const shortMessage = problem.message.length > 40 ? 
        problem.message.substring(0, 40) + '...' : 
        problem.message;
      
      return `
        <div class="problem-preview-item">
          <div class="problem-preview-content">
            <div class="problem-preview-header">
              <span class="problem-preview-severity ${severityClass}">${problem.severity.charAt(0)}</span>
              <span class="problem-preview-location">${fileName}:${problem.line}</span>
            </div>
            <div class="problem-preview-message">${shortMessage}</div>
          </div>
          <button class="problem-remove-btn" data-index="${index}" title="Remove problem">×</button>
        </div>
      `;
    }).join('');

    problemPreviewContainer.innerHTML = previewHTML;

    // Add event listeners to remove buttons
    const removeButtons = problemPreviewContainer.querySelectorAll('.problem-remove-btn');
    removeButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const index = parseInt(e.target.getAttribute('data-index'));
        pendingProblems.splice(index, 1);
        updateProblemPreview();
      });
    });
  }

  // Event listener for image button
  if (imageButtonElement) {
    imageButtonElement.addEventListener('click', () => {
      // Request VSCode to open file selection dialog
      vscode.postMessage({
        command: 'selectImageFiles'
      });
    });
  }

  // Event listener for mode toggle button
  if (modeToggleButtonElement) {
    modeToggleButtonElement.addEventListener('click', () => {
      // Send mode toggle command to extension
      vscode.postMessage({
        command: 'toggleMode'
      });
    });
  }

  // Handle drag and drop for files/folders and images
  if (messageInputElement) {
    const inputWrapper = document.querySelector('.input-wrapper');
    const dropTarget = inputWrapper || messageInputElement;
    
    // Add drag event listeners
    dropTarget.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      dropTarget.classList.add('drag-over');
      
      // Show hint if Shift key is not pressed
      if (!e.shiftKey) {
        dropTarget.dataset.dragHint = 'Hold Shift key to drop files';
      } else {
        dropTarget.dataset.dragHint = 'Drop files here';
      }
    });

    dropTarget.addEventListener('dragleave', (e) => {
      // Only remove the class if we're leaving the drop target completely
      if (!dropTarget.contains(e.relatedTarget)) {
        dropTarget.classList.remove('drag-over');
        delete dropTarget.dataset.dragHint;
      }
    });

    dropTarget.addEventListener('drop', (e) => {
      e.preventDefault();
      dropTarget.classList.remove('drag-over');
      delete dropTarget.dataset.dragHint;
      
      // Debug: log all available data types
      console.log('Available data types:', Array.from(e.dataTransfer.types));
      
      // Get all the URIs from the drop event
      let uris = [];
      
      // Check multiple data types for file URIs
      const resourceUrlsData = e.dataTransfer.getData('resourceurls');
      const vscodeUriListData = e.dataTransfer.getData('application/vnd.code.uri-list');
      const uriListData = e.dataTransfer.getData('text/uri-list');
      const plainTextData = e.dataTransfer.getData('text/plain');
      
      // Log all data types for debugging
      console.log('resourceurls:', resourceUrlsData);
      console.log('application/vnd.code.uri-list:', vscodeUriListData);
      console.log('text/uri-list:', uriListData);
      console.log('text/plain:', plainTextData);
      
      // Try 'resourceurls' first (used for multi-select)
      if (resourceUrlsData) {
        try {
          uris = JSON.parse(resourceUrlsData);
          uris = uris.map(uri => decodeURIComponent(uri));
        } catch (error) {
          console.error('Failed to parse resourceurls JSON:', error);
          uris = [];
        }
      }
      
      // Fallback to 'application/vnd.code.uri-list' (newline separated)
      if (uris.length === 0 && vscodeUriListData) {
        uris = vscodeUriListData.split('\n').map(uri => uri.trim());
      }
      
      // Try text/uri-list (common for file drops)
      if (uris.length === 0 && uriListData) {
        uris = uriListData.split('\n').map(uri => uri.trim()).filter(uri => uri);
      }
      
      // Try plain text (some systems use this for file:// URLs)
      if (uris.length === 0 && plainTextData && plainTextData.startsWith('file://')) {
        uris = plainTextData.split('\n').map(uri => uri.trim()).filter(uri => uri);
      }
      
      // Filter for valid schemes (file or vscode-file) and non-empty strings
      const validUris = uris.filter(uri => uri && (uri.startsWith('vscode-file:') || uri.startsWith('file://')));
      
      if (validUris.length > 0) {
        console.log('Found valid URIs:', validUris);
        
        // Separate image URIs from other file URIs
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
        const imageUris = [];
        const fileUris = [];
        
        validUris.forEach(uri => {
          const lowerUri = uri.toLowerCase();
          const isImage = imageExtensions.some(ext => lowerUri.endsWith(ext));
          
          if (isImage) {
            imageUris.push(uri);
          } else {
            fileUris.push(uri);
          }
        });
        
        // Handle image URIs
        if (imageUris.length > 0) {
          console.log('Found image URIs:', imageUris);
          // Send image URIs to extension for path resolution
          vscode.postMessage({
            command: 'resolveDroppedImages',
            uris: imageUris
          });
        }
        
        // Handle regular file URIs
        if (fileUris.length > 0) {
          console.log('Found file URIs:', fileUris);
          // Send file URIs to extension for path resolution
          vscode.postMessage({
            command: 'resolveDroppedPaths',
            uris: fileUris
          });
        }
        
        return;
      }
      
      // Handle external file drops from Finder/File Manager using the File API
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        console.log('Files dropped:', files.length);
        
        // Separate image and non-image files
        const imageFiles = [];
        const nonImageFiles = [];
        
        Array.from(files).forEach(file => {
          if (file.type && file.type.startsWith('image/')) {
            imageFiles.push(file);
          } else {
            nonImageFiles.push(file);
          }
        });
        
        // Handle images for preview
        if (imageFiles.length > 0) {
          // For external drops, we need to read the file content and save to temp
          // Since we can't access the full path in webview
          imageFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
              pendingImages.push({
                name: file.name,
                type: file.type,
                data: e.target.result,
                isFromClipboard: false,
                // Mark as external drop so it gets saved to temp
                isExternalDrop: true
              });
              updateImagePreview();
            };
            reader.onerror = (error) => {
              console.error('Error reading file:', error);
              vscode.postMessage({
                command: 'showError',
                message: `Failed to read file: ${file.name}`
              });
            };
            reader.readAsDataURL(file);
          });
        }
        
        // Create file paths for mentions (just the filename since we can't access full path)
        if (nonImageFiles.length > 0) {
          const filePaths = nonImageFiles.map(file => file.name);
          insertDroppedPaths(filePaths);
        }
        
        return;
      }
      
      // Handle text drops
      const text = e.dataTransfer.getData('text');
      if (text) {
        // Insert text directly at cursor position
        const currentValue = messageInputElement.value;
        const cursorPos = messageInputElement.selectionStart;
        const newValue = currentValue.slice(0, cursorPos) + text + currentValue.slice(cursorPos);
        messageInputElement.value = newValue;
        
        // Update cursor position
        const newCursorPos = cursorPos + text.length;
        messageInputElement.setSelectionRange(newCursorPos, newCursorPos);
        
        // Update highlights and resize
        updateHighlights();
        autoResizeTextarea();
        messageInputElement.focus();
      }
    });
  }
  
  // Function to insert dropped file/folder paths as mentions
  function insertDroppedPaths(paths) {
    if (!messageInputElement || paths.length === 0) return;
    
    const currentValue = messageInputElement.value;
    const cursorPosition = messageInputElement.selectionStart;
    
    // Build the mentions string
    const mentions = paths.map(path => `@${path}`).join(' ');
    
    // Insert at cursor position
    const beforeCursor = currentValue.slice(0, cursorPosition);
    const afterCursor = currentValue.slice(cursorPosition);
    
    // Add space before if needed
    const needsSpaceBefore = beforeCursor.length > 0 && !beforeCursor.endsWith(' ') && !beforeCursor.endsWith('\n');
    const spaceBefore = needsSpaceBefore ? ' ' : '';
    
    // Add space after if needed
    const needsSpaceAfter = afterCursor.length > 0 && !afterCursor.startsWith(' ') && !afterCursor.startsWith('\n');
    const spaceAfter = needsSpaceAfter ? ' ' : '';
    
    // Construct the new value
    const newValue = beforeCursor + spaceBefore + mentions + spaceAfter + afterCursor;
    messageInputElement.value = newValue;
    
    // Set cursor position after the inserted mentions
    const newCursorPosition = cursorPosition + spaceBefore.length + mentions.length + spaceAfter.length;
    messageInputElement.setSelectionRange(newCursorPosition, newCursorPosition);
    
    // Update highlights and resize
    updateHighlights();
    autoResizeTextarea();
    
    // Focus the input
    messageInputElement.focus();
  }

  // Add keyboard shortcut for image paste (Ctrl/Cmd+V)
  document.addEventListener('paste', (e) => {
    // Skip if we're in the message input (let regular paste work)
    if (document.activeElement === messageInputElement) {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageItems = Array.from(items).filter(item => 
        item.type.startsWith('image/')
      );

      if (imageItems.length > 0) {
        e.preventDefault();
        
        imageItems.forEach(item => {
          const file = item.getAsFile();
          if (file) {
            handleImageSelection([file], true); // Mark as clipboard image
          }
        });
      }
    }
  });
  
  // Problem selector state
  let problemSelectorVisible = false;
  let currentProblems = [];
  let selectedProblemIds = [];
  let currentMentionsRequestId = null;
  
  // Function to show problem selector
  function showProblemSelector() {
    problemSelectorVisible = true;
    
    // Request problems from the backend
    const requestId = `problems-${Date.now()}`;
    currentMentionsRequestId = requestId;
    
    vscode.postMessage({
      command: 'getProblems',
      mentionsRequestId: requestId
    });
    
    // Show loading state
    renderProblemSelector([]);
  }
  
  // Function to render problem selector
  function renderProblemSelector(problems) {
    // Remove any existing problem selector
    const existingSelector = document.getElementById('global-problem-selector');
    if (existingSelector) {
      existingSelector.remove();
    }
    
    if (!problemSelectorVisible) {
      return;
    }
    
    // Create problem selector element
    const problemSelector = document.createElement('div');
    problemSelector.id = 'global-problem-selector';
    problemSelector.className = 'problem-selector-menu';
    
    // Get input container position for menu placement (similar to context menu)
    const inputContainer = document.querySelector('.input-container');
    const inputRect = inputContainer ? inputContainer.getBoundingClientRect() : document.getElementById('messageInput').getBoundingClientRect();
    
    // Position menu below input field (similar to context menu)
    problemSelector.style.position = 'fixed';
    problemSelector.style.top = `${inputRect.bottom + 4}px`;
    problemSelector.style.left = `${inputRect.left}px`;
    problemSelector.style.width = `${inputRect.width}px`;
    problemSelector.style.maxHeight = '300px';
    problemSelector.style.zIndex = '10000';
    
    let menuContent = '';
    
    if (problems.length === 0) {
      menuContent = `
        <div class="problem-menu-header">
          <span class="problem-menu-title">Loading problems...</span>
        </div>
      `;
    } else {
      // Header with count and controls
      menuContent = `
        <div class="problem-menu-header">
          <span class="problem-menu-title">Select Problems (${problems.length} total)</span>
          <div class="problem-menu-controls">
            <button class="problem-menu-btn" id="select-all-btn">All</button>
            <button class="problem-menu-btn" id="select-none-btn">None</button>
            <button class="problem-menu-btn primary" id="confirm-selection-btn">OK</button>
          </div>
        </div>
        <div class="problem-menu-list">
      `;
      
      // Problem menu items (shortened format)
      problems.forEach((problem, index) => {
        const isSelected = selectedProblemIds.includes(index.toString());
        const fileName = problem.file.split('/').pop() || problem.file;
        const severityClass = problem.severity.toLowerCase();
        const shortMessage = problem.message.length > 60 ? 
          problem.message.substring(0, 60) + '...' : 
          problem.message;
        
        menuContent += `
          <div class="problem-menu-item ${isSelected ? 'selected' : ''}" data-problem-id="${index}">
            <div class="problem-menu-checkbox">
              <input type="checkbox" id="problem-${index}" ${isSelected ? 'checked' : ''}>
            </div>
            <div class="problem-menu-content">
              <div class="problem-menu-info">
                <span class="problem-menu-severity ${severityClass}">${problem.severity.charAt(0)}</span>
                <span class="problem-menu-location">${fileName}:${problem.line}</span>
              </div>
              <div class="problem-menu-message">${shortMessage}</div>
            </div>
          </div>
        `;
      });
      
      menuContent += '</div>';
    }
    
    problemSelector.innerHTML = menuContent;
    document.body.appendChild(problemSelector);
    
    // Add event listeners for buttons
    const selectAllBtn = document.getElementById('select-all-btn');
    const selectNoneBtn = document.getElementById('select-none-btn');
    const confirmBtn = document.getElementById('confirm-selection-btn');
    
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectAllProblems();
      });
    }
    
    if (selectNoneBtn) {
      selectNoneBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectNoneProblems();
      });
    }
    
    if (confirmBtn) {
      confirmBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        confirmProblemSelection();
      });
    }
    
    // Add event listeners for problem items
    const problemItems = document.querySelectorAll('.problem-menu-item');
    problemItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const problemId = item.getAttribute('data-problem-id');
        if (problemId) {
          toggleProblemSelection(problemId);
        }
      });
    });
  }
  
  // Problem selector helper functions
  function selectAllProblems() {
    selectedProblemIds = currentProblems.map((_, index) => index.toString());
    renderProblemSelector(currentProblems);
  }
  
  function selectNoneProblems() {
    selectedProblemIds = [];
    renderProblemSelector(currentProblems);
  }
  
  function toggleProblemSelection(problemId) {
    const index = selectedProblemIds.indexOf(problemId);
    if (index === -1) {
      selectedProblemIds.push(problemId);
    } else {
      selectedProblemIds.splice(index, 1);
    }
    // Update the checkbox and visual state
    const checkbox = document.querySelector(`#problem-${problemId}`);
    if (checkbox) {
      checkbox.checked = selectedProblemIds.includes(problemId);
    }
    const problemItem = document.querySelector(`[data-problem-id="${problemId}"]`);
    if (problemItem) {
      if (selectedProblemIds.includes(problemId)) {
        problemItem.classList.add('selected');
      } else {
        problemItem.classList.remove('selected');
      }
    }
  }
  
  function confirmProblemSelection() {
    if (selectedProblemIds.length === 0) {
      cancelProblemSelection();
      return;
    }
    
    // Filter selected problems and add to pending
    const selectedProblems = currentProblems.filter((_, index) => 
      selectedProblemIds.includes(index.toString())
    ).map((problem, index) => ({
      id: selectedProblemIds[index],
      originalIndex: selectedProblemIds[index],
      file: problem.file,
      line: problem.line,
      column: problem.column,
      severity: problem.severity,
      message: problem.message,
      source: problem.source
    }));
    
    // Add to pending problems (avoid duplicates)
    selectedProblems.forEach(problem => {
      const exists = pendingProblems.some(p => 
        p.file === problem.file && 
        p.line === problem.line && 
        p.column === problem.column &&
        p.message === problem.message
      );
      if (!exists) {
        pendingProblems.push(problem);
      }
    });
    
    // Update problem preview
    updateProblemPreview();
    
    // Close selector
    closeProblemSelector();
  }
  
  function cancelProblemSelection() {
    closeProblemSelector();
  }
  
  function closeProblemSelector() {
    problemSelectorVisible = false;
    selectedProblemIds = [];
    currentProblems = [];
    renderProblemSelector([]);
  }

  // Handle messages from extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    
    switch (message.type) {
      case 'problemsResults':
        if (message.mentionsRequestId === currentMentionsRequestId) {
          currentProblems = message.problems || [];
          selectedProblemIds = []; // Reset selection
          renderProblemSelector(currentProblems);
        }
        break;
        
      case 'fileSearchResults':
        // Handle file search results for context menu
        if (message.results) {
          searchResults = message.results;
          isSearchLoading = false;
          if (contextMenuVisible) {
            renderContextMenu();
          }
        }
        break;
        
      case 'commitSearchResults':
        // Handle commit search results for context menu
        if (message.commits) {
          searchResults = message.commits.map(commit => ({
            type: 'git',
            path: commit.hash,
            label: commit.message,
            description: `${commit.hash.substring(0, 7)} - ${commit.author}`
          }));
          isSearchLoading = false;
          if (contextMenuVisible) {
            renderContextMenu();
          }
        }
        break;
        
      case 'droppedPathsResolved':
        if (message.paths && message.paths.length > 0) {
          insertDroppedPaths(message.paths);
        }
        break;
        
      case 'droppedImagesResolved':
        if (message.imagePaths && message.imagePaths.length > 0) {
          // Add resolved images to pending images
          message.imagePaths.forEach(imagePath => {
            pendingImages.push({
              name: imagePath.split('/').pop() || 'image',
              path: imagePath,
              isFromClipboard: false,
              isExternalDrop: false
            });
          });
          updateImagePreview();
        }
        break;
        
      case 'imageFilesSelected':
        if (message.imagePaths && message.imagePaths.length > 0) {
          // Add selected images to pending images
          message.imagePaths.forEach(imagePath => {
            pendingImages.push({
              name: imagePath.split('/').pop() || 'image',
              path: imagePath,
              isFromClipboard: false,
              isExternalDrop: false
            });
          });
          updateImagePreview();
        }
        break;
        
      case 'customCommandsUpdated':
        if (message.customCommands) {
          updateCustomCommands(message.customCommands);
        }
        break;
        
      case 'terminalStatus':
        // Update terminal status banner
        if (terminalStatusBanner) {
          if (message.isTerminalClosed) {
            terminalStatusBanner.classList.remove('hidden');
          } else {
            terminalStatusBanner.classList.add('hidden');
          }
        }
        break;
        
      case 'focusInput':
        // Focus the input field
        if (messageInputElement) {
          messageInputElement.focus();
        }
        break;
        
      case 'addTextToInput':
        // Add text to input field
        if (messageInputElement && message.text) {
          const currentValue = messageInputElement.value;
          const needsSpace = currentValue.length > 0 && !currentValue.endsWith(' ') && !currentValue.endsWith('\n');
          messageInputElement.value = currentValue + (needsSpace ? ' ' : '') + message.text;
          messageInputElement.focus();
          
          // Update cursor to end
          messageInputElement.setSelectionRange(messageInputElement.value.length, messageInputElement.value.length);
          
          // Update highlights and resize
          updateHighlights();
          autoResizeTextarea();
        }
        break;
    }
  });

  // Dynamic layout handling
  let resizeTimeout;
  let resizeObserver;
  let isUpdating = false; // Prevent infinite loops

  function updateContainerHeight() {
    if (isUpdating) return; // Prevent infinite loops
    
    const container = document.querySelector('.chat-container');
    if (!container) return;

    isUpdating = true;

    // Use viewport height for VSCode webview
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    
    // Set CSS custom property for dynamic height
    document.documentElement.style.setProperty('--webview-height', `${viewportHeight}px`);
    document.documentElement.style.setProperty('--webview-width', `${viewportWidth}px`);
    
    // Force layout recalculation
    container.style.height = `${viewportHeight}px`;
    container.style.maxHeight = `${viewportHeight}px`;
    container.style.minHeight = `${viewportHeight}px`;
    
    console.log(`[UI FIX] Container updated - width: ${viewportWidth}px, height: ${viewportHeight}px`);
    
    // Check if we're in a narrow width scenario
    if (viewportWidth < 400) {
      console.log(`[UI FIX] Narrow width detected (${viewportWidth}px)`);
      container.classList.add('narrow-width');
      
      // Ensure Direct Mode container can expand (the CSS fix should handle this now)
      const directModeContainer = document.querySelector('.direct-mode-container');
      if (directModeContainer && !directModeContainer.classList.contains('hidden')) {
        // The CSS max-height: none !important should fix the expansion issue
        console.log(`[UI FIX] Direct Mode container found - CSS should now allow expansion`);
      }
    } else {
      container.classList.remove('narrow-width');
    }
    
    // Force a reflow and reset the flag
    container.offsetHeight;
    setTimeout(() => { isUpdating = false; }, 100);
  }

  function handleResize() {
    // Debounce resize events
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      updateContainerHeight();
    }, 16); // ~60fps
  }

  function setupResizeHandling() {
    // Add window resize listener
    window.addEventListener('resize', handleResize);
    
    // Use ResizeObserver for more reliable container tracking
    if (window.ResizeObserver) {
      const container = document.querySelector('.chat-container');
      if (container) {
        resizeObserver = new ResizeObserver((entries) => {
          for (let entry of entries) {
            const height = entry.contentRect.height;
            const width = entry.contentRect.width;
            
            if (height > 0 || width > 0) {
              console.log(`[ResizeObserver] Detected dimensions - width: ${width}px, height: ${height}px`);
              
              // Update container if either dimension changed significantly
              const heightDiff = Math.abs(container.offsetHeight - height);
              const widthDiff = Math.abs(container.offsetWidth - width);
              
              if (heightDiff > 5 || widthDiff > 5) {
                console.log(`[ResizeObserver] Significant size change detected, updating layout`);
                updateContainerHeight();
              }
            }
          }
        });
        resizeObserver.observe(container);
        
        // Also observe the body element to catch external resizing
        resizeObserver.observe(document.body);
      }
    }
    
    // Simplified MutationObserver (less aggressive since CSS fix should resolve the issue)
    if (window.MutationObserver) {
      const mutationObserver = new MutationObserver((mutations) => {
        let needsUpdate = false;
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && 
              mutation.attributeName === 'style' && 
              !isUpdating) {
            needsUpdate = true;
          }
        });
        
        if (needsUpdate) {
          console.log(`[MutationObserver] External style change detected`);
          setTimeout(updateContainerHeight, 200);
        }
      });
      
      // Only observe the body for style changes
      mutationObserver.observe(document.body, { attributes: true, attributeFilter: ['style'] });
    }
    
    // Initial sizing
    updateContainerHeight();
    
    // Force another update after a short delay to handle VSCode timing
    setTimeout(updateContainerHeight, 100);
    setTimeout(updateContainerHeight, 300);
    setTimeout(updateContainerHeight, 600); // Additional delay for slow loading
  }

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
      // Initially set to the minimum height
      messageInputElement.style.height = '48px';
      
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
    
    // Initialize mode UI (start in terminal mode)
    updateModeUI();
    
    // Setup resize handling for proper layout
    setupResizeHandling();
  }
  
  // Handle page visibility changes (when VSCode switches tabs)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // Re-calculate layout when webview becomes visible
      setTimeout(updateContainerHeight, 50);
    }
  });
  
  // Run initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();