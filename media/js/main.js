/**
 * Main Entry Point for Claude Code Extension UI
 * Coordinates all modules and handles VSCode API communication
 */

// Import all modules
import { 
  extractFilePathsFromText,
  shouldShowSlashCommands,
  shouldShowContextMenu,
  BASE_CONTEXT_ITEMS
} from './modules/utils.js';

import { addDirectModeMessage } from './modules/messageHandler.js';

import { 
  initializeContextMenu,
  showContextMenu,
  hideContextMenu,
  handleContextMenuKeydown,
  processSearchResults,
  processCommitResults,
  isContextMenuVisible,
  getContextMenuSelectedIndex
} from './modules/contextMenu.js';

import {
  initializeSlashCommands,
  showSlashCommandMenu,
  hideSlashCommandMenu,
  handleSlashCommandKeydown,
  updateSlashCommands,
  rescanCustomCommands,
  isSlashCommandVisible,
  getSlashCommandSelectedIndex,
  getCurrentSlashCommands
} from './modules/slashCommands.js';

import {
  initializeDragAndDrop,
  handleImageSelection,
  processResolvedImages,
  processImageFilePaths,
  processResolvedPaths,
  getPendingImages,
  clearPendingImages,
  removeImage
} from './modules/dragAndDrop.js';

import {
  initializeModeManager,
  updateModeUI,
  setDirectMode,
  getIsDirectMode,
  setProcessRunning,
  getIsProcessRunning,
  addMessageToDirectMode,
  handleDirectModeUserMessage,
  handleDirectModeResponse,
  showDirectMode,
  hideDirectMode
} from './modules/modeManager.js';

import {
  initializeUIManager,
  updateHighlights,
  autoResizeTextarea,
  updateContainerHeight,
  updateImagePreview,
  updateProblemPreview,
  focusInput,
  clearInput,
  getInputValue,
  setInputValue,
  getCursorPosition,
  setCursorPosition
} from './modules/uiManager.js';

// Main application class
class ClaudeCodeUI {
  constructor() {
    // Get VS Code API
    this.vscode = acquireVsCodeApi();
    
    // Initialize state
    this.pendingImages = [];
    this.pendingProblems = [];
    this.currentSearchRequestId = '';
    this.justDeletedSpaceAfterMention = false;
    
    // Get DOM elements
    this.elements = this.getElements();
    
    // Initialize modules
    this.initializeModules();
    
    // Setup main event listeners
    this.setupEventListeners();
    
    // Setup message handlers
    this.setupMessageHandlers();
    
    // Initialize UI
    this.initializeUI();
  }

  /**
   * Gets all required DOM elements
   */
  getElements() {
    return {
      messageInput: document.getElementById('messageInput'),
      sendButton: document.getElementById('sendButton'),
      contextButton: document.getElementById('contextButton'),
      terminalStatusBanner: document.getElementById('terminalStatusBanner'),
      highlightLayer: document.getElementById('highlightLayer'),
      contextMenuContainer: document.getElementById('contextMenuContainer'),
      imageButton: document.getElementById('imageButton'),
      imageInput: document.getElementById('imageInput'),
      imagePreviewContainer: document.getElementById('imagePreviewContainer'),
      problemPreviewContainer: document.getElementById('problemPreviewContainer'),
      modeToggleButton: document.getElementById('modeToggleButton'),
      mainModeToggle: document.getElementById('mainModeToggle'),
      directModeContainer: document.getElementById('directModeContainer'),
      clearResponsesBtn: document.getElementById('clearResponsesBtn'),
      pauseProcessBtn: document.getElementById('pauseProcessBtn'),
      inputBottomActions: document.querySelector('.input-bottom-actions'),
      utilityRow: document.querySelector('.utility-row'),
      launchOptionsContainer: document.getElementById('launchOptionsContainer')
    };
  }

  /**
   * Initialize all modules with their dependencies
   */
  initializeModules() {
    // Initialize context menu
    initializeContextMenu(this.elements.messageInput, this.vscode);
    
    // Initialize slash commands
    initializeSlashCommands(this.elements.messageInput, this.vscode);
    
    // Initialize drag and drop
    initializeDragAndDrop(
      this.elements.messageInput, 
      this.elements.imagePreviewContainer, 
      this.vscode
    );
    
    // Initialize mode manager
    initializeModeManager(this.elements, this.vscode);
    
    // Initialize UI manager
    initializeUIManager(this.elements);
  }

  /**
   * Setup main event listeners
   */
  setupEventListeners() {
    // Message input event listeners
    if (this.elements.messageInput) {
      this.elements.messageInput.addEventListener('input', (e) => this.handleInputChange(e));
      this.elements.messageInput.addEventListener('keydown', (e) => this.handleKeyDown(e));
      this.elements.messageInput.addEventListener('scroll', updateHighlights);
    }

    // Send button
    if (this.elements.sendButton) {
      this.elements.sendButton.addEventListener('click', () => this.sendMessage());
    }

    // Context button
    if (this.elements.contextButton) {
      this.elements.contextButton.addEventListener('click', () => this.handleContextButtonClick());
    }

    // Image button
    if (this.elements.imageButton) {
      this.elements.imageButton.addEventListener('click', () => {
        if (this.elements.imageInput) {
          this.elements.imageInput.click();
        }
      });
    }

    // Image input
    if (this.elements.imageInput) {
      this.elements.imageInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleImageSelection(Array.from(e.target.files));
        }
      });
    }

    // Custom events
    document.addEventListener('showProblemSelector', () => this.showProblemSelector());
  }

  /**
   * Setup message handlers for VSCode communication
   */
  setupMessageHandlers() {
    window.addEventListener('message', (event) => {
      const message = event.data;
      
      switch (message.command) {
        case 'setDirectMode':
          setDirectMode(message.isDirectMode);
          break;
          
        case 'directModeUserMessage':
          handleDirectModeUserMessage(message.content);
          break;
          
        case 'directModeResponse':
          handleDirectModeResponse(
            message.response.type, 
            message.response.content, 
            message.response.timestamp, 
            message.response.subtype, 
            message.response.metadata, 
            message.response.displayName, 
            message.response.isUpdate
          );
          break;
          
        case 'updateProcessState':
          setProcessRunning(message.isRunning);
          break;
          
        case 'fileSearchResults':
          processSearchResults(message.results, message.mentionsRequestId);
          break;
          
        case 'commitSearchResults':
          processCommitResults(message.commits);
          break;
          
        case 'imageFilesSelected':
          processImageFilePaths(message.imagePaths);
          break;
          
        case 'droppedPathsResolved':
          processResolvedPaths(message.paths);
          break;
          
        case 'droppedImagesResolved':
          processResolvedImages(message.imagePaths);
          break;
          
        case 'customCommandsUpdated':
          updateSlashCommands(message.customCommands);
          break;
          
        case 'addTextToInput':
          this.handleAddTextToInput(message.text);
          break;
          
        case 'showProblems':
          this.showProblemSelector(message.problems);
          break;
          
        default:
          console.log('Unknown message command:', message.command);
      }
    });
  }

  /**
   * Initialize UI after all modules are set up
   */
  initializeUI() {
    updateModeUI();
    rescanCustomCommands();
  }

  /**
   * Handles input changes and updates UI accordingly
   */
  handleInputChange(e) {
    const text = e.target.value;
    const position = e.target.selectionStart;
    
    // Update highlights
    updateHighlights();
    
    // Auto-resize textarea
    autoResizeTextarea();
    
    // Handle slash commands
    if (shouldShowSlashCommands(text, position, getIsDirectMode())) {
      const lines = text.slice(0, position).split('\n');
      const currentLine = lines[lines.length - 1];
      const query = currentLine.substring(1); // Remove the '/'
      showSlashCommandMenu(query, getIsDirectMode());
    } else {
      hideSlashCommandMenu();
    }
    
    // Handle context menu for @ mentions
    if (shouldShowContextMenu(text, position)) {
      const beforeCursor = text.slice(0, position);
      const atIndex = beforeCursor.lastIndexOf('@');
      const query = beforeCursor.slice(atIndex + 1);
      showContextMenu(query, position);
    } else {
      hideContextMenu();
    }
    
    // Reset the space deletion flag
    this.justDeletedSpaceAfterMention = false;
  }

  /**
   * Handles keydown events
   */
  handleKeyDown(e) {
    // Handle context menu navigation
    if (handleContextMenuKeydown(e.key)) {
      e.preventDefault();
      return;
    }
    
    // Handle slash command navigation
    if (handleSlashCommandKeydown(e.key)) {
      e.preventDefault();
      return;
    }
    
    // Handle Enter key for sending messages
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
    
    // Handle backspace after mentions
    if (e.key === 'Backspace') {
      this.handleBackspaceAfterMention();
    }
  }

  /**
   * Handles backspace key after @ mentions
   */
  handleBackspaceAfterMention() {
    const input = this.elements.messageInput;
    const position = input.selectionStart;
    const text = input.value;
    
    // Check if we just deleted a space after a mention
    if (position > 0 && text[position - 1] === ' ') {
      const beforeSpace = text.slice(0, position - 1);
      const lastAtIndex = beforeSpace.lastIndexOf('@');
      
      if (lastAtIndex !== -1) {
        const afterAt = beforeSpace.slice(lastAtIndex + 1);
        // If this looks like a mention (no spaces), mark that we deleted a space
        if (!/\s/.test(afterAt) && afterAt.length > 0) {
          this.justDeletedSpaceAfterMention = true;
        }
      }
    }
  }

  /**
   * Sends a message to Claude Code
   */
  sendMessage() {
    const text = getInputValue().trim();
    if (!text) return;
    
    const problemIds = this.pendingProblems.map(problem => problem.originalIndex);
    const filePaths = extractFilePathsFromText(text);
    const images = getPendingImages();
    
    // Clear input and previews
    clearInput();
    clearPendingImages();
    this.pendingProblems = [];
    updateImagePreview([]);
    updateProblemPreview([]);
    
    // Send message to extension
    this.vscode.postMessage({
      command: 'sendMessage',
      text: text,
      filePaths: filePaths,
      images: images,
      problemIds: problemIds
    });
    
    // If in Direct Mode, show the user message immediately
    if (getIsDirectMode()) {
      handleDirectModeUserMessage(text);
    }
  }

  /**
   * Handles context button click
   */
  handleContextButtonClick() {
    focusInput();
    
    const currentValue = getInputValue();
    
    // If input is empty, just insert @
    if (!currentValue.trim()) {
      setInputValue('@');
      setCursorPosition(1);
      this.handleInputChange({ target: this.elements.messageInput });
      return;
    }
    
    // If input ends with space or is empty, just append @
    if (currentValue.endsWith(' ')) {
      setInputValue(currentValue + '@');
      setCursorPosition(currentValue.length + 1);
      this.handleInputChange({ target: this.elements.messageInput });
      return;
    }
    
    // Otherwise add space then @
    setInputValue(currentValue + ' @');
    setCursorPosition(currentValue.length + 2);
    this.handleInputChange({ target: this.elements.messageInput });
  }

  /**
   * Handles adding text to input from messages
   */
  handleAddTextToInput(text) {
    if (!text) return;
    
    const currentValue = getInputValue();
    const cursorPosition = getCursorPosition();
    
    // Add space before if needed
    const needsSpaceBefore = cursorPosition > 0 && !currentValue[cursorPosition - 1].match(/\s/);
    const textToInsert = (needsSpaceBefore ? ' ' : '') + text + ' ';
    
    // Insert text at cursor position
    const newValue = currentValue.slice(0, cursorPosition) + textToInsert + currentValue.slice(cursorPosition);
    setInputValue(newValue);
    
    // Set cursor position after inserted text
    setCursorPosition(cursorPosition + textToInsert.length);
    
    // Update UI
    this.handleInputChange({ target: this.elements.messageInput });
    focusInput();
  }

  /**
   * Shows the problem selector
   */
  showProblemSelector(problems) {
    // This would show a problem selector dialog
    // For now, just log the problems
    console.log('Show problem selector:', problems);
    
    // Send request to get problems from extension
    this.vscode.postMessage({
      command: 'getProblems'
    });
  }
}

// Initialize the application when DOM is ready
function init() {
  new ClaudeCodeUI();
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Make removeImage available globally for onclick handlers
window.removeImage = removeImage;