# Change Log

All notable changes to the "Claude Code" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.7] - 2025-05-22

### Added
- **Interactive Problem Selection UI**: Added sophisticated problem selection interface with preview functionality for easier debugging workflow
- **Line Number Information**: Enhanced code selections now include precise line number information for better context sharing
- **Problem Selector with Preview**: Visual problem browser with code preview to quickly identify and share relevant issues with Claude

### Enhanced
- **Developer Experience**: Improved problem navigation and code sharing workflows
- **Context Accuracy**: Better precision in code location sharing through line number integration
- **UI/UX**: More intuitive problem selection interface with visual previews

## [0.0.6] - 2025-05-21

### Added
- **Context Menu Integration**: Added "Add to Claude Code Input" option to editor context menu for selected code
- **VSCode Problems Integration**: Direct integration with VSCode's problems panel for enhanced error handling and reporting
- **Selection-to-Input**: Seamlessly add selected code snippets directly to Claude Code input for analysis

### Enhanced
- **Developer Workflow**: Improved integration with VSCode's native features for a more streamlined coding experience
- **Code Analysis**: Better support for sharing selected code segments with Claude for targeted assistance

## [0.0.5] - 2025-05-21

### Fixed
- **Input Field Scrolling**: Fixed issue where long file paths would create unwanted horizontal scrollbars in the input field
- **Text Wrapping**: Improved text wrapping behavior so long content wraps to new lines instead of extending beyond the visible area
- **Visual Consistency**: Enhanced input field display for better readability with long file names and paths

## [0.0.4] - 2025-05-21

### Added
- **Async Terminal Communication**: Enhanced terminal communication with proper async support
- **Exit Command Integration**: Improved session management with proper exit command handling
- **Custom Slash Commands**: Full support for custom slash commands with configuration
  - Slash command suggestions and auto-completion
  - Custom command service for extensible functionality
  - Documentation for custom slash commands usage

### Fixed
- **Input Field UI**: Fixed input field behavior and scrolling for better usability
- **Input Field Cropping**: Resolved UI cropping issues with the input field
- **TypeScript Errors**: Removed unused imports causing compilation errors
- **Slash Command Duplication**: Fixed duplication of custom slash commands in menu UI

### Changed
- **Terminal Session Management**: Improved restart functionality with proper session continuity
- **UI Responsiveness**: Enhanced input field behavior and user interaction
- **Code Quality**: Cleaned up imports and resolved TypeScript issues

### Documentation
- **Custom Slash Commands Guide**: Added comprehensive documentation for creating and using custom slash commands
- **README Updates**: Improved documentation with better examples and usage instructions

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

### Changed
- Updated restart button to properly exit current Claude session with `/exit` command and start a new one with the `-c` flag to continue the previous session
- Improved session continuity between restarts

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