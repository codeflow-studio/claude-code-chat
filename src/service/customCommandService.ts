import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SlashCommand } from '../utils/slash-commands';

export interface CustomCommand {
  name: string;        // Command name without prefix
  file: string;        // Path to the command file
  type: 'project' | 'user'; // Whether this is a project or user command
  description?: string; // Optional description (first line of the file)
}

export class CustomCommandService {
  private projectCommands: CustomCommand[] = [];
  private userCommands: CustomCommand[] = [];

  constructor() {}

  /**
   * Scans for custom slash commands in both project and user directories
   * @returns Promise that resolves when scanning is complete
   */
  public async scanCustomCommands(): Promise<void> {
    // Reset the command arrays
    this.projectCommands = [];
    this.userCommands = [];

    // Scan project commands
    await this.scanProjectCommands();
    
    // Scan user commands
    await this.scanUserCommands();
  }

  /**
   * Gets all custom commands as SlashCommand objects
   * @returns Array of SlashCommand objects
   */
  public getCustomCommands(): SlashCommand[] {
    const commands: SlashCommand[] = [];

    // Add project commands
    for (const cmd of this.projectCommands) {
      commands.push({
        command: `/project:${cmd.name}`,
        description: cmd.description || `Project command: ${cmd.name}`,
        icon: '📄', // Document icon for project commands
        isCustom: true
      });
    }

    // Add user commands
    for (const cmd of this.userCommands) {
      commands.push({
        command: `/user:${cmd.name}`,
        description: cmd.description || `User command: ${cmd.name}`,
        icon: '👤', // User icon for user commands
        isCustom: true
      });
    }

    return commands;
  }

  /**
   * Scans for project commands in the .claude/commands directory
   */
  private async scanProjectCommands(): Promise<void> {
    // Get workspace folders
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    // Use the first workspace folder
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const commandsDir = path.join(workspaceRoot, '.claude', 'commands');

    try {
      // Check if the commands directory exists
      const stats = await fs.promises.stat(commandsDir);
      if (!stats.isDirectory()) {
        return;
      }

      // Read the directory
      const files = await fs.promises.readdir(commandsDir);
      
      // Process each markdown file
      for (const file of files) {
        if (path.extname(file).toLowerCase() === '.md') {
          const filePath = path.join(commandsDir, file);
          const name = path.basename(file, '.md');
          
          // Read the first line for description
          try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const firstLine = content.split('\n')[0].trim();
            const description = firstLine.startsWith('#') 
              ? firstLine.substring(1).trim() 
              : firstLine;

            this.projectCommands.push({
              name,
              file: filePath,
              type: 'project',
              description: description || undefined
            });
          } catch (err) {
            console.error(`Error reading project command file ${filePath}:`, err);
            // Add without description if we couldn't read it
            this.projectCommands.push({
              name,
              file: filePath,
              type: 'project'
            });
          }
        }
      }
    } catch (err) {
      // Directory doesn't exist or can't be read, which is fine
      console.log('No project commands directory found or error reading it:', err);
    }
  }

  /**
   * Scans for user commands in the ~/.claude/commands directory
   */
  private async scanUserCommands(): Promise<void> {
    try {
      // Get user home directory
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!homeDir) {
        console.error('Could not determine user home directory');
        return;
      }

      const commandsDir = path.join(homeDir, '.claude', 'commands');

      // Check if the directory exists
      const stats = await fs.promises.stat(commandsDir);
      if (!stats.isDirectory()) {
        return;
      }

      // Read the directory
      const files = await fs.promises.readdir(commandsDir);
      
      // Process each markdown file
      for (const file of files) {
        if (path.extname(file).toLowerCase() === '.md') {
          const filePath = path.join(commandsDir, file);
          const name = path.basename(file, '.md');
          
          // Read the first line for description
          try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const firstLine = content.split('\n')[0].trim();
            const description = firstLine.startsWith('#') 
              ? firstLine.substring(1).trim() 
              : firstLine;

            this.userCommands.push({
              name,
              file: filePath,
              type: 'user',
              description: description || undefined
            });
          } catch (err) {
            console.error(`Error reading user command file ${filePath}:`, err);
            // Add without description if we couldn't read it
            this.userCommands.push({
              name,
              file: filePath,
              type: 'user'
            });
          }
        }
      }
    } catch (err) {
      // Directory doesn't exist or can't be read, which is fine
      console.log('No user commands directory found or error reading it:', err);
    }
  }
}

// Create a singleton instance
export const customCommandService = new CustomCommandService();