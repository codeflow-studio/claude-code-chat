import { customCommandService } from '../service/customCommandService';

export interface SlashCommand {
  command: string;
  description: string;
  icon?: string;
  shortcut?: string;
  isCustom?: boolean;  // Flag to identify custom commands
}

export const BUILT_IN_SLASH_COMMANDS: SlashCommand[] = [
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

// Keep this for backward compatibility
export const SLASH_COMMANDS = BUILT_IN_SLASH_COMMANDS;

/**
 * Gets all available slash commands including custom ones
 * @returns All slash commands (built-in and custom)
 */
export async function getAllSlashCommands(): Promise<SlashCommand[]> {
  await customCommandService.scanCustomCommands();
  const customCommands = customCommandService.getCustomCommands();
  
  // Combine built-in and custom commands
  return [...BUILT_IN_SLASH_COMMANDS, ...customCommands];
}

/**
 * Filter slash commands based on input
 * @param input The search input
 * @param commands The array of commands to filter (defaults to built-in commands)
 * @returns Filtered slash commands
 */
export function filterSlashCommands(input: string, commands: SlashCommand[] = BUILT_IN_SLASH_COMMANDS): SlashCommand[] {
  const searchTerm = input.toLowerCase();
  return commands.filter(cmd => 
    cmd.command.toLowerCase().includes(searchTerm) ||
    cmd.description.toLowerCase().includes(searchTerm)
  );
}

/**
 * Gets a slash command by its exact name
 * @param command The command name to find
 * @param commands The array of commands to search (defaults to built-in commands)
 * @returns The found command or undefined
 */
export function getSlashCommand(command: string, commands: SlashCommand[] = BUILT_IN_SLASH_COMMANDS): SlashCommand | undefined {
  return commands.find(cmd => cmd.command === command);
}