/**
 * Message Handler Module
 * Handles message processing, formatting, and display for Claude Code responses
 */

import { 
  escapeHtml, 
  getToolIcon, 
  getToolDescription, 
  getToolResultIcon, 
  extractToolNameFromResult, 
  extractFileNameFromResult,
  formatTime,
  isUserNearBottom
} from './utils.js';

// Store tool_use data for pairing with tool_result
let pendingToolUse = null;

/**
 * Creates a formatted message element for Direct Mode display
 */
export function createMessage(type, content, timestamp, subtype, metadata, displayName) {
  const time = formatTime(timestamp);
  let messageHTML = '';

  switch (type) {
    case 'user':
      const userContent = content || 'User message';
      messageHTML = `
        <div class="message-header">
          <span class="message-sender">You</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-content user-content">${escapeHtml(userContent)}</div>
      `;
      break;
      
    case 'system':
      let systemContent = content || 'System message';
      let senderLabel = 'System';
      
      if (subtype === 'init') {
        senderLabel = 'Session';
        if (metadata?.tools || metadata?.mcpServers) {
          systemContent = formatSystemInitContent(content, metadata);
        }
      }
      
      messageHTML = `
        <div class="message-header">
          <span class="message-sender system-sender">${senderLabel}</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-content system-content">${systemContent}</div>
      `;
      break;
      
    case 'assistant':
      const assistantContent = content || '';
      let usageInfo = '';
      
      if (metadata?.usage) {
        const usage = metadata.usage;
        if (usage.input_tokens || usage.output_tokens) {
          usageInfo = ` <span class="usage-info">(${usage.input_tokens || 0}→${usage.output_tokens || 0} tokens)</span>`;
        }
      }
      
      messageHTML = `
        <div class="message-header">
          <span class="message-sender assistant-sender">Claude${usageInfo}</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-content assistant-content">${formatAssistantContent(assistantContent, metadata)}</div>
      `;
      break;
      
    case 'result':
      let resultInfo = '';
      if (metadata) {
        const parts = [];
        if (metadata.cost) parts.push(`$${metadata.cost.toFixed(4)}`);
        if (metadata.duration) parts.push(`${(metadata.duration / 1000).toFixed(1)}s`);
        if (parts.length > 0) {
          resultInfo = ` <span class="result-info">(${parts.join(', ')})</span>`;
        }
      }
      
      messageHTML = `
        <div class="message-header">
          <span class="message-sender result-sender">Summary${resultInfo}</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-content result-content">${formatAssistantContent(content || 'Conversation complete', metadata)}</div>
      `;
      break;
      
    case 'error':
      messageHTML = `
        <div class="message-header">
          <span class="message-sender error-sender">Error</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-content error-content">${escapeHtml(content || 'An error occurred')}</div>
      `;
      break;
      
    case 'user_input':
      const userInputContent = content || 'User input';
      messageHTML = `
        <div class="message-header">
          <span class="message-sender">You</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-content user-content">${escapeHtml(userInputContent)}</div>
      `;
      break;
      
    default:
      // Fallback for unknown types - use displayName if provided
      const senderName = displayName || `Unknown (${type})`;
      messageHTML = `
        <div class="message-header">
          <span class="message-sender">${escapeHtml(senderName)}</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${escapeHtml(content || '')}</div>
      `;
  }

  return messageHTML;
}

/**
 * Adds a message to the Direct Mode container
 */
export function addDirectModeMessage(type, content, timestamp, subtype, metadata, displayName, isUpdate, isProcessRunning) {
  const directModeMessages = document.getElementById('directModeMessages');
  if (!directModeMessages) return;
  
  // Remove placeholder message if it exists
  const placeholder = directModeMessages.querySelector('.placeholder-message');
  if (placeholder) {
    placeholder.remove();
  }
  
  // If this is an update, find the last assistant message and update it
  if (isUpdate && type === 'result') {
    const assistantMessages = directModeMessages.querySelectorAll('.assistant-message');
    if (assistantMessages.length > 0) {
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
      updateMessageToResult(lastAssistantMessage, content, timestamp, metadata);
      
      // Auto-scroll to bottom only if user is near bottom
      if (isUserNearBottom(directModeMessages)) {
        directModeMessages.scrollTop = directModeMessages.scrollHeight;
      }
      return;
    }
  }
  
  // Create message element
  const messageElement = document.createElement('div');
  messageElement.className = `direct-mode-message ${type}-message`;
  
  // Set message content
  messageElement.innerHTML = createMessage(type, content, timestamp, subtype, metadata, displayName);
  directModeMessages.appendChild(messageElement);
  
  // Auto-scroll to bottom only if user is near bottom
  if (isUserNearBottom(directModeMessages)) {
    directModeMessages.scrollTop = directModeMessages.scrollHeight;
  }
}

/**
 * Updates an assistant message to a result message
 */
export function updateMessageToResult(messageElement, content, timestamp, metadata) {
  const time = formatTime(timestamp);
  
  let resultInfo = '';
  if (metadata) {
    const parts = [];
    if (metadata.cost) parts.push(`$${metadata.cost.toFixed(4)}`);
    if (metadata.duration) parts.push(`${(metadata.duration / 1000).toFixed(1)}s`);
    if (parts.length > 0) {
      resultInfo = ` <span class="result-info">(${parts.join(', ')})</span>`;
    }
  }
  
  // Update the message class to result-message
  messageElement.className = 'direct-mode-message result-message';
  
  // Update the header to show "Summary" instead of "Claude"
  const header = messageElement.querySelector('.message-header');
  if (header) {
    header.innerHTML = `
      <span class="message-sender result-sender">Summary${resultInfo}</span>
      <span class="message-time">${time}</span>
    `;
  }
  
  // Content stays the same since it should be identical
  // But ensure it has the result-content class
  const contentElement = messageElement.querySelector('.message-content');
  if (contentElement) {
    contentElement.className = 'message-content result-content';
  }
}

/**
 * Formats system initialization content with metadata
 */
export function formatSystemInitContent(content, metadata) {
  if (!metadata) return escapeHtml(content || 'Session initialized');
  
  const parts = [];
  
  if (metadata.model) {
    parts.push(`<strong>Model:</strong> ${escapeHtml(metadata.model)}`);
  }
  
  if (metadata.tools && metadata.tools.length > 0) {
    parts.push(`<strong>Tools:</strong> ${metadata.tools.length} available`);
  }
  
  if (metadata.mcpServers && metadata.mcpServers.length > 0) {
    const connectedServers = metadata.mcpServers
      .filter(server => server.status === 'connected')
      .map(server => server.name);
    if (connectedServers.length > 0) {
      parts.push(`<strong>MCP:</strong> ${connectedServers.join(', ')}`);
    }
  }
  
  return parts.length > 0 ? 
    `<div class="system-init">Session initialized<br>${parts.join('<br>')}</div>` :
    escapeHtml(content || 'Session initialized');
}

/**
 * Formats assistant content with structured content and markdown support
 */
export function formatAssistantContent(content, metadata) {
  if (!content) return '';
  
  // Handle structured content (tool_use, tool_result, etc.)
  if (metadata && metadata.originalMessage && metadata.originalMessage.message && 
      Array.isArray(metadata.originalMessage.message.content)) {
    return formatStructuredContent(metadata.originalMessage.message.content);
  }
  
  // Handle string content with markdown-like formatting
  let formatted = escapeHtml(content);
  
  // Convert thinking blocks with special styling
  formatted = formatted.replace(/🤔 Thinking: (.*?)(?=🔧|$)/gs, function(match, thinkingContent) {
    return `<div class="thinking-block">
      <div class="thinking-header">🤔 Thinking</div>
      <div class="thinking-content">${thinkingContent.trim()}</div>
    </div>`;
  });
  
  // Convert tool usage blocks
  formatted = formatted.replace(/🔧 Using tool: (.*?)$/gm, '<div class="tool-usage">🔧 Using tool: $1</div>');
  
  // Convert code blocks
  formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Convert inline code
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Convert bold
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Convert italic
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  // Convert line breaks
  formatted = formatted.replace(/\n/g, '<br>');
  
  return formatted;
}

/**
 * Formats structured content (tool_use, tool_result, thinking, etc.)
 */
export function formatStructuredContent(contentArray) {
  if (!Array.isArray(contentArray)) return '';
  
  let formattedParts = [];
  
  contentArray.forEach(item => {
    if (!item || !item.type) return;
    
    switch (item.type) {
      case 'text':
        if (item.text) {
          let textFormatted = escapeHtml(item.text);
          // Apply basic markdown formatting to text blocks
          textFormatted = textFormatted
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
          formattedParts.push(`<div class="content-text">${textFormatted}</div>`);
        }
        break;
        
      case 'thinking':
        if (item.thinking) {
          formattedParts.push(`
            <div class="thinking-block">
              <div class="thinking-header">🤔 Claude is thinking...</div>
              <div class="thinking-content">${escapeHtml(item.thinking)}</div>
            </div>
          `);
        }
        break;
        
      case 'tool_use':
        // Store tool use data for pairing with result
        if (item.input && item.input.file_path) {
          pendingToolUse = {
            name: item.name,
            filePath: item.input.file_path,
            id: item.id || Date.now().toString()
          };
        }
        formattedParts.push(formatToolUse(item));
        break;
        
      case 'tool_result':
        if (item.content) {
          formattedParts.push(formatToolResult(item));
        }
        break;
        
      default:
        // Fallback for unknown content types
        if (item.text || item.content) {
          formattedParts.push(`<div class="content-unknown">${escapeHtml(item.text || item.content)}</div>`);
        }
    }
  });
  
  return formattedParts.join('');
}

/**
 * Formats tool_use content with enhanced UI
 */
export function formatToolUse(toolUse) {
  if (!toolUse.name) return '';
  
  const toolName = toolUse.name;
  const toolIcon = getToolIcon(toolName);
  let toolDescription = getToolDescription(toolName);
  
  // Special handling for Edit tool
  if (toolName === 'Edit' && toolUse.input) {
    return formatEditTool(toolUse.input, toolIcon);
  }
  
  // Special handling for other file tools
  if (['Write', 'Read', 'MultiEdit'].includes(toolName) && toolUse.input) {
    return formatFileTool(toolName, toolUse.input, toolIcon);
  }
  
  // Generic tool usage display
  let inputDisplay = '';
  if (toolUse.input && Object.keys(toolUse.input).length > 0) {
    const inputKeys = Object.keys(toolUse.input);
    if (inputKeys.length <= 3) {
      inputDisplay = inputKeys.map(key => {
        const value = toolUse.input[key];
        if (typeof value === 'string' && value.length > 50) {
          return `${key}: ${value.substring(0, 50)}...`;
        }
        return `${key}: ${value}`;
      }).join(', ');
    } else {
      inputDisplay = `${inputKeys.length} parameters`;
    }
  }
  
  return `
    <div class="tool-usage-block">
      <div class="tool-header">
        <span class="tool-icon">${toolIcon}</span>
        <span class="tool-name">${toolName}</span>
        <span class="tool-description">${toolDescription}</span>
      </div>
      ${inputDisplay ? `<div class="tool-input">${escapeHtml(inputDisplay)}</div>` : ''}
    </div>
  `;
}

/**
 * Formats Edit tool with enhanced file diff UI
 */
export function formatEditTool(input, toolIcon) {
  if (!input.file_path) return '';
  
  const fileName = input.file_path.split('/').pop() || input.file_path;
  const filePath = input.file_path;
  
  let changeInfo = '';
  if (input.old_string && input.new_string) {
    const oldLines = input.old_string.split('\n').length;
    const newLines = input.new_string.split('\n').length;
    const lineDiff = newLines - oldLines;
    changeInfo = lineDiff === 0 ? 'Modified content' : 
                lineDiff > 0 ? `+${lineDiff} lines` : 
                `${lineDiff} lines`;
  }
  
  return `
    <div class="file-edit-block">
      <div class="file-edit-header">
        <div class="file-edit-info">
          <span class="tool-icon">${toolIcon}</span>
          <div class="file-details">
            <div class="file-name">${escapeHtml(fileName)}</div>
            <div class="file-path">${escapeHtml(filePath)}</div>
          </div>
        </div>
        <div class="change-info">${changeInfo}</div>
      </div>
      
      ${input.old_string && input.new_string ? `
        <div class="file-diff">
          <div class="diff-section removed">
            <div class="diff-label">- Removed</div>
            <div class="diff-content"><pre><code>${escapeHtml(input.old_string)}</code></pre></div>
          </div>
          <div class="diff-section added">
            <div class="diff-label">+ Added</div>
            <div class="diff-content"><pre><code>${escapeHtml(input.new_string)}</code></pre></div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Formats other file tools (Write, Read, MultiEdit)
 */
export function formatFileTool(toolName, input, toolIcon) {
  const fileName = input.file_path ? (input.file_path.split('/').pop() || input.file_path) : 'Unknown file';
  const filePath = input.file_path || '';
  
  let actionText = '';
  switch (toolName) {
    case 'Write':
      actionText = 'Writing to file';
      break;
    case 'Read':
      actionText = 'Reading file';
      break;
    case 'MultiEdit':
      actionText = `Making ${input.edits ? input.edits.length : 'multiple'} edits`;
      break;
  }
  
  return `
    <div class="file-tool-block">
      <div class="file-tool-header">
        <span class="tool-icon">${toolIcon}</span>
        <div class="file-details">
          <div class="file-action">${actionText}</div>
          <div class="file-name">${escapeHtml(fileName)}</div>
          ${filePath ? `<div class="file-path">${escapeHtml(filePath)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Enhanced function to format tool results with editor-like UI
 */
export function formatToolResult(toolResult) {
  const content = toolResult.content;
  const toolUseId = toolResult.tool_use_id;
  
  // Try to extract tool name from the content or tool_use_id
  const toolName = extractToolNameFromResult(content, toolUseId);
  const resultIcon = getToolResultIcon(toolName);
  const fileName = extractFileNameFromResult(content, toolUseId);
  
  // Check if content looks like file content (has line numbers)
  const isFileContent = content && content.includes('→');
  
  if (isFileContent) {
    return formatFileContentResult(content, toolName, resultIcon, fileName, toolUseId);
  } else {
    return formatGenericToolResult(content, toolName, resultIcon, toolUseId);
  }
}

/**
 * Formats file content with text editor-like UI
 */
export function formatFileContentResult(content, toolName, resultIcon, fileName, toolUseId) {
  const lines = content.split('\n');
  const hasLineNumbers = lines[0] && lines[0].includes('→');
  
  // Process lines for better display
  let processedContent = '';
  let language = 'text';
  
  if (hasLineNumbers) {
    // Extract language from file extension
    if (fileName) {
      language = getLanguageFromFileName(fileName);
    }
    
    // Format lines with proper syntax highlighting structure
    const formattedLines = lines.map(line => {
      if (line.includes('→')) {
        const parts = line.split('→', 2);
        if (parts.length === 2) {
          const lineNum = parts[0].trim();
          const codeContent = parts[1] || '';
          return `<div class="editor-line" data-line="${lineNum}">
            <span class="line-number">${lineNum}</span>
            <span class="line-content">${escapeHtml(codeContent)}</span>
          </div>`;
        }
      }
      return `<div class="editor-line">
        <span class="line-content">${escapeHtml(line)}</span>
      </div>`;
    }).join('');
    
    processedContent = formattedLines;
  } else {
    // For content without line numbers, just escape and preserve formatting
    processedContent = `<div class="editor-content-raw">${escapeHtml(content)}</div>`;
  }
  
  // Create editor-like UI
  return `
    <div class="tool-result-editor">
      <div class="tool-result-header">
        <div class="header-left">
          <span class="result-icon">${resultIcon}</span>
          <span class="result-title">${toolName || 'Tool'} Result</span>
          ${fileName ? `<span class="file-name">${fileName}</span>` : ''}
        </div>
        <div class="header-right">
          ${toolUseId ? `<span class="tool-id">${toolUseId.slice(-8)}</span>` : ''}
          <button class="copy-btn" onclick="copyToolResult(this)" title="Copy content">
            <span class="copy-icon">📋</span>
          </button>
          ${hasLineNumbers ? `<button class="expand-btn" onclick="toggleExpand(this)" title="Expand/Collapse">
            <span class="expand-icon">⛶</span>
          </button>` : ''}
        </div>
      </div>
      <div class="tool-result-editor-content" data-language="${language}">
        ${processedContent}
      </div>
      ${hasLineNumbers ? `<div class="editor-footer">
        <span class="line-count">${lines.length} lines</span>
        <span class="language-badge">${language.toUpperCase()}</span>
      </div>` : ''}
    </div>
  `;
}

/**
 * Formats generic tool results (non-file content)
 */
export function formatGenericToolResult(content, toolName, resultIcon, toolUseId) {
  return `
    <div class="tool-result-generic">
      <div class="tool-result-header">
        <div class="header-left">
          <span class="result-icon">${resultIcon}</span>
          <span class="result-title">${toolName || 'Tool'} Result</span>
        </div>
        <div class="header-right">
          ${toolUseId ? `<span class="tool-id">${toolUseId.slice(-8)}</span>` : ''}
          <button class="copy-btn" onclick="copyToolResult(this)" title="Copy content">
            <span class="copy-icon">📋</span>
          </button>
        </div>
      </div>
      <div class="tool-result-content">
        <pre class="result-text">${escapeHtml(content)}</pre>
      </div>
    </div>
  `;
}

/**
 * Helper functions for extracting file name information from tool results
 */
function extractFileNameFromResultLocal(content, toolUseId) {
  // First try to get filename from pending tool use
  if (pendingToolUse && pendingToolUse.filePath) {
    const fileName = pendingToolUse.filePath.split('/').pop();
    // Clear pending tool use after using it
    pendingToolUse = null;
    return fileName;
  }
  
  // Try to extract filename from content if it looks like a file path
  if (content && content.includes('→')) {
    const firstLine = content.split('\n')[0];
    if (firstLine && firstLine.includes('import') || firstLine.includes('export') || firstLine.includes('function')) {
      // This looks like code, but we don't have filename info
      return null;
    }
  }
  return null;
}

/**
 * Gets programming language from filename extension
 */
function getLanguageFromFileName(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const languageMap = {
    'js': 'javascript',
    'ts': 'typescript',
    'jsx': 'javascript',
    'tsx': 'typescript',
    'py': 'python',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'cs': 'csharp',
    'php': 'php',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'swift': 'swift',
    'kt': 'kotlin',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'json': 'json',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'sh': 'bash',
    'sql': 'sql'
  };
  return languageMap[ext] || 'text';
}