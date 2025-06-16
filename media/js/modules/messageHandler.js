/**
 * Message Handler Module
 * Main orchestrator for message processing, formatting, and display
 */

import { 
  isUserNearBottom,
  handleSmartScroll,
  hideNewMessageIndicator,
  formatTime
} from './utils.js';
import { createMessage, formatAssistantContent, updateMessageToResult } from './messageFormatter.js';
import { handleToolExecutionContext } from './toolExecutionHandler.js';
import { createOrUpdateTaskWorkflowGroup, updateTaskWorkflowGroupWithResults } from './taskWorkflowHandler.js';
import { 
  attachGeneralEventListeners, 
  attachThinkingBlockEventListeners, 
  attachToolExecutionEventListeners,
  attachTaskWorkflowEventListeners
} from './eventHandlers.js';
import { handlePermissionRequest, initializePermissionDialog } from './permissionDialog.js';

// VS Code API instance (will be set during initialization)
let vscode = null;

/**
 * Initialize the message handler with VS Code API instance
 */
export function initializeMessageHandler(vscodeApi) {
  vscode = vscodeApi;
  initializePermissionDialog(vscodeApi);
}

/**
 * Adds a message to the Direct Mode container
 */
export function addDirectModeMessage(type, content, timestamp, subtype, metadata, displayName, isUpdate, isProcessRunning, toolExecutionContext) {
  const directModeMessages = document.getElementById('directModeMessages');
  if (!directModeMessages) return;
  
  // Check for permission requests in user messages
  if (type === 'user' && content) {
    if (handlePermissionRequest(content, metadata, directModeMessages)) {
      return; // Don't process as regular message
    }
  }
  
  // Check if user is at bottom before adding message
  const wasAtBottom = isUserNearBottom(directModeMessages);
  console.log('Adding Direct Mode message:', { type, wasAtBottom });
  
  // Remove placeholder message if it exists
  const placeholder = directModeMessages.querySelector('.placeholder-message');
  if (placeholder) {
    placeholder.remove();
  }
  
  // Handle tool execution context for enhanced display
  if (toolExecutionContext) {
    if (handleToolExecutionContext(directModeMessages, type, toolExecutionContext, content, timestamp, subtype, metadata, displayName)) {
      return;
    }
  }
  
  // If this is an update, find the last assistant message and update it
  if (isUpdate && type === 'result') {
    const assistantMessages = directModeMessages.querySelectorAll('.assistant-message');
    if (assistantMessages.length > 0) {
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
      updateMessageToResult(lastAssistantMessage, content, timestamp, metadata);
      
      // Smart auto-scroll behavior for updates
      handleSmartScroll(directModeMessages, wasAtBottom);
      return;
    }
  }
  
  // Skip displaying silent messages (but still process their metadata)
  if (metadata?.silent && !content) {
    console.log(`Processing silent ${type} message with subtype: ${subtype}`);
    return;
  }
  
  // Create message element
  const messageElement = document.createElement('div');
  messageElement.className = `direct-mode-message ${type}-message`;
  
  // Set message content
  messageElement.innerHTML = createMessage(type, content, timestamp, subtype, metadata, displayName);
  
  // Attach event listeners for any interactive elements
  attachGeneralEventListeners(messageElement);
  
  // Attach thinking block event listeners
  attachThinkingBlockEventListeners(messageElement);
  
  // Attach tool execution event listeners (for tool usage blocks)
  attachToolExecutionEventListeners(messageElement);
  
  directModeMessages.appendChild(messageElement);
  
  // Smart auto-scroll behavior
  handleSmartScroll(directModeMessages, wasAtBottom);
}

// Re-export functions from other modules for backward compatibility
export { createMessage, formatAssistantContent, updateMessageToResult } from './messageFormatter.js';
export { formatToolUse, formatToolResult, generateResultSummary } from './toolFormatter.js';
export { 
  createOrUpdateToolExecutionGroup,
  updateToolExecutionGroupWithResults,
  formatToolExecutionList,
  formatSingleToolExecution,
  updateToolExecutionElement
} from './toolExecutionHandler.js';
export { 
  createOrUpdateTaskWorkflowGroup,
  updateTaskWorkflowGroupWithResults,
  formatTaskSubTools,
  formatSingleTaskTool,
  getTaskStatusIcon,
  updateTaskWorkflowStatus
} from './taskWorkflowHandler.js';