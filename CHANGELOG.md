# Change Log

All notable changes to the "Claude Code" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.3] - 2025-05-20

### Added
- Enhanced drag and drop functionality with improved user interface
- Comprehensive file handling for both VSCode Explorer and external sources
- Visual feedback during drag operations
- Better handling of image files with proper preview functionality
- Support for multiple file types from various sources
- Proper path resolution for relative/absolute paths
- Terminal visibility improvements
- Custom slash commands support with configuration
- Documentation for custom slash commands usage

## [0.0.2] - 2025-05-20

### Added
- Updated README with new images and improved layout
- Show terminal in the background before sending text to preserve focus
- Update image button to use SVG icon and adjust styles for better integration

## [0.0.1] - 2025-05-19

### Added
- Initial release of Claude Code VSCode Extension
- Interactive chat interface with Claude Code
- Terminal input webview in sidebar
- Support for images (drag & drop, paste, file selection)
- @mentions for workspace problems and terminal output
- Slash commands for quick access to Claude features
- Session persistence within VSCode
- Auto-start Claude process on activation
- Restart command for Claude process
- Markdown rendering with syntax highlighting
- Copy code and text from responses
- Clear conversation functionality

### Features
- Launch Claude Code terminal from command palette or sidebar
- Persistent conversation history during VSCode session
- Real-time status indicators for Claude process state
- Error handling and automatic recovery
- Support for multiple image formats (JPG, PNG, GIF, WebP, SVG)
- Context-aware mentions for problems and terminal output

### Known Issues
- Session history is not persisted after VSCode restart
- Full workspace context sharing is still in development