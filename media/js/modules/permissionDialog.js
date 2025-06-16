/**
 * Permission Dialog Module
 * Handles permission request detection, dialog creation, and user interaction
 */

import { escapeHtml, getToolDescription } from './utils.js';

// Track shown permission dialogs to prevent duplicates
let shownPermissionDialogs = new Set();

// VS Code API instance (will be set during initialization)
let vscode = null;

/**
 * Initialize the permission dialog module with VS Code API instance
 */
export function initializePermissionDialog(vscodeApi) {
  vscode = vscodeApi;
  setupPermissionDialogHandlers();
}

/**
 * Clears a permission dialog from the tracking set
 */
export function clearPermissionDialogTracking(sessionId, toolName) {
  const permissionKey = `${sessionId}-${toolName}`;
  shownPermissionDialogs.delete(permissionKey);
  console.log(`Cleared permission dialog tracking for ${toolName} (session: ${sessionId})`);
}

/**
 * Detects if content contains a permission request
 */
export function isPermissionRequest(content) {
  if (typeof content !== 'string') return null;
  
  // Match permission request patterns
  const permissionPattern = /Claude requested permissions to use (.+?), but you haven't granted it yet/i;
  const match = content.match(permissionPattern);
  
  if (match) {
    return {
      isPermissionRequest: true,
      toolName: match[1].trim(),
      originalContent: content
    };
  }
  
  return null;
}

/**
 * Creates permission dialog HTML
 */
export function createPermissionDialog(toolName, sessionId, commandContext) {
  // Determine what to show to the user
  let userFacingText, buttonText;
  
  if (commandContext) {
    // Show command context instead of tool name
    userFacingText = `command <span class="permission-dialog-command">${escapeHtml(commandContext)}</span>`;
    buttonText = commandContext;
  } else {
    // Fallback to tool name
    const toolDisplayName = toolName === 'Bash' ? 'Bash (shell commands)' : toolName;
    userFacingText = `the <span class="permission-dialog-tool-name">${escapeHtml(toolDisplayName)}</span> tool`;
    buttonText = toolName;
  }
  
  const toolDescription = getToolDescription(toolName);
  
  return `
    <div class="permission-dialog" data-session-id="${escapeHtml(sessionId)}" data-tool-name="${escapeHtml(toolName)}">
      <div class="permission-dialog-header">
        <span class="permission-dialog-icon">🛡️</span>
        Permission Request
      </div>
      <div class="permission-dialog-content">
        Claude is requesting permission to use ${userFacingText}.
        <br><br>
        ${toolDescription ? `<strong>What this tool does:</strong> ${escapeHtml(toolDescription)}` : ''}
        <br><br>
        Please choose how to proceed:
      </div>
      <div class="permission-dialog-actions">
        <button class="permission-dialog-button approve" data-action="approve">
          Approve
        </button>
        <button class="permission-dialog-button approve-all" data-action="approve-all">
          Approve All ${escapeHtml(buttonText)}
        </button>
        <button class="permission-dialog-button reject" data-action="reject">
          Reject
        </button>
      </div>
    </div>
  `;
}

/**
 * Handles permission request processing and dialog display
 */
export function handlePermissionRequest(content, metadata, directModeMessages) {
  // Check both content-based detection and metadata flag
  const permissionInfo = isPermissionRequest(content);
  const isPermissionFromMetadata = metadata?.isPermissionRequest && metadata?.toolName;
  
  if (permissionInfo || isPermissionFromMetadata) {
    // Extract session ID, tool name, and command context from metadata or content
    const sessionId = metadata?.sessionId || metadata?.session_id || 'unknown';
    const toolName = metadata?.toolName || permissionInfo?.toolName || 'unknown';
    const commandContext = metadata?.commandContext;
    
    // Create unique key for this permission request
    const permissionKey = `${sessionId}-${toolName}`;
    
    // Check if we've already shown this permission dialog
    if (shownPermissionDialogs.has(permissionKey)) {
      console.log(`Permission dialog for ${toolName} (session: ${sessionId}) already shown, skipping duplicate`);
      return true; // Indicate that this was a permission request
    }
    
    // Mark this permission dialog as shown
    shownPermissionDialogs.add(permissionKey);
    
    // Show permission dialog with command context
    const permissionHTML = createPermissionDialog(toolName, sessionId, commandContext);
    
    const messageElement = document.createElement('div');
    messageElement.className = 'direct-mode-message permission-request-message';
    messageElement.innerHTML = permissionHTML;
    
    directModeMessages.appendChild(messageElement);
    
    // Scroll to show the permission dialog
    if (typeof handleSmartScroll === 'function') {
      handleSmartScroll(directModeMessages, true);
    }
    
    return true; // Indicate that this was handled as a permission request
  }
  
  return false; // Not a permission request
}

/**
 * Handles permission dialog button clicks
 */
export function setupPermissionDialogHandlers() {
  document.addEventListener('click', (event) => {
    if (event.target.classList.contains('permission-dialog-button')) {
      const dialog = event.target.closest('.permission-dialog');
      if (!dialog) return;
      
      const action = event.target.dataset.action;
      const toolName = dialog.dataset.toolName;
      const sessionId = dialog.dataset.sessionId;
      
      // Disable all buttons to prevent double-clicks
      const buttons = dialog.querySelectorAll('.permission-dialog-button');
      buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
      });
      
      // Clear the permission dialog tracking to allow future permission requests
      clearPermissionDialogTracking(sessionId, toolName);
      
      // Send permission response to extension
      if (vscode) {
        vscode.postMessage({
          command: 'permissionResponse',
          action: action,
          toolName: toolName,
          sessionId: sessionId
        });
      }
      
      // Remove dialog immediately - feedback will be shown via system message
      dialog.remove();
    }
  });
}