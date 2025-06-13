/**
 * Slash Commands Module
 * Handles slash command functionality and menu display
 */

import { 
  BUILT_IN_SLASH_COMMANDS, 
  filterSlashCommands, 
  shouldShowSlashCommands,
  updateCustomCommands
} from './utils.js';

// Slash command state
let slashCommandVisible = false;
let slashCommandSelectedIndex = -1;
let slashCommandQuery = '';
let slashCommands = [];
let ALL_SLASH_COMMANDS = [...BUILT_IN_SLASH_COMMANDS];
let CUSTOM_SLASH_COMMANDS = [];

// Elements (will be set during initialization)
let messageInputElement = null;
let vscode = null;

/**
 * Initialize the slash commands module
 */
export function initializeSlashCommands(inputElement, vscodeApi) {
  messageInputElement = inputElement;
  vscode = vscodeApi;
}

/**
 * Shows the slash command menu
 */
export function showSlashCommandMenu(query, isDirectMode) {
  // Don't show slash commands in Direct Mode
  if (isDirectMode) {
    return;
  }
  
  slashCommandVisible = true;
  slashCommandQuery = query;
  slashCommands = filterSlashCommands(query, ALL_SLASH_COMMANDS);
  slashCommandSelectedIndex = slashCommands.length > 0 ? 0 : -1;
  
  renderSlashCommandMenu();
}

/**
 * Hides the slash command menu
 */
export function hideSlashCommandMenu() {
  slashCommandVisible = false;
  renderSlashCommandMenu();
}

/**
 * Handles keyboard navigation in the slash command menu
 */
export function handleSlashCommandKeydown(key) {
  if (!slashCommandVisible) return false;

  switch (key) {
    case 'ArrowDown':
      slashCommandSelectedIndex = Math.min(slashCommandSelectedIndex + 1, slashCommands.length - 1);
      updateSelectedSlashMenuItem();
      return true;
      
    case 'ArrowUp':
      slashCommandSelectedIndex = Math.max(slashCommandSelectedIndex - 1, 0);
      updateSelectedSlashMenuItem();
      return true;
      
    case 'Enter':
    case 'Tab':
      if (slashCommandSelectedIndex >= 0) {
        handleSlashCommandSelect(slashCommandSelectedIndex);
      }
      return true;
      
    case 'Escape':
      hideSlashCommandMenu();
      return true;
  }
  
  return false;
}

/**
 * Updates custom commands from the extension
 */
export function updateSlashCommands(customCommands) {
  CUSTOM_SLASH_COMMANDS = updateCustomCommands(customCommands, ALL_SLASH_COMMANDS, BUILT_IN_SLASH_COMMANDS);
}

/**
 * Requests rescan of custom commands from extension
 */
export function rescanCustomCommands() {
  vscode.postMessage({
    command: 'rescanCustomCommands'
  });
}

/**
 * Renders the slash command menu
 */
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
  const inputRect = inputWrapper ? inputWrapper.getBoundingClientRect() : messageInputElement.getBoundingClientRect();
  
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

/**
 * Updates selected slash command menu item visual state
 */
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

/**
 * Handles slash command selection
 */
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
    
    // Dispatch events to update UI
    document.dispatchEvent(new CustomEvent('updateHighlights'));
    document.dispatchEvent(new CustomEvent('autoResizeTextarea'));
    
    // Hide slash command menu
    hideSlashCommandMenu();
  }
}

// Export getters for state access
export function isSlashCommandVisible() {
  return slashCommandVisible;
}

export function getSlashCommandSelectedIndex() {
  return slashCommandSelectedIndex;
}

export function getCurrentSlashCommands() {
  return slashCommands;
}

export function getAllSlashCommands() {
  return ALL_SLASH_COMMANDS;
}

export function getBuiltInSlashCommands() {
  return BUILT_IN_SLASH_COMMANDS;
}

export function getCustomSlashCommands() {
  return CUSTOM_SLASH_COMMANDS;
}