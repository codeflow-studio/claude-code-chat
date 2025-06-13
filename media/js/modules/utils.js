/**
 * Utility Functions Module
 * Shared utilities and helper functions for the Claude Code extension
 */

// Constants
export const MENTION_REGEX = /@((?:\/|\w+:\/\/)[^\s]+?|[a-f0-9]{7,40}\b|problems\b|git-changes\b)(?=[.,;:!?]?(?=[\s\r\n]|$))/;
export const MENTION_REGEX_GLOBAL = new RegExp(MENTION_REGEX.source, 'g');

export const BASE_CONTEXT_ITEMS = [
  { type: 'problems', value: 'problems', label: 'Problems', description: 'Workspace problems' }
];

export const BUILT_IN_SLASH_COMMANDS = [
  { command: '/bug', description: 'Report bugs (sends conversation to Anthropic)', icon: '🐛' },
  { command: '/clear', description: 'Clear conversation history', icon: '🗑️' },
  { command: '/compact', description: 'Compact conversation with optional focus instructions', icon: '📦' },
  { command: '/config', description: 'View/modify configuration', icon: '⚙️' },
  { command: '/cost', description: 'Show token usage statistics', icon: '💰' },
  { command: '/doctor', description: 'Checks the health of your Claude Code installation', icon: '🏥' },
  { command: '/help', description: 'Get usage help', icon: '❓' },
  { command: '/init', description: 'Initialize project with CLAUDE.md guide', icon: '🚀' },
  { command: '/login', description: 'Switch Anthropic accounts', icon: '🔐' },
  { command: '/logout', description: 'Sign out from your Anthropic account', icon: '🚪' },
  { command: '/memory', description: 'Edit CLAUDE.md memory files', icon: '🧠' },
  { command: '/pr_comments', description: 'View pull request comments', icon: '💬' },
  { command: '/review', description: 'Request code review', icon: '👀' },
  { command: '/status', description: 'View account and system statuses', icon: '📊' },
  { command: '/terminal-setup', description: 'Install Shift+Enter key binding for newlines', icon: '⌨️' },
  { command: '/vim', description: 'Enter vim mode for alternating insert and command modes', icon: '📝' },
];

// HTML Utility Functions
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Debouncing Utility
export function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(null, args), delay);
  };
}

// Search and Filtering Functions
export function filterSlashCommands(query, allCommands) {
  const searchTerm = query.toLowerCase();
  return allCommands.filter(cmd => 
    cmd.command.toLowerCase().includes(searchTerm) ||
    cmd.description.toLowerCase().includes(searchTerm)
  );
}

export function shouldShowSlashCommands(text, position, isDirectMode) {
  // Don't show slash commands in Direct Mode
  if (isDirectMode) {
    return false;
  }
  
  // Check if text starts with "/" (at the beginning of input or after newline)
  const beforeCursor = text.slice(0, position);
  const lines = beforeCursor.split('\n');
  const currentLine = lines[lines.length - 1];
  
  // Only show if current line starts with "/" and no space before cursor
  if (currentLine.startsWith('/')) {
    const afterSlash = currentLine.substring(1, position - (beforeCursor.length - currentLine.length));
    // Don't show if there's a space after the slash
    if (afterSlash.includes(' ')) {
      return false;
    }
    return true;
  }
  
  return false;
}

export function shouldShowContextMenu(text, position) {
  const beforeCursor = text.slice(0, position);
  const atIndex = beforeCursor.lastIndexOf('@');
  
  if (atIndex !== -1) {
    const afterAt = beforeCursor.slice(atIndex + 1);
    // Only show if there's no space after @
    return !afterAt.includes(' ');
  }
  
  return false;
}

export function extractFilePathsFromText(text) {
  const filePaths = [];
  const matches = text.match(MENTION_REGEX_GLOBAL);
  if (matches) {
    matches.forEach(match => {
      // Remove the @ symbol and extract the path
      const path = match.substring(1);
      // Skip special mentions like 'problems', 'git-changes'
      if (path !== 'problems' && path !== 'git-changes') {
        filePaths.push(path);
      }
    });
  }
  return filePaths;
}

// Tool Utility Functions
export function getToolIcon(toolName) {
  const toolIcons = {
    'Bash': '⚡',
    'Read': '📖',
    'Write': '✍️',
    'Edit': '✏️',
    'MultiEdit': '📝',
    'Glob': '🔍',
    'Grep': '🔎',
    'LS': '📂',
    'Task': '📋',
    'NotebookRead': '📓',
    'NotebookEdit': '📓',
    'WebFetch': '🌐',
    'TodoRead': '📌',
    'TodoWrite': '📌',
    'WebSearch': '🔍',
    'mcp__server-sequential-thinking__sequentialthinking': '🤔',
    'mcp__Figma-Context-MCP__get_figma_data': '🎨',
    'mcp__Figma-Context-MCP__download_figma_images': '🖼️',
    'mcp__ide__getDiagnostics': '⚠️',
    'mcp__ide__executeCode': '▶️',
    'mcp__ios-simulator__ui_tap': '👆',
    'mcp__ios-simulator__ui_type': '⌨️',
    'mcp__ios-simulator__screenshot': '📸',
    'mcp__browser-tools-mcp__takeScreenshot': '📸',
    'mcp__XcodeBuildMCP__build_sim_name_ws': '🏗️',
    'default': '🔧'
  };
  return toolIcons[toolName] || toolIcons['default'];
}

export function getToolDescription(toolName) {
  const descriptions = {
    'Bash': 'Run command',
    'Read': 'Read file',
    'Write': 'Write file',
    'Edit': 'Edit file',
    'MultiEdit': 'Multi-edit file',
    'Glob': 'Find files',
    'Grep': 'Search content',
    'LS': 'List directory',
    'Task': 'Execute task',
    'NotebookRead': 'Read notebook',
    'NotebookEdit': 'Edit notebook',
    'WebFetch': 'Fetch web content',
    'TodoRead': 'Read todos',
    'TodoWrite': 'Write todos',
    'WebSearch': 'Search web',
    'mcp__server-sequential-thinking__sequentialthinking': 'Think sequentially',
    'mcp__Figma-Context-MCP__get_figma_data': 'Get Figma data',
    'mcp__Figma-Context-MCP__download_figma_images': 'Download Figma images',
    'mcp__ide__getDiagnostics': 'Get diagnostics',
    'mcp__ide__executeCode': 'Execute code',
    'mcp__ios-simulator__ui_tap': 'Tap simulator',
    'mcp__ios-simulator__ui_type': 'Type in simulator',
    'mcp__ios-simulator__screenshot': 'Screenshot simulator',
    'mcp__browser-tools-mcp__takeScreenshot': 'Screenshot browser',
    'mcp__XcodeBuildMCP__build_sim_name_ws': 'Build Xcode project',
    'default': 'Use tool'
  };
  return descriptions[toolName] || descriptions['default'];
}

export function getToolResultIcon(toolName) {
  const resultIcons = {
    'Bash': '📋',
    'Read': '📄',
    'Write': '💾',
    'Edit': '✅',
    'MultiEdit': '✅',
    'Glob': '📁',
    'Grep': '📊',
    'LS': '📋',
    'Task': '✅',
    'NotebookRead': '📄',
    'NotebookEdit': '💾',
    'WebFetch': '📄',
    'TodoRead': '📄',
    'TodoWrite': '💾',
    'WebSearch': '📄',
    'mcp__server-sequential-thinking__sequentialthinking': '💭',
    'mcp__Figma-Context-MCP__get_figma_data': '📄',
    'mcp__Figma-Context-MCP__download_figma_images': '💾',
    'mcp__ide__getDiagnostics': '📄',
    'mcp__ide__executeCode': '📄',
    'mcp__ios-simulator__ui_tap': '✅',
    'mcp__ios-simulator__ui_type': '✅',
    'mcp__ios-simulator__screenshot': '📄',
    'mcp__browser-tools-mcp__takeScreenshot': '📄',
    'mcp__XcodeBuildMCP__build_sim_name_ws': '📄',
    'default': '📄'
  };
  return resultIcons[toolName] || resultIcons['default'];
}

export function extractToolNameFromResult(content, toolUseId) {
  // Try to extract tool name from common patterns
  const patterns = [
    /Running:\s*([^\n]+)/,
    /Executing:\s*([^\n]+)/,
    /Tool:\s*([^\n]+)/,
    /Command:\s*([^\n]+)/
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return null;
}

export function extractFileNameFromResult(content, toolUseId) {
  // Try to extract filename from common patterns
  const patterns = [
    /File:\s*([^\n]+)/,
    /Reading:\s*([^\n]+)/,
    /Writing:\s*([^\n]+)/,
    /Editing:\s*([^\n]+)/,
    /Path:\s*([^\n]+)/
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return null;
}

// UI Helper Functions
export function isUserNearBottom(container, threshold = 100) {
  if (!container) return true;
  return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
}

export function insertDroppedPaths(paths, messageInputElement) {
  if (!messageInputElement || !paths || paths.length === 0) return;
  
  // Convert paths to @ mentions
  const mentions = paths.map(path => `@${path}`).join(' ');
  
  // Get current cursor position
  const cursorPosition = messageInputElement.selectionStart;
  const currentValue = messageInputElement.value;
  
  // Add space before mentions if needed
  const beforeCursor = currentValue.slice(0, cursorPosition);
  const needsSpaceBefore = beforeCursor.length > 0 && !beforeCursor.endsWith(' ');
  const mentionsToInsert = (needsSpaceBefore ? ' ' : '') + mentions + ' ';
  
  // Insert mentions at cursor position
  const newValue = beforeCursor + mentionsToInsert + currentValue.slice(cursorPosition);
  messageInputElement.value = newValue;
  
  // Set cursor position after inserted mentions
  const newCursorPosition = cursorPosition + mentionsToInsert.length;
  messageInputElement.setSelectionRange(newCursorPosition, newCursorPosition);
  
  // Trigger input event to update UI
  messageInputElement.dispatchEvent(new Event('input', { bubbles: true }));
}

// Date/Time Utilities
export function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString();
}

// Command Management
export function updateCustomCommands(customCommands, allCommands, builtInCommands) {
  let customSlashCommands = [];
  
  if (Array.isArray(customCommands) && customCommands.length > 0) {
    console.log('Updating custom commands:', customCommands);
    // Clear any previous custom commands
    customSlashCommands = [];
    // Add new custom commands, ensuring no duplicates by checking if command already exists
    customCommands.forEach(cmd => {
      // Check if we already have this command (prevents duplicates)
      const exists = customSlashCommands.some(existing => existing.command === cmd.command);
      if (!exists) {
        customSlashCommands.push(cmd);
      }
    });
    
    // Reset ALL_SLASH_COMMANDS to just built-in commands
    allCommands.length = 0;
    allCommands.push(...builtInCommands);
    // Add unique custom commands
    allCommands.push(...customSlashCommands);
    
    console.log('Updated ALL_SLASH_COMMANDS:', allCommands);
  }
  
  return customSlashCommands;
}