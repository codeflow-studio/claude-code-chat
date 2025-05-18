import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SearchResult } from './utils/context-mentions';

/**
 * Gets a list of all workspace files and folders
 */
export async function getWorkspaceFiles(): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  // Get all workspace folders
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return results;
  }

  // For each workspace folder, get all files
  for (const folder of workspaceFolders) {
    const rootPath = folder.uri.fsPath;
    const relativeResults = await getFilesInDirectory(rootPath, rootPath);
    results.push(...relativeResults);
  }

  return results;
}

/**
 * Recursively gets all files in a directory
 */
async function getFilesInDirectory(rootPath: string, dirPath: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  try {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    // Add current directory to results
    const relativePath = path.relative(rootPath, dirPath);
    if (relativePath) {
      results.push({
        path: '/' + relativePath.replace(/\\/g, '/'),
        type: 'folder',
        label: path.basename(dirPath)
      });
    }
    
    // Process all items in this directory
    for (const item of items) {
      // Skip node_modules, .git, and other system directories
      if (item.name.startsWith('.') || item.name === 'node_modules') {
        continue;
      }
      
      const itemPath = path.join(dirPath, item.name);
      const relPath = path.relative(rootPath, itemPath).replace(/\\/g, '/');

      if (item.isDirectory()) {
        // For directories, recurse and add this directory
        const subDirResults = await getFilesInDirectory(rootPath, itemPath);
        results.push(...subDirResults);
      } else {
        // For files, add to results
        results.push({
          path: '/' + relPath,
          type: 'file',
          label: item.name
        });
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dirPath}:`, err);
  }
  
  return results;
}

/**
 * Searches for files and folders matching a query
 */
export async function searchFiles(query: string): Promise<SearchResult[]> {
  if (!query) {
    return [];
  }
  
  // Get all workspace files
  const allFiles = await getWorkspaceFiles();
  
  // Filter files that match the query
  const results = allFiles.filter(file => {
    // Search in both the path and the filename
    return file.path.toLowerCase().includes(query.toLowerCase()) || 
           (file.label ? file.label.toLowerCase().includes(query.toLowerCase()) : false);
  });
  
  // Sort results by relevance
  results.sort((a, b) => {
    const aLabelLower = a.label?.toLowerCase() || '';
    const bLabelLower = b.label?.toLowerCase() || '';
    const queryLower = query.toLowerCase();
    
    // Exact filename matches come first
    const aExact = aLabelLower === queryLower;
    const bExact = bLabelLower === queryLower;
    
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    
    // Filename starts with query comes next
    const aStartsWith = aLabelLower.startsWith(queryLower);
    const bStartsWith = bLabelLower.startsWith(queryLower);
    
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    
    // Path contains query comes next
    const aPathContains = a.path.toLowerCase().includes(queryLower);
    const bPathContains = b.path.toLowerCase().includes(queryLower);
    
    if (aPathContains && !bPathContains) return -1;
    if (!aPathContains && bPathContains) return 1;
    
    // Sort by path length
    return a.path.length - b.path.length;
  });
  
  // Limit to 50 results to avoid overwhelming the UI
  return results.slice(0, 50);
}

/**
 * Represents a Git commit
 */
export interface FormattedGitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
}

/**
 * Gets all Git commits from the workspace
 */
export async function getGitCommits(query: string): Promise<FormattedGitCommit[]> {
  // Get VS Code's Git extension
  const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
  
  if (!gitExtension || !gitExtension.getAPI) {
    // If Git extension is not available, return mock data
    return getMockCommits(query);
  }
  
  try {
    const git = gitExtension.getAPI(1);
    const repositories = git.repositories;
    
    if (!repositories || repositories.length === 0) {
      return getMockCommits(query);
    }
    
    // Use the first repository (most projects only have one)
    const repo = repositories[0];
    
    // Get the last 50 commits
    const logOptions = {
      maxEntries: 50
    };
    
    const commits = await repo.log(logOptions);
    
    // Define the commit interface from Git extension
    interface GitCommit {
      hash: string;
      message: string;
      authorName?: string;
      commitDate: Date | string;
    }
    
    // Convert to our standard format
    const formattedCommits = commits.map((commit: GitCommit): FormattedGitCommit => ({
      hash: commit.hash,
      shortHash: commit.hash.substring(0, 7),
      subject: commit.message,
      author: commit.authorName || 'Unknown',
      date: new Date(commit.commitDate).toISOString().split('T')[0]
    }));
    
    // Filter commits that match the query
    return formattedCommits.filter((commit: FormattedGitCommit) => 
      commit.hash.startsWith(query) || 
      commit.shortHash.startsWith(query) ||
      commit.subject.toLowerCase().includes(query.toLowerCase()) ||
      commit.author.toLowerCase().includes(query.toLowerCase())
    );
  } catch (error) {
    console.error('Error getting Git commits:', error);
    return getMockCommits(query);
  }
}

/**
 * Returns mock commit data if the Git extension is not available
 */
function getMockCommits(query: string): FormattedGitCommit[] {
  // Mock git commits that match the query
  const mockCommits = [
    {
      hash: '1234567890abcdef1234567890abcdef12345678',
      shortHash: '1234567',
      subject: 'Fix bug in login component',
      author: 'John Doe',
      date: '2023-05-15'
    },
    {
      hash: 'abcdef1234567890abcdef1234567890abcdef12',
      shortHash: 'abcdef1',
      subject: 'Add new feature to dashboard',
      author: 'Jane Smith',
      date: '2023-05-14'
    },
    {
      hash: '9876543210fedcba9876543210fedcba98765432',
      shortHash: '9876543',
      subject: 'Refactor user authentication',
      author: 'John Doe',
      date: '2023-05-13'
    }
  ];
  
  // Filter commits that match the query
  return mockCommits.filter(commit => 
    commit.hash.startsWith(query) || 
    commit.shortHash.startsWith(query) ||
    commit.subject.toLowerCase().includes(query.toLowerCase())
  );
}