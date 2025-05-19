export interface SlashCommand {
  command: string;
  description: string;
  icon?: string;
  shortcut?: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
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

export function filterSlashCommands(input: string): SlashCommand[] {
  const searchTerm = input.toLowerCase();
  return SLASH_COMMANDS.filter(cmd => 
    cmd.command.toLowerCase().includes(searchTerm) ||
    cmd.description.toLowerCase().includes(searchTerm)
  );
}

export function getSlashCommand(command: string): SlashCommand | undefined {
  return SLASH_COMMANDS.find(cmd => cmd.command === command);
}