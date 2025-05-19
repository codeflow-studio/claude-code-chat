# Claude Code Assistant for VSCode

![Claude Code](resources/claude-icon.png)

*Unofficial integration* of Anthropic's Claude Code AI assistant into Visual Studio Code. Get intelligent coding assistance without leaving your editor.

> **Disclaimer**: This is an unofficial extension not affiliated with Anthropic. It integrates with the official Claude Code CLI tool which must be installed separately.

## Features

### 🤖 AI-Powered Coding Assistant
- **Seamless Integration**: Access Claude Code directly from VSCode's sidebar
- **Persistent Sessions**: Maintain conversations across your coding sessions
- **Context-Aware**: Claude understands your workspace and current files

### 🖼️ Visual Context Support
- **Drag & Drop Images**: Simply drag images into the chat
- **Paste Screenshots**: Ctrl/Cmd+V to paste images directly
- **File Selection**: Use the image button to browse and attach files
- **Multiple Formats**: Supports JPG, PNG, GIF, WebP, and SVG

### 💬 Smart Interactions
- **@mentions**: Reference workspace problems and terminal output
- **Slash Commands**: Quick access to Claude's powerful features
- **Markdown Support**: Rich formatting with syntax highlighting
- **Code Actions**: Copy code blocks with one click

### 🎨 Beautiful Interface
- **Claude-Styled UI**: Familiar interface matching Claude's design
- **Dark/Light Theme**: Adapts to your VSCode theme
- **Status Indicators**: Real-time feedback on Claude's state
- **Clear History**: Easy conversation management

## Prerequisites

- Visual Studio Code 1.70.0 or newer
- [Claude Code CLI](https://docs.anthropic.com/claude/docs/claude-code) installed on your system
- Active Claude account with authentication

## Building the Extension

To build the extension, follow these steps:

1. Install dependencies:
   ```
   npm install
   ```

2. Build the extension:
   ```
   npm run build
   ```

This will generate a .vsix file in the project root directory.

## Installing the Extension

### From the VSIX file

1. Open VSCode
2. Go to the Extensions view
3. Click the "..." menu (top-right of Extensions view)
4. Select "Install from VSIX..."
5. Browse to the .vsix file generated in the build step
6. Select the file and click "Install"

### From the Command Line

You can also install the extension using the VSCode CLI:

```
code --install-extension claude-code-extension-0.0.1.vsix
```

## Getting Started

1. Install the extension from the VSCode Marketplace
2. Open the Claude Code panel from the sidebar (look for the Claude icon)
3. The extension will automatically start Claude Code when activated
4. Start chatting with Claude about your code!

## Usage

### 💬 Basic Chat
- Type your questions or requests in the input area
- Press Enter or click Send to submit
- Claude will respond with helpful suggestions and code

### 🖼️ Working with Images
- **Drag & Drop**: Drag image files directly onto the input area
- **Paste**: Copy an image and paste with Ctrl/Cmd+V 
- **Browse**: Click the 📎 button to select image files
- Supported: JPG, PNG, GIF, WebP, SVG

### 🔧 Advanced Features
- **@mentions**: Type @ to reference problems or terminal output
- **Slash Commands**: Type / to see available commands
- **Clear Chat**: Click the clear button to start fresh
- **Restart Claude**: Use the restart button if needed

See our [documentation](https://github.com/anthropic/claude-code-extension/tree/main/docs) for detailed guides.

## Development

- `npm run compile` - Compile the extension
- `npm run watch` - Watch for changes and recompile
- `npm run package` - Package the extension for production (webpack)
- `npm run lint` - Run ESLint on source files
- `npm run test` - Run tests
- `npm run vsix` - Create VSIX package for installation

## Support

- 📖 [Documentation](https://github.com/codeflow-studio/claude-code-extension/tree/main/docs)
- 🐛 [Report Issues](https://github.com/codeflow-studio/claude-code-extension/issues)
- 💬 [Discussions](https://github.com/codeflow-studio/claude-code-extension/discussions)

## License

MIT License - see [LICENSE.md](LICENSE.md) for details

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

---

Made with ❤️ by [CodeFlow Studio](https://github.com/codeflow-studio)

*This is an unofficial extension. Claude and Claude Code are trademarks of Anthropic, PBC.*