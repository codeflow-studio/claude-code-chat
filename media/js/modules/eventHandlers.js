/**
 * Event Handlers Module
 * Handles all user interactions and event management for message elements
 */

import { escapeHtml } from './utils.js';

/**
 * Attach general event listeners to message elements
 */
export function attachGeneralEventListeners(messageElement) {
  // Copy result buttons (for backward compatibility)
  const copyButtons = messageElement.querySelectorAll('[data-copy-result]');
  copyButtons.forEach(button => {
    button.removeEventListener('click', handleCopyResult);
    button.addEventListener('click', handleCopyResult);
  });
  
  // Expand/collapse buttons for tool results
  const expandButtons = messageElement.querySelectorAll('[data-toggle-expand]');
  expandButtons.forEach(button => {
    button.removeEventListener('click', handleExpandToggle);
    button.addEventListener('click', handleExpandToggle);
  });
  
  // Right-click context menu for tool result content
  const toolResultElements = messageElement.querySelectorAll('.tool-result-editor-content, .tool-result-content .result-text');
  toolResultElements.forEach(element => {
    element.removeEventListener('contextmenu', handleToolResultContextMenu);
    element.addEventListener('contextmenu', handleToolResultContextMenu);
  });
}

/**
 * Attach thinking block event listeners to message elements
 */
export function attachThinkingBlockEventListeners(messageElement) {
  // Thinking block toggle buttons
  const thinkingHeaders = messageElement.querySelectorAll('[data-toggle-thinking]');
  thinkingHeaders.forEach(header => {
    header.removeEventListener('click', handleThinkingToggle);
    header.addEventListener('click', handleThinkingToggle);
  });
}

/**
 * Attach tool execution event listeners to message elements
 */
export function attachToolExecutionEventListeners(messageElement) {
  // Tool execution header toggles
  const toolHeaders = messageElement.querySelectorAll('[data-toggle-tool]');
  console.log(`Attaching tool execution listeners to ${toolHeaders.length} tool headers`);
  toolHeaders.forEach(header => {
    header.removeEventListener('click', handleToolToggle);
    header.addEventListener('click', handleToolToggle);
  });
  
  // Tool copy buttons
  const copyButtons = messageElement.querySelectorAll('[data-copy-tool]');
  copyButtons.forEach(button => {
    button.removeEventListener('click', handleToolCopy);
    button.addEventListener('click', handleToolCopy);
  });
}

/**
 * Attach event listeners to Task workflow elements
 */
export function attachTaskWorkflowEventListeners(groupElement) {
  // Task workflow header toggle
  const taskHeader = groupElement.querySelector('[data-toggle-task]');
  if (taskHeader) {
    // Remove existing listeners to avoid duplicates
    taskHeader.removeEventListener('click', handleTaskWorkflowToggle);
    taskHeader.addEventListener('click', handleTaskWorkflowToggle);
  }
  
  // Completed tools group toggles
  const completedGroups = groupElement.querySelectorAll('[data-toggle-completed]');
  completedGroups.forEach(group => {
    // Remove existing listeners to avoid duplicates
    group.removeEventListener('click', handleCompletedToolsToggle);
    group.addEventListener('click', handleCompletedToolsToggle);
  });
  
  // Tool execution event listeners (shared with regular messages)
  attachToolExecutionEventListeners(groupElement);
  
  // Thinking block event listeners within task workflows
  attachThinkingBlockEventListeners(groupElement);
}

/**
 * Handle Task workflow toggle
 */
function handleTaskWorkflowToggle(event) {
  const groupElement = event.currentTarget.closest('[data-execution-group-id]');
  if (groupElement) {
    groupElement.classList.toggle('collapsed');
    
    const expandIndicator = groupElement.querySelector('.expand-indicator');
    if (expandIndicator) {
      expandIndicator.textContent = groupElement.classList.contains('collapsed') ? '▶' : '▼';
    }
  }
}

/**
 * Handle completed tools group toggle
 */
function handleCompletedToolsToggle(event) {
  event.stopPropagation(); // Prevent triggering parent handlers
  
  const groupElement = event.currentTarget;
  const completedList = groupElement.querySelector('.completed-tools-list');
  const expandIcon = groupElement.querySelector('.completed-icon');
  
  if (completedList && expandIcon) {
    const isVisible = completedList.style.display !== 'none';
    completedList.style.display = isVisible ? 'none' : 'block';
    expandIcon.textContent = isVisible ? '▶' : '▼';
  }
}

/**
 * Handle tool execution toggle
 */
function handleToolToggle(event) {
  event.preventDefault();
  event.stopPropagation();
  
  const toolId = event.currentTarget.getAttribute('data-toggle-tool');
  const toolElement = document.querySelector(`[data-tool-id="${toolId}"]`);
  
  console.log(`Tool toggle clicked for ID: ${toolId}, element found:`, !!toolElement);
  
  if (toolElement) {
    const isExpanded = toolElement.classList.contains('expanded');
    
    if (isExpanded) {
      toolElement.classList.remove('expanded');
    } else {
      toolElement.classList.add('expanded');
    }
    
    const expandIndicator = toolElement.querySelector('.expand-indicator');
    if (expandIndicator) {
      expandIndicator.textContent = toolElement.classList.contains('expanded') ? '▼' : '▶';
    }
    
    // Debug logging (can be removed later)
    console.log(`Tool ${toolId} toggled to ${toolElement.classList.contains('expanded') ? 'expanded' : 'collapsed'}`);
  } else {
    console.warn(`Tool element not found for ID: ${toolId}`);
  }
}

/**
 * Handle tool copy action
 */
function handleToolCopy(event) {
  event.stopPropagation(); // Prevent triggering parent handlers
  
  const toolId = event.currentTarget.getAttribute('data-copy-tool');
  const toolElement = document.querySelector(`[data-tool-id="${toolId}"]`);
  if (toolElement) {
    const resultContainer = toolElement.querySelector('.tool-result-content .tool-result-editor-content, .tool-result-content .result-text');
    if (resultContainer) {
      navigator.clipboard.writeText(resultContainer.textContent).then(() => {
        const copyBtn = event.currentTarget;
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓';
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 1000);
      }).catch(() => {
        console.warn('Failed to copy tool result');
      });
    }
  }
}

/**
 * Handle copy result action (for tool result displays)
 */
function handleCopyResult(event) {
  event.stopPropagation();
  
  const button = event.currentTarget;
  const resultContainer = button.closest('.tool-result-editor, .tool-result-generic');
  if (resultContainer) {
    const contentElement = resultContainer.querySelector('.tool-result-editor-content, .result-text');
    if (contentElement) {
      navigator.clipboard.writeText(contentElement.textContent).then(() => {
        const originalIcon = button.querySelector('.copy-icon').textContent;
        button.querySelector('.copy-icon').textContent = '✓';
        setTimeout(() => {
          button.querySelector('.copy-icon').textContent = originalIcon;
        }, 1000);
      }).catch(() => {
        console.warn('Failed to copy result');
      });
    }
  }
}

/**
 * Handle expand/collapse toggle for tool results
 */
function handleExpandToggle(event) {
  event.stopPropagation();
  
  const button = event.currentTarget;
  const resultContainer = button.closest('.tool-result-editor');
  if (resultContainer) {
    resultContainer.classList.toggle('expanded');
    const expandIcon = button.querySelector('.expand-icon');
    if (expandIcon) {
      expandIcon.textContent = resultContainer.classList.contains('expanded') ? '⛝' : '⛶';
    }
  }
}

/**
 * Handle thinking block expand/collapse toggle
 */
function handleThinkingToggle(event) {
  event.stopPropagation();
  
  const header = event.currentTarget;
  const thinkingId = header.getAttribute('data-toggle-thinking');
  const thinkingBlock = document.querySelector(`[data-thinking-id="${thinkingId}"]`);
  
  if (thinkingBlock) {
    const isCollapsed = thinkingBlock.classList.contains('collapsed');
    const expandIndicator = header.querySelector('.thinking-expand-indicator');
    const preview = thinkingBlock.querySelector('.thinking-preview');
    const full = thinkingBlock.querySelector('.thinking-full');
    
    if (isCollapsed) {
      // Expand
      thinkingBlock.classList.remove('collapsed');
      thinkingBlock.classList.add('expanded');
      if (expandIndicator) expandIndicator.textContent = '▼';
      if (preview) preview.style.display = 'none';
      if (full) full.style.display = 'block';
    } else {
      // Collapse
      thinkingBlock.classList.remove('expanded');
      thinkingBlock.classList.add('collapsed');
      if (expandIndicator) expandIndicator.textContent = '▶';
      if (preview) preview.style.display = 'block';
      if (full) full.style.display = 'none';
    }
  }
}

/**
 * Handle right-click context menu on tool result content
 */
function handleToolResultContextMenu(event) {
  event.preventDefault(); // Prevent default browser context menu
  
  const element = event.currentTarget;
  const content = element.textContent;
  
  if (content && content.trim()) {
    // Copy to clipboard
    navigator.clipboard.writeText(content).then(() => {
      // Show temporary visual feedback
      const originalStyle = element.style.backgroundColor;
      element.style.backgroundColor = 'var(--vscode-editor-selectionBackground)';
      element.style.transition = 'background-color 0.2s ease';
      
      setTimeout(() => {
        element.style.backgroundColor = originalStyle;
        setTimeout(() => {
          element.style.transition = '';
        }, 200);
      }, 500);
    }).catch(() => {
      console.warn('Failed to copy tool result content');
    });
  }
}

// Global functions for UI interactions (for backward compatibility)
window.toggleToolResult = function(toolId) {
  const toolElement = document.querySelector(`[data-tool-id="${toolId}"]`);
  if (toolElement) {
    toolElement.classList.toggle('expanded');
    
    const expandIndicator = toolElement.querySelector('.expand-indicator');
    if (expandIndicator) {
      expandIndicator.textContent = toolElement.classList.contains('expanded') ? '▼' : '▶';
    }
  }
};

window.copyToolResult = function(event, toolId) {
  if (event) {
    event.stopPropagation(); // Prevent toggle when clicking copy
  }
  
  const toolElement = document.querySelector(`[data-tool-id="${toolId}"]`);
  if (toolElement) {
    const resultContainer = toolElement.querySelector('.tool-result-content .tool-result-editor-content, .tool-result-content .result-text');
    if (resultContainer) {
      navigator.clipboard.writeText(resultContainer.textContent).then(() => {
        const copyBtn = event ? event.target : toolElement.querySelector('.tool-action-btn');
        if (copyBtn) {
          const originalText = copyBtn.textContent;
          copyBtn.textContent = '✓';
          setTimeout(() => {
            copyBtn.textContent = originalText;
          }, 1000);
        }
      }).catch(() => {
        console.warn('Failed to copy tool result');
      });
    }
  }
};

// Legacy function - maintain compatibility
window.toggleExpand = function(button) {
  const resultContainer = button.closest('.tool-result-editor');
  if (resultContainer) {
    resultContainer.classList.toggle('expanded');
    const expandIcon = button.querySelector('.expand-icon');
    if (expandIcon) {
      expandIcon.textContent = resultContainer.classList.contains('expanded') ? '⛝' : '⛶';
    }
  }
};