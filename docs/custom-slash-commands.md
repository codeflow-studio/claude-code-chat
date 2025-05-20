# Custom Slash Commands

Claude Code VSCode Extension supports custom slash commands for quick access to frequently used prompts or operations.

## Types of Custom Commands

### Project Commands

Project commands are specific to your project and accessible to anyone working with the project repository.

- **Location**: `.claude/commands/` directory in your project
- **Format**: Markdown files (`.md` extension)
- **Usage**: `/project:command-name [arguments]`

### User Commands

User commands are personal commands that work across all projects on your machine.

- **Location**: `~/.claude/commands/` directory in your home folder
- **Format**: Markdown files (`.md` extension)
- **Usage**: `/user:command-name [arguments]`

## How It Works

The VSCode extension provides **autocomplete suggestions** for your custom commands, making them easy to discover and use.

When you type `/`, the extension scans for custom commands and displays them alongside built-in commands.

When you select and execute a custom command, it's sent directly to Claude Code CLI which processes the command - the VSCode extension simply provides the suggestions.

## Creating Custom Commands

1. Create the appropriate directory:
   - Project commands: `mkdir -p .claude/commands` (in your project root)
   - User commands: `mkdir -p ~/.claude/commands` (in your home directory)

2. Create a Markdown file with your command content:
   - The filename (without extension) becomes the command name
   - The content of the file is the prompt that Claude Code CLI will read
   - Example: `.claude/commands/optimize.md` creates the command `/project:optimize`

3. For commands that accept arguments, use the `$ARGUMENTS` placeholder in your command content.
   - Example: If your command file contains `Find and fix issue #$ARGUMENTS`, calling `/project:fix-issue 123` will replace `$ARGUMENTS` with `123`

## Examples

### Project Command Example

1. Create a file `.claude/commands/optimize.md` with the content:

```markdown
# Optimize Code

Please optimize the following code for performance and readability:

$ARGUMENTS

Focus on:
- Reducing time complexity
- Improving memory usage
- Making the code more readable
- Adding appropriate comments
```

2. Use it in the Claude VSCode extension by typing `/project:optimize` followed by your code.

### User Command Example

1. Create a file `~/.claude/commands/ios-developer.md` with the content:

```markdown
# iOS Developer Mode

I want you to act as an experienced iOS developer with deep knowledge of Swift, UIKit, and SwiftUI. Please help me with the following:

$ARGUMENTS

Focus on Swift best practices and modern iOS development patterns.
```

2. Use it by typing `/user:ios-developer` followed by your question or code.

## Updating Commands

The extension monitors your command directories and automatically refreshes the command list when you:

1. Create, modify, or delete command files in the `.claude/commands/` or `~/.claude/commands/` directories
2. Commands will be visible in the slash command autocomplete menu the next time you type `/`

## Tips

- The first line of the command file can be used as a description (if it starts with `#`)
- Commands can include any markdown formatting
- User commands work across all projects, making them ideal for personal workflows
- Project commands are great for standardizing prompts across your team