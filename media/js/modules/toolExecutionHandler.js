/**
 * Tool Execution Handler Module
 * Handles tool execution display, workflow management, and task processing
 */

import { 
  escapeHtml, 
  getToolIcon, 
  formatTime,
  isUserNearBottom,
  handleSmartScroll
} from './utils.js';
import { formatToolResult, generateResultSummary } from './toolFormatter.js';
import { formatAssistantContent } from './messageFormatter.js';
import { formatSingleToolExecution, updateToolExecutionElement } from './toolUtils.js';
import { createOrUpdateTaskWorkflowGroup, updateTaskWorkflowGroupWithResults } from './taskWorkflowHandler.js';

/**
 * Handle tool execution context for enhanced parallel tool display
 * Enhanced to handle Task workflows with hierarchical display
 */
export function handleToolExecutionContext(directModeMessages, type, toolExecutionContext, content, timestamp, subtype, metadata, displayName) {
  const { toolExecutions, executionGroup, taskExecution, isTaskWorkflow } = toolExecutionContext;
  
  if (!toolExecutions || toolExecutions.length === 0) {
    // Fallback to normal message display
    return false; // Indicate that normal processing should continue
  }
  
  if (type === 'assistant' && executionGroup) {
    if (isTaskWorkflow) {
      // Handle Task workflow display
      createOrUpdateTaskWorkflowGroup(directModeMessages, executionGroup, taskExecution, content, timestamp, metadata);
    } else {
      // Handle regular tool execution group display
      createOrUpdateToolExecutionGroup(directModeMessages, executionGroup, content, timestamp, metadata);
    }
  } else if (type === 'user') {
    // Update existing tool execution group with results
    if (isTaskWorkflow) {
      updateTaskWorkflowGroupWithResults(directModeMessages, toolExecutions, taskExecution);
    } else {
      updateToolExecutionGroupWithResults(directModeMessages, toolExecutions);
    }
  }
  
  // Smart auto-scroll behavior for tool execution context
  const wasAtBottom = isUserNearBottom(directModeMessages);
  handleSmartScroll(directModeMessages, wasAtBottom);
  
  return true; // Indicate that processing was handled
}

/**
 * Create or update a tool execution group display
 */
export function createOrUpdateToolExecutionGroup(directModeMessages, executionGroup, content, timestamp, metadata) {
  const groupId = executionGroup.id;
  const time = formatTime(timestamp);
  
  // Check if group already exists
  let groupElement = directModeMessages.querySelector(`[data-execution-group-id="${groupId}"]`);
  
  if (!groupElement) {
    // Create new group element
    groupElement = document.createElement('div');
    groupElement.className = 'direct-mode-message assistant-message tool-execution-group';
    groupElement.setAttribute('data-execution-group-id', groupId);
    
    // Create group header
    let usageInfo = '';
    if (metadata?.usage) {
      const usage = metadata.usage;
      if (usage.input_tokens || usage.output_tokens) {
        usageInfo = `<span class="usage-info">Input: ${usage.input_tokens || 0} • Output: ${usage.output_tokens || 0}</span>`;
      }
    }
    
    const groupHeader = `
      <div class="message-header">
        ${usageInfo ? `<span class="message-sender assistant-sender">${usageInfo}</span>` : ''}
        <span class="message-time">${time}</span>
        <span class="tool-execution-status">${executionGroup.executions.length} tools</span>
      </div>
    `;
    
    // Create content area with text content and tool execution area
    const groupContent = `
      <div class="message-content assistant-content">
        ${content ? formatAssistantContent(content, metadata) : ''}
        <div class="tool-execution-container" data-group-id="${groupId}">
          ${formatToolExecutionList(executionGroup.executions)}
        </div>
      </div>
    `;
    
    groupElement.innerHTML = groupHeader + groupContent;
    directModeMessages.appendChild(groupElement);
  } else {
    // Update existing group
    const container = groupElement.querySelector('.tool-execution-container');
    if (container) {
      container.innerHTML = formatToolExecutionList(executionGroup.executions);
    }
    
    // Update status
    const statusElement = groupElement.querySelector('.tool-execution-status');
    if (statusElement) {
      const completedCount = executionGroup.executions.filter(e => e.status === 'completed').length;
      const pendingCount = executionGroup.executions.filter(e => e.status === 'pending').length;
      statusElement.textContent = `${completedCount}/${executionGroup.executions.length} tools${pendingCount > 0 ? ' (running...)' : ' (complete)'}`;
    }
  }
}

/**
 * Update tool execution group with results
 */
export function updateToolExecutionGroupWithResults(directModeMessages, toolExecutions) {
  // Find groups that contain these tool executions and update them
  toolExecutions.forEach(execution => {
    const groupElements = directModeMessages.querySelectorAll('.tool-execution-group');
    groupElements.forEach(groupElement => {
      const container = groupElement.querySelector('.tool-execution-container');
      if (container) {
        const toolElement = container.querySelector(`[data-tool-id="${execution.id}"]`);
        if (toolElement) {
          // Update the tool element with result
          updateToolExecutionElement(toolElement, execution);
          
          // Update group status
          const statusElement = groupElement.querySelector('.tool-execution-status');
          if (statusElement) {
            const allToolElements = container.querySelectorAll('[data-tool-id]');
            const completedElements = container.querySelectorAll('[data-tool-id].tool-completed');
            const pendingElements = container.querySelectorAll('[data-tool-id].tool-pending');
            statusElement.textContent = `${completedElements.length}/${allToolElements.length} tools${pendingElements.length > 0 ? ' (running...)' : ' (complete)'}`;
          }
        }
      }
    });
  });
}

/**
 * Format list of tool executions
 */
export function formatToolExecutionList(executions) {
  return executions.map(execution => formatSingleToolExecution(execution)).join('');
}


