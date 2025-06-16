/**
 * Message Formatting Module
 * Handles all message content formatting and display logic
 */

import { 
  escapeHtml, 
  getToolIcon, 
  getToolDescription, 
  getToolResultIcon, 
  extractToolNameFromResult, 
  extractFileNameFromResult,
  formatTime
} from './utils.js';

/**
 * Creates a formatted message element for Direct Mode display
 */
export function createMessage(type, content, timestamp, subtype, metadata, displayName) {
  const time = formatTime(timestamp);
  let messageHTML = '';

  switch (type) {
    case 'user':
      const userContent = content || 'User message';
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
  
  // Apply basic markdown formatting
  formatted = applyMarkdownFormatting(formatted);
  
  return formatted;
}

/**
 * Applies basic markdown formatting to text
 */
function applyMarkdownFormatting(text) {
  return text
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
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
          textFormatted = applyMarkdownFormatting(textFormatted);
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
      case 'tool_result':
        // Skip tool_use/tool_result items - handled by tool execution groups
        break;
        
      default:
        if (item.text || item.content) {
          formattedParts.push(`<div class="content-unknown">${escapeHtml(item.text || item.content)}</div>`);
        }
    }
  });
  
  return formattedParts.join('');
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
    }
    
    return formatFileContentForDisplay(actualContent, fileName || 'File');
  } else {
    return `
      <div class="tool-result-generic">
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
      <div class="tool-result-editor-content">
        ${editorContent}
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