/**
 * Mode Manager Module
 * Handles Direct/Terminal mode switching and UI state management
 */

import { addDirectModeMessage, updateMessageToResult } from './messageHandler.js';
import { isUserNearBottom, hideNewMessageIndicator } from './utils.js';

// Mode state
let isDirectMode = false;
let isProcessRunning = false;
let hasReceivedClaudeResponse = false;

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

  // Event listener for pause process button
  if (pauseProcessBtn) {
    pauseProcessBtn.addEventListener('click', () => {
      pauseCurrentProcess();
    });
  }

  // Listen for custom events
  document.addEventListener('updateLoadingIndicator', (e) => {
    updateLoadingIndicator(e.detail.isRunning);
  });

  // Add scroll listener for Direct Mode messages container
  const directModeMessages = document.getElementById('directModeMessages');
  if (directModeMessages) {
    let scrollTimeout;
    directModeMessages.addEventListener('scroll', () => {
      // Debounce scroll events to avoid conflicts with auto-scroll
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        // Hide new message indicator when user manually scrolls to bottom
        if (isUserNearBottom(directModeMessages)) {
          console.log('User manually scrolled to bottom, hiding indicator');
          hideNewMessageIndicator();
        }
      }, 100);
    });
  }
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
  console.log('setProcessRunning called:', { running, hasReceivedClaudeResponse, isDirectMode });
  isProcessRunning = running;
  
  // Only show loading indicator if we've received at least one Claude response
  // This prevents the indicator from appearing right after user input
  if (running && hasReceivedClaudeResponse) {
    console.log('Showing loading indicator: process running and has Claude response');
    updateLoadingIndicator(true);
  } else if (!running) {
    console.log('Hiding loading indicator: process not running');
    updateLoadingIndicator(false);
    // Reset for next conversation
    hasReceivedClaudeResponse = false;
  } else {
    console.log('Not showing loading indicator: waiting for first Claude response');
  }
  
  updatePauseButtonVisibility(running);
}

/**
 * Gets the process running state
 */
export function getIsProcessRunning() {
  return isProcessRunning;
}

/**
 * Notifies that a Claude response has been received
 */
export function notifyClaudeResponseReceived(messageType) {
  console.log('notifyClaudeResponseReceived called:', { messageType, hasReceivedClaudeResponse, isProcessRunning });
  
  // Track that we've received a response from Claude (not user input)
  if (messageType !== 'user_input') {
    console.log('Setting hasReceivedClaudeResponse to true for message type:', messageType);
    hasReceivedClaudeResponse = true;
    
    // Show loading indicator if process is still running
    if (isProcessRunning) {
      console.log('Calling updateLoadingIndicator(true) after Claude response');
      updateLoadingIndicator(true);
    }
  }
}

/**
 * Updates the loading indicator for Direct Mode
 */
function updateLoadingIndicator(show) {
  console.log('updateLoadingIndicator called:', { show, isDirectMode });
  
  // Only show loading indicator in Direct Mode
  if (!isDirectMode) return;
  
  const directModeMessages = document.getElementById('directModeMessages');
  if (!directModeMessages) {
    console.log('directModeMessages element not found');
    return;
  }
  
  // Remove existing loading indicator
  const existingIndicator = directModeMessages.querySelector('.loading-indicator');
  if (existingIndicator) {
    existingIndicator.remove();
  }
  
  if (show) {
    // Add loading indicator at the very bottom
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = `
      <div class="loading-spinner"></div>
      <span class="loading-text">Claude is processing...</span>
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
    if (processRunning) {
      pauseProcessBtn.classList.add('visible', 'pulsing');
    } else {
      pauseProcessBtn.classList.remove('visible', 'pulsing');
    }
  }
}

/**
 * Adds a message to Direct Mode
 */
export function addMessageToDirectMode(type, content, timestamp, subtype, metadata, displayName, isUpdate, toolExecutionContext) {
  if (!isDirectMode) return;
  
  // Track that we've received a response from Claude (not user input)
  // Include system messages as they indicate Claude has started responding
  if (type !== 'user_input') {
    console.log('Setting hasReceivedClaudeResponse to true for message type:', type);
    hasReceivedClaudeResponse = true;
  }
  
  // Remove loading indicator before adding message to prevent it from being in the wrong position
  const directModeMessages = document.getElementById('directModeMessages');
  if (directModeMessages && isProcessRunning) {
    const existingIndicator = directModeMessages.querySelector('.loading-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
  }
  
  addDirectModeMessage(type, content, timestamp, subtype, metadata, displayName, isUpdate, isProcessRunning, toolExecutionContext);
  
  // Show loading indicator at the bottom if process is running and we've received Claude responses
  if (isProcessRunning && hasReceivedClaudeResponse) {
    console.log('Calling updateLoadingIndicator(true) after adding message');
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
  
  // Reset the Claude response flag
  hasReceivedClaudeResponse = false;
  
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

/**
 * Pauses the current Claude Code process
 */
function pauseCurrentProcess() {
  // Send pause command to extension
  vscode.postMessage({
    command: 'pauseProcess'
  });
  
  // Update UI immediately to provide visual feedback
  setProcessRunning(false);
}