/**
 * Shared utilities for message formatting across Terminal and Direct modes
 * Ensures consistent behavior between different modes
 */

import * as fs from 'fs';

/**
 * Formats a message with problems context
 * Shared between Terminal Mode and Direct Mode for consistency
 */
export function formatMessageWithProblems(text: string, selectedProblems: Array<{
  file: string;
  line: number;
  column: number;
  severity: string;
  message: string;
  source?: string;
}>): string {
  let enhancedMessage = text;
  
  if (selectedProblems.length > 0) {
    let problemsContext = `\n<problems>\n`;
    
    selectedProblems.forEach((problem, index) => {
      const location = `${problem.file}#L${problem.line} Column:${problem.column}`;
      const source = problem.source ? ` (${problem.source})` : '';
      problemsContext += `${index + 1}. @${location}${source}\n   ${problem.severity}: ${problem.message}\n\n`;
    });
    problemsContext += "</problems>\n\n";

    enhancedMessage = text + problemsContext;
  }
  
  return enhancedMessage;
}

/**
 * Processes image context for both Terminal and Direct modes
 * Handles different image sources and validation
 */
export interface ImageProcessingResult {
  imagePaths: string[];
  failedImages: string[];
  enhancedMessage: string;
}

export interface ImageContext {
  name: string;
  path?: string;
  data?: string;
  type: string;
  isFromClipboard?: boolean;
  isExternalDrop?: boolean;
}

/**
 * Unified image processing for both Terminal and Direct modes
 * Returns processed image paths and enhanced message
 */
export async function processImagesForMessage(
  text: string, 
  images: ImageContext[], 
  imageManager: any
): Promise<ImageProcessingResult> {
  const imagePaths: string[] = [];
  const failedImages: string[] = [];
  
  for (const image of images) {
    if (!image.name) {
      continue;
    }
    
    try {
      // If it's a clipboard image, save to temp
      if (image.isFromClipboard && image.data) {
        const tempPath = await imageManager.saveImage(image.data, image.name, image.type);
        
        // Verify the file was actually created
        if (fs.existsSync(tempPath)) {
          try {
            await fs.promises.access(tempPath, fs.constants.R_OK);
            imagePaths.push(tempPath);
          } catch (accessError) {
            console.error(`File created but not readable: ${tempPath}`, accessError);
            failedImages.push(image.name);
            // Try to clean up the inaccessible file
            try {
              await imageManager.removeImage(tempPath);
            } catch (cleanupError) {
              console.error('Failed to clean up inaccessible file:', cleanupError);
            }
          }
        } else {
          console.error(`File was not created successfully: ${tempPath}`);
          failedImages.push(image.name);
        }
      } else if (image.path) {
        // Use the original path for file selections and drag-drop
        try {
          await fs.promises.access(image.path, fs.constants.R_OK);
          imagePaths.push(image.path);
        } catch (error) {
          console.error(`Cannot access file: ${image.path}`, error);
          failedImages.push(image.name);
        }
      } else if (image.isExternalDrop && image.data) {
        // Handle external drops (from Finder/File Manager) that have data but no path
        const tempPath = await imageManager.saveImage(image.data, image.name, image.type);
        
        // Verify the file was actually created
        if (fs.existsSync(tempPath)) {
          try {
            await fs.promises.access(tempPath, fs.constants.R_OK);
            imagePaths.push(tempPath);
          } catch (accessError) {
            console.error(`File created but not readable: ${tempPath}`, accessError);
            failedImages.push(image.name);
            // Try to clean up the inaccessible file
            try {
              await imageManager.removeImage(tempPath);
            } catch (cleanupError) {
              console.error('Failed to clean up inaccessible file:', cleanupError);
            }
          }
        } else {
          console.error(`File was not created successfully: ${tempPath}`);
          failedImages.push(image.name);
        }
      }
    } catch (error) {
      console.error(`Failed to process image ${image.name}:`, error);
      failedImages.push(image.name);
    }
  }
  
  // Format message with verified image paths
  let enhancedMessage = text || '';
  
  if (imagePaths.length > 0) {
    const imageReferences = imageManager.formatImageReferences(imagePaths);
    enhancedMessage = enhancedMessage ? `${enhancedMessage}${imageReferences}` : imageReferences.trim();
    
    // Log successful image paths for debugging
    console.log(`Successfully processed ${imagePaths.length} image(s):`, imagePaths);
  }
  
  return {
    imagePaths,
    failedImages,
    enhancedMessage
  };
}