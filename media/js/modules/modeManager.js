/**
 * Mode Manager Module
 * Handles Direct/Terminal mode switching and UI state management
 */

import { addDirectModeMessage, updateMessageToResult } from './messageHandler.js';
import { isUserNearBottom } from './utils.js';

// Mode state
let isDirectMode = false;
let isProcessRunning = false;

// Elements (will be set during initialization)
let mainModeToggleElement = null;
let directModeContainer = null;
let modeToggleButtonElement = null;
let terminalStatusBanner = null;
let launchOptionsContainer = null;
let utilityRow = null;
let inputBottomActions = null;
let clearResponsesBtn = null;
let pauseProcessBtn = null;
let vscode = null;

/**
 * Initialize the mode manager module
 */
export function initializeModeManager(elements, vscodeApi) {
  mainModeToggleElement = elements.mainModeToggle;
  directModeContainer = elements.directModeContainer;
  modeToggleButtonElement = elements.modeToggleButton;
  terminalStatusBanner = elements.terminalStatusBanner;
  launchOptionsContainer = elements.launchOptionsContainer;
  utilityRow = elements.utilityRow;
  inputBottomActions = elements.inputBottomActions;
  clearResponsesBtn = elements.clearResponsesBtn;
  pauseProcessBtn = elements.pauseProcessBtn;
  vscode = vscodeApi;
  
  setupEventListeners();
}

/**
 * Sets up mode-related event listeners
 */
function setupEventListeners() {
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

  // Event listener for clear responses button
  if (clearResponsesBtn) {
    clearResponsesBtn.addEventListener('click', () => {
      clearDirectModeConversation();
    });
  }

  // Listen for custom events
  document.addEventListener('updateLoadingIndicator', (e) => {
    updateLoadingIndicator(e.detail.isRunning);
  });
}

/**
 * Updates the UI based on current mode state
 */
export function updateModeUI() {
  // Update mode toggle labels - set active state based on isDirectMode
  const terminalLabel = document.querySelector('.mode-label[data-mode="terminal"]');
  const directLabel = document.querySelector('.mode-label[data-mode="direct"]');
  
  if (terminalLabel && directLabel) {
    if (isDirectMode) {
      terminalLabel.classList.remove('active');
      directLabel.classList.add('active');
    } else {
      terminalLabel.classList.add('active');
      directLabel.classList.remove('active');
    }
  }

  if (isDirectMode) {
    // Direct Mode: Show chat interface, hide terminal elements
    if (directModeContainer) {
      directModeContainer.classList.remove('hidden');
    }
    
    // Hide terminal-specific elements in Direct Mode
    if (modeToggleButtonElement) {
      modeToggleButtonElement.style.display = 'none';
    }
    if (launchOptionsContainer) {
      launchOptionsContainer.style.display = 'none';
    }
    if (terminalStatusBanner) {
      terminalStatusBanner.style.display = 'none';
    }
    if (utilityRow) {
      utilityRow.style.display = 'none';
    }
  } else {
    // Terminal Mode: Hide chat interface, show terminal elements
    if (directModeContainer) {
      directModeContainer.classList.add('hidden');
    }
    
    // Show terminal-specific elements in Terminal Mode
    if (modeToggleButtonElement) {
      modeToggleButtonElement.style.display = 'block';
    }
    if (launchOptionsContainer) {
      launchOptionsContainer.style.display = 'block';
    }
    if (terminalStatusBanner) {
      terminalStatusBanner.style.display = 'block';
    }
    if (utilityRow) {
      utilityRow.style.display = 'flex';
    }
  }
  
  // Bottom actions (@ and image buttons) are always visible in both modes
  if (inputBottomActions) {
    inputBottomActions.style.display = 'flex';
  }
}

/**
 * Sets the current mode
 */
export function setDirectMode(enabled) {
  isDirectMode = enabled;
  
  // Update toggle switch state
  if (mainModeToggleElement) {
    mainModeToggleElement.checked = isDirectMode;
  }
  
  updateModeUI();
}

/**
 * Gets the current mode state
 */
export function getIsDirectMode() {
  return isDirectMode;
}

/**
 * Sets the process running state
 */
export function setProcessRunning(running) {
  isProcessRunning = running;
  updateLoadingIndicator(running);
  updatePauseButtonVisibility(running);
}

/**
 * Gets the process running state
 */
export function getIsProcessRunning() {
  return isProcessRunning;
}

/**
 * Updates the loading indicator for Direct Mode
 */
function updateLoadingIndicator(show) {
  // Only show loading indicator in Direct Mode
  if (!isDirectMode) return;
  
  const directModeMessages = document.getElementById('directModeMessages');
  if (!directModeMessages) return;
  
  // Remove existing loading indicator
  const existingIndicator = directModeMessages.querySelector('.loading-indicator');
  if (existingIndicator) {
    existingIndicator.remove();
  }
  
  if (show) {
    // Add loading indicator at the bottom
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <span class="loading-text">Claude is processing...</span>
      </div>
    `;
    directModeMessages.appendChild(loadingIndicator);
    
    // Auto-scroll to bottom to show loading indicator
    if (isUserNearBottom(directModeMessages)) {
      directModeMessages.scrollTop = directModeMessages.scrollHeight;
    }
  }
}

/**
 * Updates pause button visibility based on process state
 */
function updatePauseButtonVisibility(processRunning) {
  if (pauseProcessBtn) {
    pauseProcessBtn.style.display = processRunning ? 'block' : 'none';
  }
}

/**
 * Adds a message to Direct Mode
 */
export function addMessageToDirectMode(type, content, timestamp, subtype, metadata, displayName, isUpdate, toolExecutionContext) {
  if (!isDirectMode) return;
  
  addDirectModeMessage(type, content, timestamp, subtype, metadata, displayName, isUpdate, isProcessRunning, toolExecutionContext);
  
  // Ensure loading indicator stays at the bottom if process is running
  if (isProcessRunning) {
    updateLoadingIndicator(true);
  }
}

/**
 * Handles user messages in Direct Mode
 */
export function handleDirectModeUserMessage(message) {
  if (!isDirectMode) return;
  
  const timestamp = Date.now();
  addDirectModeMessage('user_input', message, timestamp);
}

/**
 * Handles Claude responses in Direct Mode
 */
export function handleDirectModeResponse(type, content, timestamp, subtype, metadata, displayName, isUpdate, toolExecutionContext) {
  if (!isDirectMode) return;
  
  addDirectModeMessage(type, content, timestamp, subtype, metadata, displayName, isUpdate, isProcessRunning, toolExecutionContext);
}

/**
 * Clears the Direct Mode conversation
 */
function clearDirectModeConversation() {
  const directModeMessages = document.getElementById('directModeMessages');
  if (directModeMessages) {
    directModeMessages.innerHTML = `
      <div class="placeholder-message">
        Start a conversation with Claude by typing a message below.
      </div>
    `;
  }
  
  // Send clear command to extension
  vscode.postMessage({
    command: 'clearDirectMode'
  });
}

/**
 * Shows Direct Mode if not already visible
 */
export function showDirectMode() {
  if (!isDirectMode) {
    setDirectMode(true);
    vscode.postMessage({
      command: 'toggleMainMode',
      isDirectMode: true
    });
  }
}

/**
 * Hides Direct Mode (switches to Terminal Mode)
 */
export function hideDirectMode() {
  if (isDirectMode) {
    setDirectMode(false);
    vscode.postMessage({
      command: 'toggleMainMode',
      isDirectMode: false
    });
  }
}