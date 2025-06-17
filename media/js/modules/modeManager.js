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

// Event listener tracking for cleanup
let eventListeners = [];
let isInitialized = false;

/**
 * Initialize the mode manager module
 */
export function initializeModeManager(elements, vscodeApi) {
  console.log('Initializing mode manager...');
  
  // Clean up existing event listeners if already initialized
  if (isInitialized) {
    cleanup();
  }
  
  // Validate required elements
  if (!elements || !vscodeApi) {
    console.error('Mode manager initialization failed: missing elements or vscode API');
    return;
  }
  
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
  
  // Validate critical elements
  if (!mainModeToggleElement) {
    console.error('Mode manager: mainModeToggle element not found');
  }
  
  setupEventListeners();
  isInitialized = true;
  console.log('Mode manager initialized successfully');
}

/**
 * Sets up mode-related event listeners
 */
function setupEventListeners() {
  console.log('Setting up mode manager event listeners...');
  
  // Helper function to add tracked event listeners
  function addTrackedEventListener(element, event, handler, elementName) {
    if (element) {
      console.log(`Adding ${event} listener to ${elementName}`);
      element.addEventListener(event, handler);
      eventListeners.push({ element, event, handler });
    } else {
      console.warn(`${elementName} element not found when setting up event listener`);
    }
  }

  // Event listener for main mode toggle switch
  const toggleHandler = () => {
    console.log('🔄 Mode toggle clicked! Current checked state:', mainModeToggleElement.checked);
    console.log('🔄 Previous isDirectMode:', isDirectMode);
    isDirectMode = mainModeToggleElement.checked;
    console.log('🔄 New isDirectMode:', isDirectMode);
    console.log('🔄 About to call updateModeUI...');
    updateModeUI();
    console.log('🔄 updateModeUI completed');
    
    if (vscode) {
      vscode.postMessage({
        command: 'toggleMainMode',
        isDirectMode: isDirectMode
      });
      console.log('🔄 Sent toggleMainMode message to backend');
    } else {
      console.error('vscode API not available for mode toggle');
    }
  };
  addTrackedEventListener(mainModeToggleElement, 'change', toggleHandler, 'mainModeToggle');

  // Event listener for clear responses button
  const clearHandler = () => {
    clearDirectModeConversation();
  };
  addTrackedEventListener(clearResponsesBtn, 'click', clearHandler, 'clearResponsesBtn');

  // Event listener for pause process button
  const pauseHandler = () => {
    pauseCurrentProcess();
  };
  addTrackedEventListener(pauseProcessBtn, 'click', pauseHandler, 'pauseProcessBtn');

  // Listen for custom events
  const loadingIndicatorHandler = (e) => {
    updateLoadingIndicator(e.detail.isRunning);
  };
  addTrackedEventListener(document, 'updateLoadingIndicator', loadingIndicatorHandler, 'document (updateLoadingIndicator)');

  // Add scroll listener for Direct Mode messages container
  const directModeMessages = document.getElementById('directModeMessages');
  if (directModeMessages) {
    let scrollTimeout;
    const scrollHandler = () => {
      // Debounce scroll events to avoid conflicts with auto-scroll
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        // Hide new message indicator when user manually scrolls to bottom
        if (isUserNearBottom(directModeMessages)) {
          console.log('User manually scrolled to bottom, hiding indicator');
          hideNewMessageIndicator();
        }
      }, 100);
    };
    addTrackedEventListener(directModeMessages, 'scroll', scrollHandler, 'directModeMessages (scroll)');
  }
  
  console.log(`Set up ${eventListeners.length} event listeners for mode manager`);
}

/**
 * Cleanup function to remove all event listeners
 */
function cleanup() {
  console.log('Cleaning up mode manager event listeners...');
  
  eventListeners.forEach(({ element, event, handler }, index) => {
    try {
      element.removeEventListener(event, handler);
      console.log(`Removed event listener ${index + 1}`);
    } catch (error) {
      console.warn(`Failed to remove event listener ${index + 1}:`, error);
    }
  });
  
  eventListeners = [];
  isInitialized = false;
  console.log('Mode manager cleanup completed');
}

/**
 * Export cleanup function for external use
 */
export function cleanupModeManager() {
  cleanup();
}

/**
 * Updates the UI based on current mode state
 */
export function updateModeUI() {
  console.log('🎨 updateModeUI called, isDirectMode:', isDirectMode);
  
  // Update mode toggle labels - set active state based on isDirectMode
  const terminalLabel = document.querySelector('.mode-label[data-mode="terminal"]');
  const directLabel = document.querySelector('.mode-label[data-mode="direct"]');
  
  console.log('🎨 Found labels:', { terminalLabel: !!terminalLabel, directLabel: !!directLabel });
  
  if (terminalLabel && directLabel) {
    if (isDirectMode) {
      terminalLabel.classList.remove('active');
      directLabel.classList.add('active');
      console.log('🎨 Applied active state to direct label');
    } else {
      terminalLabel.classList.add('active');
      directLabel.classList.remove('active');
      console.log('🎨 Applied active state to terminal label');
    }
  }

  console.log('🎨 Found elements:', { 
    directModeContainer: !!directModeContainer,
    terminalStatusBanner: !!terminalStatusBanner,
    utilityRow: !!utilityRow
  });

  if (isDirectMode) {
    // Direct Mode: Show chat interface, hide terminal elements
    console.log('🎨 Switching to Direct Mode UI...');
    if (directModeContainer) {
      directModeContainer.classList.remove('hidden');
      console.log('🎨 Removed hidden class from directModeContainer');
    } else {
      console.error('🎨 directModeContainer not found!');
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
      console.log('🎨 Hidden utility row');
    }
  } else {
    // Terminal Mode: Hide chat interface, show terminal elements
    console.log('🎨 Switching to Terminal Mode UI...');
    if (directModeContainer) {
      directModeContainer.classList.add('hidden');
      console.log('🎨 Added hidden class to directModeContainer');
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
      console.log('🎨 Showed utility row');
    }
  }
  
  // Bottom actions (@ and image buttons) are always visible in both modes
  if (inputBottomActions) {
    inputBottomActions.style.display = 'flex';
  }
  
  console.log('🎨 updateModeUI complete');
}

/**
 * Sets the current mode
 */
export function setDirectMode(enabled) {
  console.log(`setDirectMode called with enabled: ${enabled}, current isDirectMode: ${isDirectMode}`);
  
  isDirectMode = enabled;
  
  // Update toggle switch state
  if (mainModeToggleElement) {
    console.log(`Updating toggle switch to checked: ${isDirectMode}`);
    mainModeToggleElement.checked = isDirectMode;
  } else {
    console.error('mainModeToggleElement not found when setting direct mode');
  }
  
  console.log('Calling updateModeUI...');
  updateModeUI();
  console.log(`setDirectMode completed, isDirectMode is now: ${isDirectMode}`);
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
  
  // Show loading indicator immediately when process starts running
  if (running) {
    console.log('Showing loading indicator: process is running');
    updateLoadingIndicator(true);
  } else {
    console.log('Hiding loading indicator: process not running');
    updateLoadingIndicator(false);
    // Reset for next conversation
    hasReceivedClaudeResponse = false;
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
 * Ensures the loading indicator is positioned at the very bottom of the message container
 * This is a helper function to guarantee correct positioning
 */
function ensureLoadingIndicatorAtBottom() {
  if (!isDirectMode) return;
  
  const directModeMessages = document.getElementById('directModeMessages');
  if (!directModeMessages) return;
  
  const existingIndicator = directModeMessages.querySelector('.loading-indicator');
  if (!existingIndicator) return;
  
  // If indicator exists but is not the last child, move it to the end
  const lastChild = directModeMessages.lastElementChild;
  if (lastChild !== existingIndicator) {
    console.log('Moving loading indicator to bottom - it was not the last child');
    directModeMessages.appendChild(existingIndicator);
  }
}

/**
 * Updates the loading indicator for Direct Mode
 * Ensures the indicator is always positioned at the very bottom
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
  
  // Always remove ALL existing loading indicators to prevent duplicates
  const existingIndicators = directModeMessages.querySelectorAll('.loading-indicator');
  existingIndicators.forEach(indicator => indicator.remove());
  
  if (show) {
    // Add loading indicator at the very bottom (as the last child)
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = `
      <div class="loading-spinner"></div>
      <span class="loading-text">Claude is processing...</span>
    `;
    
    // Ensure it's always the last element by appending at the end
    directModeMessages.appendChild(loadingIndicator);
    
    // Double-check positioning with a small delay to handle race conditions
    setTimeout(() => {
      ensureLoadingIndicatorAtBottom();
    }, 0);
    
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
 * Ensures loading indicator is always positioned after the new message
 */
export function addMessageToDirectMode(type, content, timestamp, subtype, metadata, displayName, isUpdate, toolExecutionContext) {
  if (!isDirectMode) return;
  
  // Track that we've received a response from Claude (not user input)
  // Include system messages as they indicate Claude has started responding
  if (type !== 'user_input') {
    console.log('Setting hasReceivedClaudeResponse to true for message type:', type);
    hasReceivedClaudeResponse = true;
  }
  
  // First, add the message without worrying about the loading indicator
  addDirectModeMessage(type, content, timestamp, subtype, metadata, displayName, isUpdate, isProcessRunning, toolExecutionContext);
  
  // After the message is added, ensure loading indicator is at the bottom if needed
  // This ensures the indicator always appears after the last message
  if (isProcessRunning) {
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