# Project Brief: Claude Code VSCode Extension

## Project Overview
The Claude Code VSCode Extension is an integration tool that brings Anthropic's Claude Code AI assistant directly into the Visual Studio Code environment. It provides seamless access to Claude's code assistance capabilities without requiring users to leave their development environment.

## Core Objectives
1. Provide a seamless integration between VSCode and the Claude Code CLI
2. Enable users to interact with Claude through a chat interface within VSCode
3. Allow users to ask questions about selected code or receive assistance within their current context
4. Support persistent conversations and context management
5. Provide a configurable experience that respects user preferences

## Key Features
- Chat interface within VSCode
- Code selection analysis ("Ask Claude About Selection" functionality)
- Conversation management (clear, persist, start new)
- Integration with the Claude Code CLI 
- Configurable settings for extension behavior

## Target Users
- Software developers using Visual Studio Code
- Users of Anthropic's Claude Code AI assistant who want a more integrated workflow

## Success Criteria
- Stable and responsive integration with the Claude Code CLI
- Intuitive user experience with minimal friction
- Accurate context management and conversation handling
- Performant operation that doesn't impact VSCode stability
- Clear debugging support for extension development

## Timeline and Status
The extension is currently in early development (v0.0.1).

## Dependencies
- Claude Code CLI (external dependency)
- Visual Studio Code API (v1.70.0+)