
# Claude Code Development Framework

This file serves as the central configuration for Claude's development approach. It dynamically loads modules based on project needs and orchestrates how they work together.

## Module System

Claude's development framework uses a plugin architecture where modules can be loaded individually or in combination. Each module provides specific capabilities that can function independently or integrate with other modules for enhanced functionality.

### Available Modules

#### Task Management
@.claude/taskmaster-ai.md
- Breaks down complex tasks into manageable units
- Tracks progress and dependencies
- Maintains focused execution

#### Memory Bank
@.claude/memory-bank.md
- Maintains project knowledge across sessions
- Organizes technical documentation
- Ensures consistent understanding
- Memory Bank Structure:
    - @.memory-bank/activeContext.md
    - @.memory-bank/productContext.md
    - @.memory-bank/progress.md
    - @.memory-bank/projectbrief.md
    - @.memory-bank/systemPatterns.md
    - @.memory-bank/techContext.md

#### Developer Profile
Example `@.claude/vscode-extension-developer.md`
- Defines required technical skills
- Guides implementation approaches
- Sets quality standards

#### TDD Methodology
@.claude/tdd.md
- Implements test-driven development
- Ensures code quality and test coverage
- Structures development cycles

#### Product Requirements
@.claude/PRD.md
- Defines core product functionality
- Sets user experience expectations
- Establishes success criteria

## Integration Patterns

When multiple modules are loaded, they automatically integrate through these connection points:

- **Task Management + Memory Bank**: Task info feeds into activeContext.md and progress.md
- **Task Management + TDD**: Testing tasks are integrated into workflow
- **Memory Bank + Developer Profile**: Technical knowledge informs documentation
- **Developer Profile + TDD**: Testing expertise guides implementation
- **All Modules + PRD**: Product requirements inform all aspects of development

## Usage Guide

1. **Independent Mode**: Load individual modules for focused capabilities
   ```
   @.claude/taskmaster-ai.md  # Just task management
   ```

2. **Combination Mode**: Load multiple modules for enhanced functionality
   ```
   @.claude/taskmaster-ai.md
   @.claude/memory-bank.md
   ```

3. **Full Framework**: Load all modules for comprehensive development approach
   ```
   @.claude/taskmaster-ai.md
   @.claude/memory-bank.md
   @.claude/developer.md
   @.claude/tdd.md
   @.claude/PRD.md
   ```

The framework automatically detects which modules are loaded and adjusts its behavior accordingly, maintaining consistency regardless of which combination is used.
