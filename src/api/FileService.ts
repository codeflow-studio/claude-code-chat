import * as vscode from 'vscode';
import * as path from 'path';

export interface FileServiceClient {
  getRelativePaths(request: { uris: string[] }): Promise<{ paths: string[] }>;
}

/**
 * Converts a list of URIs to workspace-relative paths
 * @param request The request containing URIs to convert
 * @returns Response with resolved relative paths
 */
export async function getRelativePaths(request: { uris: string[] }): Promise<{ paths: string[] }> {
  const resolvedPaths = await Promise.all(
    request.uris.map(async (uriString) => {
      try {
        const fileUri = vscode.Uri.parse(uriString, true);
        const relativePathToGet = vscode.workspace.asRelativePath(fileUri, false);

        // If the path is still absolute, it's outside the workspace
        if (path.isAbsolute(relativePathToGet)) {
          console.warn(`Dropped file ${relativePathToGet} is outside the workspace. Sending original path.`);
          return fileUri.fsPath.replace(/\\/g, '/');
        } else {
          let finalPath = relativePathToGet.replace(/\\/g, '/');
          try {
            const stat = await vscode.workspace.fs.stat(fileUri);
            if (stat.type === vscode.FileType.Directory) {
              finalPath += '/';
            }
          } catch (statError) {
            console.error(`Error stating file ${fileUri.fsPath}:`, statError);
          }
          return finalPath;
        }
      } catch (error) {
        console.error(`Error calculating relative path for ${uriString}:`, error);
        return null;
      }
    })
  );

  // Filter out any null values from errors
  const validPaths = resolvedPaths.filter((path): path is string => path !== null);

  return { paths: validPaths };
}

export const fileServiceClient: FileServiceClient = {
  getRelativePaths
};