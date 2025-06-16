/**
 * Task Workflow Handler Module
 * Handles Task workflow display, management, and hierarchical tool organization
 */

import { 
  escapeHtml, 
  getToolIcon, 
  formatTime
} from './utils.js';
import { formatToolResult } from './toolFormatter.js';
import { formatSingleToolExecution, updateToolExecutionElement } from './toolExecutionHandler.js';

/**
 * Create or update a Task workflow group display
 */
export function createOrUpdateTaskWorkflowGroup(directModeMessages, executionGroup, taskExecution, content, timestamp, metadata) {
  const groupId = executionGroup.id;
  const time = formatTime(timestamp);
  
  // Check if group already exists
  let groupElement = directModeMessages.querySelector(`[data-execution-group-id="${groupId}"]`);
  
  if (!groupElement) {
    // Create new Task workflow group element
    groupElement = document.createElement('div');
    groupElement.className = 'direct-mode-message assistant-message task-workflow-group';
    groupElement.setAttribute('data-execution-group-id', groupId);
    groupElement.setAttribute('data-task-id', taskExecution?.id || '');
    
    // Create Task workflow header
    let usageInfo = '';
    if (metadata?.usage) {
      const usage = metadata.usage;
      if (usage.input_tokens || usage.output_tokens) {
        usageInfo = `<span class="usage-info">Input: ${usage.input_tokens || 0} • Output: ${usage.output_tokens || 0}</span>`;
      }
    }
    
    const taskIcon = getToolIcon('Task');
    const taskStatus = taskExecution ? getTaskStatusIcon(taskExecution.status) : '⏳';
    const taskDescription = taskExecution?.input?.description || 'Complex task';
    
    const groupHeader = `
      <div class="message-header">
        ${usageInfo ? `<span class="message-sender assistant-sender">${usageInfo}</span>` : ''}
        <span class="message-time">${time}</span>
      </div>
      <div class="task-workflow-header" data-toggle-task="${groupId}">
        <div class="task-info">
          <span class="task-icon">${taskIcon}</span>
          <span class="task-title">${escapeHtml(taskDescription)}</span>
          <span class="task-status">${taskStatus}</span>
        </div>
        <div class="task-controls">
          <span class="sub-tool-count">${executionGroup.executions.filter(e => e.name !== 'Task').length} sub-tools</span>
          <span class="expand-indicator">▼</span>
        </div>
      </div>
    `;
    
    // Create content area with task description and sub-tools container
    // For Task workflows, skip the regular assistant content to avoid duplicate tool displays
    const groupContent = `
      <div class="message-content assistant-content">
        <div class="task-sub-tools-container" data-group-id="${groupId}">
          ${formatTaskSubTools(executionGroup.executions, taskExecution)}
        </div>
      </div>
    `;
    
    groupElement.innerHTML = groupHeader + groupContent;
    directModeMessages.appendChild(groupElement);
  } else {
    // Update existing Task workflow group
    const container = groupElement.querySelector('.task-sub-tools-container');
    if (container) {
      container.innerHTML = formatTaskSubTools(executionGroup.executions, taskExecution);
    }
    
    // Update task status and sub-tool count
    updateTaskWorkflowStatus(groupElement, executionGroup, taskExecution);
  }
}

/**
 * Update Task workflow group with results
 */
export function updateTaskWorkflowGroupWithResults(directModeMessages, toolExecutions, taskExecution) {
  // Find the Task workflow group that contains these tool executions
  const taskGroups = directModeMessages.querySelectorAll('.task-workflow-group');
  
  taskGroups.forEach(groupElement => {
    const container = groupElement.querySelector('.task-sub-tools-container');
    if (container) {
      let updated = false;
      
      toolExecutions.forEach(execution => {
        const toolElement = container.querySelector(`[data-tool-id="${execution.id}"]`);
        if (toolElement) {
          // Update the tool element with result
          updateToolExecutionElement(toolElement, execution);
          updated = true;
        }
      });
      
      if (updated) {
        // Update Task workflow status
        const groupId = groupElement.getAttribute('data-execution-group-id');
        const mockExecutionGroup = {
          executions: Array.from(container.querySelectorAll('[data-tool-id]')).map(el => ({
            id: el.getAttribute('data-tool-id'),
            status: el.classList.contains('tool-completed') ? 'completed' : 
                   el.classList.contains('tool-error') ? 'error' : 'pending'
          }))
        };
        updateTaskWorkflowStatus(groupElement, mockExecutionGroup, taskExecution);
      }
    }
  });
}

/**
 * Format Task sub-tools in a hierarchical display
 */
export function formatTaskSubTools(executions, taskExecution) {
  if (!executions || executions.length === 0) {
    return '<div class="task-no-subtools">No sub-tools yet</div>';
  }
  
  // Separate the Task tool from sub-tools
  const taskTool = executions.find(e => e.name === 'Task');
  const subTools = executions.filter(e => e.name !== 'Task');
  
  let html = '';
  
  // Show Task tool if present
  if (taskTool) {
    html += `
      <div class="task-main-tool">
        ${formatSingleTaskTool(taskTool, taskExecution)}
      </div>
    `;
  }
  
  // Show sub-tools with smart grouping
  if (subTools.length > 0) {
    // Separate running/pending from completed sub-tools
    const activeTool = subTools.filter(t => t.status === 'pending');
    const completedTools = subTools.filter(t => t.status === 'completed');
    
    html += `
      <div class="task-sub-tools">
        <div class="sub-tools-header">
          <span class="sub-tools-label">Sub-tasks:</span>
        </div>
        <div class="sub-tools-list">
    `;
    
    // Show active tools individually (always visible)
    if (activeTool.length > 0) {
      html += activeTool.map(tool => formatSingleToolExecution(tool)).join('');
    }
    
    // Group completed tools if there are many
    if (completedTools.length > 0) {
      if (completedTools.length <= 3) {
        // Show all completed tools if 3 or fewer
        html += completedTools.map(tool => formatSingleToolExecution(tool)).join('');
      } else {
        // Show first completed tool and group the rest
        html += formatSingleToolExecution(completedTools[0]);
        const remainingCount = completedTools.length - 1;
        html += `
          <div class="completed-tools-group" data-toggle-completed="true">
            <div class="completed-tools-summary">
              <span class="completed-icon">▶</span>
              <span class="completed-label">${remainingCount} more completed tools</span>
            </div>
            <div class="completed-tools-list" style="display: none;">
              ${completedTools.slice(1).map(tool => formatSingleToolExecution(tool)).join('')}
            </div>
          </div>
        `;
      }
    }
    
    html += `
        </div>
      </div>
    `;
  }
  
  return html;
}

/**
 * Format a single Task tool with enhanced display
 */
export function formatSingleTaskTool(execution, taskExecution) {
  const taskIcon = getToolIcon('Task');
  const statusClass = `task-${execution.status}`;
  const statusIcon = getTaskStatusIcon(execution.status);
  
  // Get task description from input
  const taskDescription = execution.input?.description || taskExecution?.input?.description || 'Complex task';
  
  return `
    <div class="task-tool-item ${statusClass}" data-tool-id="${execution.id}">
      <div class="task-tool-header">
        <div class="task-tool-info">
          <span class="tool-icon">${taskIcon}</span>
          <span class="task-description">${escapeHtml(taskDescription)}</span>
        </div>
        <div class="task-tool-status">
          <span class="status-icon">${statusIcon}</span>
        </div>
      </div>
      ${execution.result ? `
        <div class="task-tool-result">
          ${formatToolResult(execution.result)}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Get Task status icon
 */
export function getTaskStatusIcon(status) {
  const icons = {
    'pending': '⏳',
    'running': '🔄',
    'completed': '✅',
    'error': '❌'
  };
  return icons[status] || '⏳';
}

/**
 * Update Task workflow status display
 */
export function updateTaskWorkflowStatus(groupElement, executionGroup, taskExecution) {
  const taskStatusElement = groupElement.querySelector('.task-status');
  const subToolCountElement = groupElement.querySelector('.sub-tool-count');
  
  if (taskStatusElement && taskExecution) {
    taskStatusElement.textContent = getTaskStatusIcon(taskExecution.status);
  }
  
  if (subToolCountElement && executionGroup) {
    // Only count sub-tools (exclude the Task tool itself)
    const subTools = executionGroup.executions.filter(e => e.name !== 'Task');
    const completedCount = subTools.filter(e => e.status === 'completed').length;
    const totalCount = subTools.length;
    const isRunning = subTools.some(e => e.status === 'pending');
    
    subToolCountElement.textContent = `${completedCount}/${totalCount} sub-tools${isRunning ? ' (running...)' : ' (complete)'}`;
  }
}

