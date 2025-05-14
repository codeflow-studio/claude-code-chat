# Claude Code Assistant for VSCode

A VSCode extension that integrates Anthropic's Claude Code command-line AI coding assistant directly into Visual Studio Code.

## Features

- Interact with Claude Code directly within VSCode
- Maintain persistent Claude Code sessions
- Context-aware code understanding and generation
- Apply code changes suggested by Claude Code directly to files

## Requirements

- VSCode 1.70.0 or newer
- Claude Code CLI installed on your system

## Installation

1. Install this extension from the VSCode Marketplace
2. Ensure Claude Code CLI is installed and properly authenticated
3. Access Claude Code through the sidebar or command palette

## Usage

- Click on the Claude Code icon in the activity bar to open the chat panel
- Use the command palette and type "Claude Code" to see available commands
- Select code and use the context menu to ask Claude about it

## Extension Settings

This extension contributes the following settings:

* `claudeCode.autoStart`: Automatically start Claude Code when VSCode launches
* `claudeCode.panelLocation`: Preferred location for the Claude Code chat panel

## Known Issues

- Initial MVP version with limited functionality
- See GitHub issues for more details

## Release Notes

### 0.0.1

Initial MVP release with basic functionality.