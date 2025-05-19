# Claude Code Assistant for VSCode

A VSCode extension that integrates Anthropic's Claude Code command-line AI coding assistant directly into Visual Studio Code.

## Features

- Seamless integration of Claude Code into VSCode
- Dedicated chat panel in the sidebar
- Maintain persistent Claude Code sessions
- Context-aware interactions with your workspace
- Image support: Attach images via drag-drop, paste, or file selection
- @mentions for workspace problems and terminal output
- Slash commands for quick access to Claude Code features

## Prerequisites

- VSCode 1.70.0 or newer
- Claude Code CLI installed on your system
- Authentication with Anthropic services

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

## Usage

### Working with Images

The extension supports attaching images to your messages:

1. **File Selection**: Click the image button (📎) in the input area
2. **Drag and Drop**: Drag image files onto the input area
3. **Paste**: Copy an image and paste with Ctrl/Cmd+V

Supported formats: JPG, PNG, GIF, WebP, SVG

Images are temporarily saved and their paths are sent to Claude Code. See [Using Images](docs/using-images.md) for detailed documentation.

## Development

- `npm run compile` - Compile the extension
- `npm run watch` - Watch for changes and recompile
- `npm run package` - Package the extension for production (webpack)
- `npm run lint` - Run ESLint on source files
- `npm run test` - Run tests
- `npm run vsix` - Create VSIX package for installation

## License

[Add license information here]