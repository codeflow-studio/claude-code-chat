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

/**
 * Format a single tool execution in ultra-compact format
 */
export function formatSingleToolExecution(execution) {
  const toolIcon = getToolIcon(execution.name);
  const statusClass = `tool-${execution.status}`;
  const statusIcon = execution.status === 'completed' ? '✅' : execution.status === 'error' ? '❌' : '⏳';
  
  // Generate compact input description
  let inputDescription = '';
  if (execution.input) {
    if (execution.input.file_path) {
      const fileName = execution.input.file_path.split('/').pop() || execution.input.file_path;
      inputDescription = fileName.length > 15 ? fileName.substring(0, 15) + '...' : fileName;
    } else if (execution.input.pattern) {
      inputDescription = execution.input.pattern.length > 12 ? execution.input.pattern.substring(0, 12) + '...' : execution.input.pattern;
    } else if (execution.input.command) {
      const command = execution.input.command.length > 20 
        ? execution.input.command.substring(0, 20) + '...'
        : execution.input.command;
      inputDescription = command;
    } else {
      const params = Object.keys(execution.input);
      inputDescription = params.length <= 2 ? params.join(',') : `${params.length} params`;
    }
  }

  // Generate result summary for completed tools
  let resultSummary = '';
  if (execution.result && execution.status === 'completed') {
    resultSummary = generateResultSummary(execution.result, execution.name);
  }

  // Generate result content (hidden by default)
  let resultContent = '';
  if (execution.status === 'completed') {
    if (execution.result) {
      resultContent = `
        <div class="tool-result-content">
          ${formatToolResult(execution.result)}
        </div>
      `;
    } else {
      // Show placeholder content for completed tools without explicit results
      resultContent = `
        <div class="tool-result-content">
          <div class="result-text">Tool completed successfully</div>
        </div>
      `;
    }
  }
  
  return `
    <div class="tool-execution-item ${statusClass}" data-tool-id="${execution.id}" data-tool-type="${execution.name}">
      <div class="tool-execution-header" data-toggle-tool="${execution.id}">
        <div class="tool-info">
          <span class="tool-icon">${toolIcon}</span>
          <span class="tool-name">${execution.name}</span>
          ${inputDescription ? `<span class="tool-input-desc">${escapeHtml(inputDescription)}</span>` : ''}
          ${resultSummary ? `<span class="tool-result-preview">${escapeHtml(resultSummary)}</span>` : ''}
        </div>
        <div class="tool-status">
          <span class="status-icon">${statusIcon}</span>
          <div class="tool-actions">
            ${execution.status === 'completed' ? `<button class="tool-action-btn" data-copy-tool="${execution.id}" title="Copy">📋</button>` : ''}
            ${(execution.result || execution.status === 'completed') ? `<span class="expand-indicator">▶</span>` : ''}
          </div>
        </div>
      </div>
      ${resultContent}
    </div>
  `;
}

/**
 * Update a tool execution element with result
 */
export function updateToolExecutionElement(toolElement, execution) {
  // Update status class
  toolElement.className = `tool-execution-item tool-${execution.status}`;
  toolElement.setAttribute('data-tool-type', execution.name);
  
  // Update status icon
  const statusIcon = toolElement.querySelector('.status-icon');
  if (statusIcon) {
    statusIcon.textContent = execution.status === 'completed' ? '✅' : execution.status === 'error' ? '❌' : '⏳';
  }
  
  // Add result summary and actions for completed tools
  if (execution.status === 'completed') {
    // Add result summary if available
    if (execution.result) {
      const toolInfo = toolElement.querySelector('.tool-info');
      if (toolInfo && !toolInfo.querySelector('.tool-result-preview')) {
        const resultSummary = generateResultSummary(execution.result, execution.name);
        if (resultSummary) {
          toolInfo.insertAdjacentHTML('beforeend', `<span class="tool-result-preview">${escapeHtml(resultSummary)}</span>`);
        }
      }
    }
    
    // Add action buttons (copy button and expand indicator)
    const toolActions = toolElement.querySelector('.tool-actions');
    if (toolActions && !toolActions.querySelector('.tool-action-btn')) {
      toolActions.insertAdjacentHTML('afterbegin', `
        <button class="tool-action-btn" data-copy-tool="${execution.id}" title="Copy">📋</button>
        <span class="expand-indicator">▶</span>
      `);
    }
    
    // Add result content if not present
    let resultContainer = toolElement.querySelector('.tool-result-content');
    if (!resultContainer) {
      resultContainer = document.createElement('div');
      resultContainer.className = 'tool-result-content';
      
      if (execution.result) {
        resultContainer.innerHTML = formatToolResult(execution.result);
      } else {
        resultContainer.innerHTML = '<div class="result-text">Tool completed successfully</div>';
      }
      
      toolElement.appendChild(resultContainer);
    }
  }
}

