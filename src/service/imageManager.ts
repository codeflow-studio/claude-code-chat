import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface ImageInfo {
  originalName: string;
  tempPath: string;
  size: number;
  type: string;
  timestamp: number;
}

export class ImageManager {
  private tempDir: string;
  private sessionId: string;
  private imagePaths: Map<string, ImageInfo> = new Map();
  private maxImageSize = 10 * 1024 * 1024; // 10MB
  private allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ];

  constructor(private context: vscode.ExtensionContext) {
    this.sessionId = Date.now().toString();
    this.tempDir = path.join(
      os.tmpdir(),
      "claude-code-extension",
      this.sessionId
    );
    this.ensureDirectoryExists();

    // Schedule periodic cleanup
    const cleanupInterval = setInterval(() => {
      this.cleanupOldImages();
    }, 60 * 60 * 1000); // Every hour

    // Ensure cleanup on deactivation
    context.subscriptions.push({
      dispose: () => {
        clearInterval(cleanupInterval);
        this.cleanupAllImages();
      },
    });
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async saveImage(
    base64Data: string,
    fileName: string,
    mimeType: string
  ): Promise<string> {
    // Validate image
    this.validateImage(fileName, mimeType, base64Data);

    // Extract base64 content
    const base64Content = base64Data.split(",")[1] || base64Data;
    const buffer = Buffer.from(base64Content, "base64");

    // Create unique filename
    const timestamp = Date.now();
    const safeName = this.sanitizeFileName(fileName);
    const uniqueName = `${timestamp}-${safeName}`;
    const filePath = path.join(this.tempDir, uniqueName);

    // Write to temp file
    await fs.promises.writeFile(filePath, buffer);

    // Verify the file was written correctly
    try {
      const stats = await fs.promises.stat(filePath);
      if (stats.size === 0) {
        // File was created but is empty
        await fs.promises.unlink(filePath);
        throw new Error("File was created but is empty");
      }

      // Verify the file is readable
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch (verifyError) {
      // Clean up the failed file
      try {
        await fs.promises.unlink(filePath);
      } catch (cleanupError) {
        console.error("Failed to clean up invalid file:", cleanupError);
      }
      throw new Error(`Failed to verify saved image: ${verifyError}`);
    }

    // Store image info only after verification
    const imageInfo: ImageInfo = {
      originalName: fileName,
      tempPath: filePath,
      size: buffer.length,
      type: mimeType,
      timestamp: timestamp,
    };

    this.imagePaths.set(filePath, imageInfo);

    return filePath;
  }

  private validateImage(
    fileName: string,
    mimeType: string,
    base64Data: string
  ): void {
    // Check file type
    if (!this.allowedTypes.includes(mimeType)) {
      throw new Error(
        `Invalid file type: ${mimeType}. Allowed types: ${this.allowedTypes.join(
          ", "
        )}`
      );
    }

    // Check file size
    const sizeInBytes = (base64Data.length * 3) / 4;
    if (sizeInBytes > this.maxImageSize) {
      const sizeMB = (sizeInBytes / (1024 * 1024)).toFixed(1);
      throw new Error(`Image too large: ${sizeMB}MB. Maximum size: 10MB`);
    }

    // Check filename
    if (!fileName || fileName.trim().length === 0) {
      throw new Error("Invalid filename");
    }
  }

  private sanitizeFileName(fileName: string): string {
    const baseName = path.basename(fileName);
    // Replace problematic characters while preserving file extension
    const nameParts = baseName.split(".");
    const extension = nameParts.length > 1 ? "." + nameParts.pop() : "";
    const name = nameParts.join(".");
    const safeName = name.replace(/[^a-zA-Z0-9.-]/g, "_");
    return safeName + extension;
  }

  getImageInfo(filePath: string): ImageInfo | undefined {
    return this.imagePaths.get(filePath);
  }

  getAllImages(): ImageInfo[] {
    return Array.from(this.imagePaths.values());
  }

  async removeImage(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
      this.imagePaths.delete(filePath);
    } catch (error) {
      console.error("Error removing image:", error);
    }
  }

  async cleanupOldImages(): Promise<void> {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [path, info] of this.imagePaths.entries()) {
      if (now - info.timestamp > maxAge) {
        await this.removeImage(path);
      }
    }
  }

  async cleanupAllImages(): Promise<void> {
    for (const path of this.imagePaths.keys()) {
      await this.removeImage(path);
    }

    // Try to remove the session directory
    try {
      if (fs.existsSync(this.tempDir)) {
        await fs.promises.rmdir(this.tempDir);
      }
    } catch (error) {
      // Directory might not be empty or might be in use
      console.error("Error removing temp directory:", error);
    }
  }

  formatImageReferences(imagePaths: string[]): string {
    if (imagePaths.length === 0) return "";
    let instructions = `\n</ATTACHED_IMAGES>\n`;
    const imageCount = imagePaths.length;
    if (imageCount === 1) {
      // return `${instructions}Attached Image => '${imagePaths[0]}'`;
      instructions += `Attached Image => '${imagePaths[0]}'`;
    }
    const imageList = imagePaths
      .map((path, index) => `Attached Image ${index + 1} => '${path}'`)
      .join("\n");
    instructions += imageList;
    instructions += `\n</ATTACHED_IMAGES>\n`;
    return instructions;
  }
}
