/**
 * Shared Tool Utilities Module
 * Contains tool-related functions that are shared between different modules
 */

import { 
  escapeHtml, 
  getToolIcon, 
  formatTime
} from './utils.js';
import { formatToolResult, generateResultSummary } from './toolFormatter.js';

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
      resultContent = `<div class="tool-result-content">${formatToolResult(execution.result)}</div>`;
    } else {
      // Show placeholder content for completed tools without explicit results
      resultContent = `<div class="tool-result-content"><div class="result-text">Tool completed successfully</div></div>`;
    }
  }
  
  return `<div class="tool-execution-item ${statusClass}" data-tool-id="${execution.id}" data-tool-type="${execution.name}"><div class="tool-execution-header" data-toggle-tool="${execution.id}"><div class="tool-info"><span class="tool-icon">${toolIcon}</span><span class="tool-name">${execution.name}</span>${inputDescription ? `<span class="tool-input-desc">${escapeHtml(inputDescription)}</span>` : ''}${resultSummary ? `<span class="tool-result-preview">${escapeHtml(resultSummary)}</span>` : ''}</div><div class="tool-status"><span class="status-icon">${statusIcon}</span><div class="tool-actions">${execution.status === 'completed' ? `<button class="tool-action-btn" data-copy-tool="${execution.id}" title="Copy">📋</button>` : ''}${(execution.result || execution.status === 'completed') ? `<span class="expand-indicator">▶</span>` : ''}</div></div></div>${resultContent}</div>`;
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