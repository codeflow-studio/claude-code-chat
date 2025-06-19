/**
 * Tool Formatting Module
 * Handles formatting for tool usage, results, and execution displays
 */

import { 
  escapeHtml, 
  getToolIcon, 
  getToolDescription, 
  getToolResultIcon, 
  extractToolNameFromResult, 
  extractFileNameFromResult
} from './utils.js';

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
          return `<div class="editor-line" data-line="${lineNum}"><span class="line-number">${lineNum}</span><span class="line-content">${escapeHtml(codeContent)}</span></div>`;
        }
      }
      return `<div class="editor-line"><span class="line-content">${escapeHtml(line)}</span></div>`;
    }).join('');
    
    processedContent = formattedLines;
  } else {
    // For content without line numbers, just escape and preserve formatting
    processedContent = `<div class="editor-content-raw">${escapeHtml(content)}</div>`;
  }
  
  // Create clean content-only UI
  return `<div class="tool-result-editor"><div class="tool-result-editor-content" data-language="${language}">${processedContent}</div></div>`;
}

/**
 * Formats generic tool results (non-file content)
 */
export function formatGenericToolResult(content, toolName, resultIcon, toolUseId) {
  return `<div class="tool-result-generic"><div class="tool-result-content"><pre class="result-text">${escapeHtml(content)}</pre></div></div>`;
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