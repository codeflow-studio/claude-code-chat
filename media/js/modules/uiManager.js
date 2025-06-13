/**
 * UI Manager Module
 * Handles layout, resize, and general UI management functionality
 */

import { MENTION_REGEX_GLOBAL } from './utils.js';

// UI state
let resizeTimeout;
let resizeObserver;
let isUpdating = false; // Prevent infinite loops

// Elements (will be set during initialization)
let messageInputElement = null;
let highlightLayerElement = null;
let terminalStatusBanner = null;
let imagePreviewContainer = null;
let problemPreviewContainer = null;

// Pending state arrays
let pendingImages = [];
let pendingProblems = [];

/**
 * Initialize the UI manager module
 */
export function initializeUIManager(elements) {
  messageInputElement = elements.messageInput;
  highlightLayerElement = elements.highlightLayer;
  terminalStatusBanner = elements.terminalStatusBanner;
  imagePreviewContainer = elements.imagePreviewContainer;
  problemPreviewContainer = elements.problemPreviewContainer;
  
  setupUIEventListeners();
  initializeUI();
}

/**
 * Sets up UI-related event listeners
 */
function setupUIEventListeners() {
  // Listen for custom events
  document.addEventListener('updateHighlights', updateHighlights);
  document.addEventListener('autoResizeTextarea', autoResizeTextarea);
  
  // Handle page visibility changes (when VSCode switches tabs)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // Re-calculate layout when webview becomes visible
      setTimeout(updateContainerHeight, 50);
    }
  });
}

/**
 * Initialize the UI components
 */
function initializeUI() {
  console.log("Initializing terminal input UI");
  
  // Check critical elements and log warnings if missing
  if (!messageInputElement) {
    console.warn("Message input element not found");
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
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
      chatContainer.style.maxHeight = 'none';
    }
  }
  
  // Initialize highlight layer
  updateHighlights();
  
  // Setup resize handling for proper layout
  setupResizeHandling();
}

/**
 * Updates highlights in the text area for @mentions
 */
export function updateHighlights() {
  if (!highlightLayerElement || !messageInputElement) return;

  let processedText = messageInputElement.value;

  // Replace special characters with HTML entities for safety
  processedText = processedText
    .replace(/\n$/, '\n\n')
    .replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] || c)
    // Highlight @mentions
    .replace(MENTION_REGEX_GLOBAL, '<mark class="mention-highlight">$&</mark>');

  highlightLayerElement.innerHTML = processedText;
  // Match scroll position
  highlightLayerElement.scrollTop = messageInputElement.scrollTop;
  highlightLayerElement.scrollLeft = messageInputElement.scrollLeft;
}

/**
 * Automatically resizes textarea based on content
 */
export function autoResizeTextarea() {
  if (!messageInputElement) return;

  // Store current scroll position
  const scrollTop = messageInputElement.scrollTop;
  
  // Reset height to auto to get the correct scrollHeight
  messageInputElement.style.height = 'auto';
  
  // Calculate the new height (minimum 48px, maximum 200px)
  const minHeight = 48;
  const maxHeight = 200;
  const newHeight = Math.min(Math.max(messageInputElement.scrollHeight, minHeight), maxHeight);
  
  // Set the new height
  messageInputElement.style.height = newHeight + 'px';
  
  // Restore scroll position if content was scrollable
  if (newHeight === maxHeight) {
    messageInputElement.scrollTop = scrollTop;
  }
  
  // Update highlights to match new size
  updateHighlights();
}

/**
 * Updates container height for proper layout
 */
export function updateContainerHeight() {
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

/**
 * Handles resize events with debouncing
 */
function handleResize() {
  // Debounce resize events
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    updateContainerHeight();
  }, 16); // ~60fps
}

/**
 * Sets up resize handling with observers
 */
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

/**
 * Updates image preview display
 */
export function updateImagePreview(images) {
  pendingImages = images || [];
  
  if (!imagePreviewContainer) return;

  if (pendingImages.length === 0) {
    imagePreviewContainer.style.display = 'none';
    imagePreviewContainer.innerHTML = '';
    return;
  }

  imagePreviewContainer.style.display = 'block';
  
  const previewHTML = pendingImages.map((image, index) => `
    <div class="image-preview-item" data-index="${index}">
      <img src="${image.data || image.path}" alt="${image.name}" class="image-preview-thumbnail" />
      <div class="image-preview-info">
        <span class="image-name">${image.name}</span>
        ${image.isFromClipboard ? '<span class="image-source">📋 Clipboard</span>' : ''}
        ${image.isExternalDrop ? '<span class="image-source">📁 External</span>' : ''}
      </div>
      <button class="image-remove-btn" onclick="removeImage(${index})" title="Remove image">×</button>
    </div>
  `).join('');
  
  imagePreviewContainer.innerHTML = previewHTML;
}

/**
 * Updates problem preview display
 */
export function updateProblemPreview(problems) {
  pendingProblems = problems || [];
  
  if (!problemPreviewContainer) return;

  if (pendingProblems.length === 0) {
    problemPreviewContainer.style.display = 'none';
    problemPreviewContainer.innerHTML = '';
    return;
  }

  problemPreviewContainer.style.display = 'block';
  
  const previewHTML = pendingProblems.map((problem, index) => `
    <div class="problem-preview-item" data-index="${index}">
      <div class="problem-preview-info">
        <span class="problem-severity ${problem.severity}">${problem.severity.toUpperCase()}</span>
        <span class="problem-message">${problem.message}</span>
        <span class="problem-location">${problem.file}:${problem.line}</span>
      </div>
      <button class="problem-remove-btn" onclick="removeProblem(${index})" title="Remove problem">×</button>
    </div>
  `).join('');
  
  problemPreviewContainer.innerHTML = previewHTML;
}

/**
 * Focuses the message input element
 */
export function focusInput() {
  if (messageInputElement) {
    messageInputElement.focus();
  }
}

/**
 * Clears the message input
 */
export function clearInput() {
  if (messageInputElement) {
    messageInputElement.value = '';
    autoResizeTextarea();
    updateHighlights();
  }
}

/**
 * Gets the current input value
 */
export function getInputValue() {
  return messageInputElement ? messageInputElement.value : '';
}

/**
 * Sets the input value
 */
export function setInputValue(value) {
  if (messageInputElement) {
    messageInputElement.value = value;
    autoResizeTextarea();
    updateHighlights();
  }
}

/**
 * Gets the current cursor position
 */
export function getCursorPosition() {
  return messageInputElement ? messageInputElement.selectionStart : 0;
}

/**
 * Sets the cursor position
 */
export function setCursorPosition(position) {
  if (messageInputElement) {
    messageInputElement.setSelectionRange(position, position);
  }
}

/**
 * Cleanup function for observers
 */
export function cleanup() {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  clearTimeout(resizeTimeout);
}