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
  isUserNearBottom,
  handleSmartScroll,
  hideNewMessageIndicator
} from './utils.js';

// VS Code API instance (will be set during initialization)
let vscode = null;

// Enhanced tool execution tracking for parallel tool calls
let toolExecutionGroups = new Map();
let currentGroupId = null;

/**
 * Initialize the message handler with VS Code API instance
 */
export function initializeMessageHandler(vscodeApi) {
  vscode = vscodeApi;
}

/**
 * Creates a formatted message element for Direct Mode display
 */
export function createMessage(type, content, timestamp, subtype, metadata, displayName) {
  const time = formatTime(timestamp);
  let messageHTML = '';

  switch (type) {
    case 'user':
      const userContent = content || 'User message';
      // Check if this is a tool result that needs special formatting
      const isToolResult = userContent.includes('Tool result (') || userContent.includes('→');
      const formattedUserContent = isToolResult ? formatToolResultString(userContent) : escapeHtml(userContent);
      
      messageHTML = `
        <div class="message-header">
          <span class="message-sender">You</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-content user-content">${formattedUserContent}</div>
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
          usageInfo = `<span class="usage-info">Input: ${usage.input_tokens || 0} • Output: ${usage.output_tokens || 0}</span>`;
        }
      }
      
      messageHTML = `
        <div class="message-header">
          ${usageInfo ? `<span class="message-sender assistant-sender">${usageInfo}</span>` : ''}
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
export function addDirectModeMessage(type, content, timestamp, subtype, metadata, displayName, isUpdate, isProcessRunning, toolExecutionContext) {
  const directModeMessages = document.getElementById('directModeMessages');
  if (!directModeMessages) return;
  
  // Check for permission requests in user messages
  if (type === 'user' && content) {
    const permissionInfo = isPermissionRequest(content);
    if (permissionInfo) {
      // Extract session ID from metadata or current state
      const sessionId = metadata?.sessionId || metadata?.session_id || 'unknown';
      
      // Show permission dialog instead of error message
      const permissionHTML = createPermissionDialog(permissionInfo.toolName, sessionId);
      
      const messageElement = document.createElement('div');
      messageElement.className = 'direct-mode-message permission-request-message';
      messageElement.innerHTML = permissionHTML;
      
      directModeMessages.appendChild(messageElement);
      
      // Scroll to show the permission dialog
      handleSmartScroll(directModeMessages, true);
      
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
    handleToolExecutionContext(directModeMessages, type, toolExecutionContext, content, timestamp, subtype, metadata, displayName);
    return;
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
  
  // Convert thinking blocks with special styling and expand functionality
  formatted = formatted.replace(/🤔 Thinking: (.*?)(?=🔧|$)/gs, function(match, thinkingContent) {
    const thinkingId = 'thinking-' + Math.random().toString(36).substr(2, 9);
    const contentPreview = thinkingContent.trim().substring(0, 100);
    const hasMoreContent = thinkingContent.trim().length > 100;
    
    return `<div class="thinking-block collapsed" data-thinking-id="${thinkingId}">
      <div class="thinking-header" data-toggle-thinking="${thinkingId}">
        <span class="thinking-icon">🤔</span>
        <span class="thinking-title">Claude is thinking...</span>
        <span class="thinking-expand-indicator">▶</span>
      </div>
      <div class="thinking-content" data-thinking-content="${thinkingId}">
        <div class="thinking-preview">${hasMoreContent ? contentPreview + '...' : thinkingContent.trim()}</div>
        <div class="thinking-full" style="display: none;">${thinkingContent.trim()}</div>
      </div>
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
 * Note: In compact mode, tool_use items are handled by the tool execution group system
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
          const thinkingId = 'thinking-' + Math.random().toString(36).substr(2, 9);
          const contentPreview = item.thinking.substring(0, 100);
          const hasMoreContent = item.thinking.length > 100;
          
          formattedParts.push(`
            <div class="thinking-block collapsed" data-thinking-id="${thinkingId}">
              <div class="thinking-header" data-toggle-thinking="${thinkingId}">
                <span class="thinking-icon">🤔</span>
                <span class="thinking-title">Claude is thinking...</span>
                <span class="thinking-expand-indicator">▶</span>
              </div>
              <div class="thinking-content" data-thinking-content="${thinkingId}">
                <div class="thinking-preview">${escapeHtml(hasMoreContent ? contentPreview + '...' : item.thinking)}</div>
                <div class="thinking-full" style="display: none;">${escapeHtml(item.thinking)}</div>
              </div>
            </div>
          `);
        }
        break;
        
      case 'tool_use':
        // Skip tool_use items in structured content - they're handled by tool execution groups
        // This eliminates the redundant "Using tool: ToolName" messages
        break;
        
      case 'tool_result':
        // Skip tool_result items in structured content - they're handled by tool execution groups
        // This prevents duplicate display of results
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
          <button class="copy-btn" data-copy-result="true" title="Copy content">
            <span class="copy-icon">📋</span>
          </button>
          ${hasLineNumbers ? `<button class="expand-btn" data-toggle-expand="true" title="Expand/Collapse">
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
          <button class="copy-btn" data-copy-result="true" title="Copy content">
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

/**
 * Formats a tool result string (like from Read tool output) into a nice UI
 */
export function formatToolResultString(content) {
  if (!content) return '';
  
  // Extract tool name and filename from content like "Tool result (Mahjef24):"
  const firstLine = content.split('\n')[0];
  let toolName = 'Tool';
  let fileName = '';
  
  // Parse tool result header
  const toolResultMatch = firstLine.match(/Tool result \(([^)]+)\):/);
  if (toolResultMatch) {
    toolName = toolResultMatch[1];
  }
  
  // Get the actual content (everything after the first line)
  const lines = content.split('\n');
  const actualContent = lines.slice(1).join('\n');
  
  // Check if content has line numbers (like "1→# Planning Poker Application")
  const hasLineNumbers = actualContent.includes('→');
  
  if (hasLineNumbers) {
    // Extract filename from content patterns
    const contentLines = actualContent.split('\n');
    if (contentLines.length > 0) {
      const firstContentLine = contentLines[0];
      // Look for common patterns to determine file type
      if (firstContentLine.includes('# ') || firstContentLine.includes('## ')) {
        fileName = 'README.md';
      } else if (firstContentLine.includes('<!DOCTYPE') || firstContentLine.includes('<html')) {
        fileName = 'index.html';
      } else if (firstContentLine.includes('package.json') || firstContentLine.includes('"name"')) {
        fileName = 'package.json';
      }
      // Add more patterns as needed
    }
    
    return formatFileContentForDisplay(actualContent, fileName || 'File');
  } else {
    // Generic tool result - just clean up the display
    return `
      <div class="tool-result-generic">
        <div class="tool-result-header">
          <div class="header-left">
            <span class="result-icon">🔧</span>
            <span class="result-title">Tool Result</span>
          </div>
        </div>
        <div class="tool-result-content">
          <pre class="result-text">${escapeHtml(actualContent)}</pre>
        </div>
      </div>
    `;
  }
}

/**
 * Formats file content with proper line numbers and syntax highlighting
 */
function formatFileContentForDisplay(content, fileName) {
  const lines = content.split('\n');
  const language = getLanguageFromFileName(fileName) || 'text';
  
  // Process lines to remove the "N→" prefixes and create proper line numbers
  let processedLines = [];
  let lineNumber = 1;
  
  for (const line of lines) {
    if (line.includes('→')) {
      // Extract content after the arrow
      const parts = line.split('→');
      if (parts.length > 1) {
        processedLines.push(parts.slice(1).join('→')); // Handle multiple arrows
      } else {
        processedLines.push('');
      }
    } else {
      processedLines.push(line);
    }
  }
  
  // Create the formatted display
  const editorContent = processedLines.map((line, index) => {
    const lineNum = index + 1;
    return `
      <div class="editor-line">
        <span class="line-number">${lineNum}</span>
        <span class="line-content">${escapeHtml(line)}</span>
      </div>
    `;
  }).join('');
  
  return `
    <div class="tool-result-editor">
      <div class="tool-result-header">
        <div class="header-left">
          <span class="result-icon">📖</span>
          <span class="result-title">Read</span>
          <span class="file-name">${escapeHtml(fileName)}</span>
        </div>
        <div class="header-right">
          <span class="language-badge">${language}</span>
          <span class="tool-id">tool</span>
        </div>
      </div>
      <div class="tool-result-editor-content">
        ${editorContent}
      </div>
      <div class="editor-footer">
        <span class="line-count">${processedLines.length} lines</span>
        <span class="language-badge">${language}</span>
      </div>
    </div>
  `;
}

/**
 * Handle tool execution context for enhanced parallel tool display
 * Enhanced to handle Task workflows with hierarchical display
 */
export function handleToolExecutionContext(directModeMessages, type, toolExecutionContext, content, timestamp, subtype, metadata, displayName) {
  const { toolExecutions, executionGroup, taskExecution, isTaskWorkflow } = toolExecutionContext;
  
  if (!toolExecutions || toolExecutions.length === 0) {
    // Fallback to normal message display
    const messageElement = document.createElement('div');
    messageElement.className = `direct-mode-message ${type}-message`;
    messageElement.innerHTML = createMessage(type, content, timestamp, subtype, metadata, displayName);
    directModeMessages.appendChild(messageElement);
    return;
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
    
    // Attach event listeners to newly created group
    attachToolExecutionEventListeners(groupElement);
  } else {
    // Update existing group
    const container = groupElement.querySelector('.tool-execution-container');
    if (container) {
      container.innerHTML = formatToolExecutionList(executionGroup.executions);
      
      // Re-attach event listeners after updating content
      attachToolExecutionEventListeners(groupElement);
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
          
          // Re-attach event listeners to ensure clickability
          attachToolExecutionEventListeners(groupElement);
          
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

/**
 * Generate a compact summary for tool results
 */
export function generateResultSummary(result, toolName) {
  if (!result || !result.content) return '';
  
  const content = result.content;
  
  switch (toolName) {
    case 'Read':
      // For file reads, show line count and file type
      if (content.includes('→')) {
        const lines = content.split('\n').length - 1;
        return `${lines} lines`;
      }
      return 'file content';
      
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      return 'modified';
      
    case 'TodoWrite':
      if (content.includes('successfully')) {
        return 'updated';
      }
      return 'modified';
      
    case 'Bash':
      // Show just success/error for commands
      if (content.includes('error') || content.includes('Error')) {
        return 'error';
      }
      return 'executed';
      
    case 'Grep':
    case 'Glob':
      // Count matches or files
      const fileMatches = (content.match(/Found \d+/i) || [])[0];
      if (fileMatches) {
        return fileMatches.toLowerCase();
      }
      return 'results';
      
    default:
      // Generic summary - first 30 chars
      const firstLine = content.split('\n')[0];
      if (firstLine && firstLine.length > 30) {
        return firstLine.substring(0, 30) + '...';
      }
      return firstLine || 'completed';
  }
}

// Global functions for UI interactions
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
    
    // Add event listeners after creating the HTML
    attachTaskWorkflowEventListeners(groupElement);
    
    directModeMessages.appendChild(groupElement);
  } else {
    // Update existing Task workflow group
    const container = groupElement.querySelector('.task-sub-tools-container');
    if (container) {
      container.innerHTML = formatTaskSubTools(executionGroup.executions, taskExecution);
      // Re-attach event listeners for the updated content
      attachTaskWorkflowEventListeners(groupElement);
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
function getTaskStatusIcon(status) {
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
function updateTaskWorkflowStatus(groupElement, executionGroup, taskExecution) {
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

/**
 * Attach general event listeners to message elements
 */
function attachGeneralEventListeners(messageElement) {
  // Copy result buttons
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
}

/**
 * Attach thinking block event listeners to message elements
 */
function attachThinkingBlockEventListeners(messageElement) {
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
function attachToolExecutionEventListeners(messageElement) {
  // Tool execution header toggles
  const toolHeaders = messageElement.querySelectorAll('[data-toggle-tool]');
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
function attachTaskWorkflowEventListeners(groupElement) {
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
 * Permission Dialog Functions
 */

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
export function createPermissionDialog(toolName, sessionId) {
  const toolDisplayName = toolName === 'Bash' ? 'Bash (shell commands)' : toolName;
  const toolDescription = getToolDescription(toolName);
  
  return `
    <div class="permission-dialog" data-session-id="${escapeHtml(sessionId)}" data-tool-name="${escapeHtml(toolName)}">
      <div class="permission-dialog-header">
        <span class="permission-dialog-icon">🛡️</span>
        Permission Request
      </div>
      <div class="permission-dialog-content">
        Claude is requesting permission to use the <span class="permission-dialog-tool-name">${escapeHtml(toolDisplayName)}</span> tool.
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
          Approve All ${escapeHtml(toolName)}
        </button>
        <button class="permission-dialog-button reject" data-action="reject">
          Reject
        </button>
      </div>
    </div>
  `;
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
      
      // Send permission response to extension
      vscode.postMessage({
        command: 'permissionResponse',
        action: action,
        toolName: toolName,
        sessionId: sessionId
      });
      
      // Show feedback message
      const feedbackMessage = action === 'approve' ? 'Permission granted' :
                            action === 'approve-all' ? `Permission granted for all ${toolName} requests` :
                            'Permission denied';
      
      dialog.innerHTML = `
        <div class="permission-dialog-content" style="text-align: center; padding: 16px;">
          ${escapeHtml(feedbackMessage)}${action === 'reject' ? '. Process stopped.' : '. Continuing...'}
        </div>
      `;
      
      // Remove dialog after 2 seconds if not rejected
      if (action !== 'reject') {
        setTimeout(() => {
          dialog.remove();
        }, 2000);
      }
    }
  });
}