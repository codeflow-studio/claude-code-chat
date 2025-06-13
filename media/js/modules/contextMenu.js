/**
 * Context Menu Module
 * Handles @ mention context menu functionality and file/path searching
 */

import { 
  MENTION_REGEX_GLOBAL, 
  BASE_CONTEXT_ITEMS, 
  shouldShowContextMenu,
  debounce,
  escapeHtml
} from './utils.js';

// Context menu state
let contextMenuVisible = false;
let contextMenuSelectedIndex = -1;
let searchQuery = '';
let searchResults = [];
let currentSearchRequestId = '';
let isSearchLoading = false;

// Elements (will be set during initialization)
let messageInputElement = null;
let vscode = null;

/**
 * Initialize the context menu module
 */
export function initializeContextMenu(inputElement, vscodeApi) {
  messageInputElement = inputElement;
  vscode = vscodeApi;
}

/**
 * Shows the context menu for @ mentions
 */
export function showContextMenu(query, position) {
  contextMenuVisible = true;
  searchQuery = query;
  contextMenuSelectedIndex = 0;
  
  // Generate a unique request ID for this search
  currentSearchRequestId = Date.now().toString();
  
  // Start search if we have a query
  if (query && query.length > 0) {
    searchFilesDebounced(query, currentSearchRequestId);
  } else {
    // Reset search results and show base menu
    searchResults = [];
    isSearchLoading = false;
    renderContextMenu();
  }
}

/**
 * Hides the context menu
 */
export function hideContextMenu() {
  contextMenuVisible = false;
  renderContextMenu();
}

/**
 * Handles keyboard navigation in the context menu
 */
export function handleContextMenuKeydown(key) {
  if (!contextMenuVisible) return false;

  const items = Array.isArray(searchResults) && searchResults.length > 0
    ? searchResults : BASE_CONTEXT_ITEMS;

  switch (key) {
    case 'ArrowDown':
      contextMenuSelectedIndex = Math.min(contextMenuSelectedIndex + 1, items.length - 1);
      updateSelectedMenuItem();
      return true;
      
    case 'ArrowUp':
      contextMenuSelectedIndex = Math.max(contextMenuSelectedIndex - 1, 0);
      updateSelectedMenuItem();
      return true;
      
    case 'Enter':
    case 'Tab':
      if (contextMenuSelectedIndex >= 0) {
        handleContextMenuSelect(contextMenuSelectedIndex);
      }
      return true;
      
    case 'Escape':
      hideContextMenu();
      return true;
  }
  
  return false;
}

/**
 * Processes search results from the extension
 */
export function processSearchResults(results, requestId) {
  // Only update results if they match the current query or if there's no mentionsRequestId
  if (!requestId || requestId === currentSearchRequestId) {
    searchResults = results || [];
    isSearchLoading = false;
    
    // Reset the selected index when new results come in
    if (searchResults.length > 0) {
      contextMenuSelectedIndex = 0;
    }
    
    // Update the context menu
    renderContextMenu();
  }
}

/**
 * Processes commit search results from the extension
 */
export function processCommitResults(commits) {
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
}

/**
 * Renders the context menu
 */
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
  
  // Get input wrapper position for menu placement
  const inputWrapper = document.querySelector('.input-wrapper');
  const inputRect = inputWrapper ? inputWrapper.getBoundingClientRect() : messageInputElement.getBoundingClientRect();
  
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
  globalContextMenu.style.width = `${inputRect.width}px`;
  globalContextMenu.style.top = `${inputRect.bottom + window.scrollY + 4}px`;
  globalContextMenu.style.left = `${inputRect.left + window.scrollX}px`;
  
  // Append to body
  document.body.appendChild(globalContextMenu);
  
  // Ensure menu is fully rendered
  setTimeout(() => {
    globalContextMenu.style.display = 'block';
  }, 0);
  
  // Start with base items, add search results if available
  let menuItems = BASE_CONTEXT_ITEMS;
  
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

/**
 * Updates selected menu item visual state
 */
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

/**
 * Inserts a mention at the cursor position
 */
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

/**
 * Handles context menu selection
 */
function handleContextMenuSelect(index) {
  const items = Array.isArray(searchResults) && searchResults.length > 0
    ? searchResults.map(result => ({
        type: result.type,
        value: result.path,
        label: result.label || result.path.split('/').pop()
      }))
    : BASE_CONTEXT_ITEMS;
    
  if (index < 0 || index >= items.length) {
    return;
  }
  
  const selectedItem = items[index];
  
  // Special handling for problems - show problem selector instead of inserting mention
  if (selectedItem.type === 'problems') {
    // Hide context menu first
    hideContextMenu();
    
    // Dispatch event to show problem selector
    document.dispatchEvent(new CustomEvent('showProblemSelector'));
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
      messageInputElement.selectionStart,
      mentionValue
    );

    // Update the input value
    messageInputElement.value = newValue;
    
    // Update cursor position
    const newPosition = mentionIndex + mentionValue.length + 2; // +2 for the @ and the space after
    messageInputElement.setSelectionRange(newPosition, newPosition);
    messageInputElement.focus();
    
    // Dispatch events to update UI
    messageInputElement.dispatchEvent(new Event('input', { bubbles: true }));
    document.dispatchEvent(new CustomEvent('updateHighlights'));
    document.dispatchEvent(new CustomEvent('autoResizeTextarea'));
    
    // Hide context menu
    hideContextMenu();
  }
}

/**
 * Debounced search function
 */
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
}, 300);

// Export getters for state access
export function isContextMenuVisible() {
  return contextMenuVisible;
}

export function getContextMenuSelectedIndex() {
  return contextMenuSelectedIndex;
}

export function getSearchResults() {
  return searchResults;
}

export function getCurrentSearchQuery() {
  return searchQuery;
}