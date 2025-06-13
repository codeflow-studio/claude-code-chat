/**
 * Drag and Drop Module
 * Handles file, folder, and image drag and drop functionality
 */

import { insertDroppedPaths } from './utils.js';

// Image upload state
let pendingImages = [];

// Elements (will be set during initialization)
let messageInputElement = null;
let imagePreviewContainer = null;
let vscode = null;

/**
 * Initialize the drag and drop module
 */
export function initializeDragAndDrop(inputElement, previewContainer, vscodeApi) {
  messageInputElement = inputElement;
  imagePreviewContainer = previewContainer;
  vscode = vscodeApi;
  
  setupEventListeners();
}

/**
 * Sets up all drag and drop event listeners
 */
function setupEventListeners() {
  if (!messageInputElement) return;

  // Dragover event
  messageInputElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    
    // Visual feedback
    messageInputElement.classList.add('drag-over');
    
    // Show hint about Shift key requirement for VSCode webview drops
    const dragHint = document.querySelector('.drag-hint');
    if (dragHint) {
      dragHint.style.display = 'block';
    }
  });

  // Dragleave event
  messageInputElement.addEventListener('dragleave', (e) => {
    e.preventDefault();
    messageInputElement.classList.remove('drag-over');
    
    const dragHint = document.querySelector('.drag-hint');
    if (dragHint) {
      dragHint.style.display = 'none';
    }
  });

  // Drop event
  messageInputElement.addEventListener('drop', handleDrop);

  // Paste event for clipboard images
  messageInputElement.addEventListener('paste', handlePaste);
}

/**
 * Main drop event handler
 */
function handleDrop(e) {
  e.preventDefault();
  messageInputElement.classList.remove('drag-over');
  
  const dragHint = document.querySelector('.drag-hint');
  if (dragHint) {
    dragHint.style.display = 'none';
  }

  const dataTransfer = e.dataTransfer;
  if (!dataTransfer) return;

  // Process different types of dropped content
  const imageUris = [];
  const fileUris = [];
  
  // Check for VSCode specific formats first
  if (dataTransfer.types.includes('resourceurls')) {
    try {
      const resourceData = JSON.parse(dataTransfer.getData('resourceurls'));
      if (Array.isArray(resourceData)) {
        resourceData.forEach(uri => {
          if (isImageFile(uri)) {
            imageUris.push(uri);
          } else {
            fileUris.push(uri);
          }
        });
      }
    } catch (error) {
      console.warn('Error parsing resourceurls:', error);
    }
  }
  
  // Check for other URI list formats
  const uriListFormats = [
    'application/vnd.code.uri-list',
    'text/uri-list'
  ];
  
  for (const format of uriListFormats) {
    if (dataTransfer.types.includes(format)) {
      try {
        const uriList = dataTransfer.getData(format);
        if (uriList) {
          const uris = uriList.split('\n').filter(uri => uri.trim() && !uri.startsWith('#'));
          uris.forEach(uri => {
            const cleanUri = uri.trim();
            if (isImageFile(cleanUri)) {
              imageUris.push(cleanUri);
            } else {
              fileUris.push(cleanUri);
            }
          });
        }
      } catch (error) {
        console.warn(`Error parsing ${format}:`, error);
      }
      break; // Use the first available format
    }
  }
  
  // If we found URIs from VSCode/system, send them to extension for resolution
  if (imageUris.length > 0 || fileUris.length > 0) {
    if (imageUris.length > 0) {
      vscode.postMessage({
        command: 'resolveDroppedImages',
        imageUris: imageUris
      });
    }
    
    if (fileUris.length > 0) {
      vscode.postMessage({
        command: 'resolveDroppedPaths',
        uris: fileUris
      });
    }
    return;
  }

  // Handle direct file drops (from external file managers)
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    const files = Array.from(dataTransfer.files);
    const imageFiles = [];
    const otherFiles = [];
    
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        imageFiles.push(file);
      } else {
        otherFiles.push(file);
      }
    });
    
    // Handle images
    if (imageFiles.length > 0) {
      handleImageSelection(imageFiles, false, true); // Mark as external drop
    }
    
    // Handle other files - send paths to be processed
    if (otherFiles.length > 0) {
      const filePaths = otherFiles.map(file => file.path || file.name);
      insertDroppedPaths(filePaths, messageInputElement);
    }
    
    return;
  }

  // Handle plain text drops
  if (dataTransfer.types.includes('text/plain')) {
    const textData = dataTransfer.getData('text/plain');
    if (textData) {
      // Insert text at cursor position
      const cursorPosition = messageInputElement.selectionStart;
      const currentValue = messageInputElement.value;
      const newValue = currentValue.slice(0, cursorPosition) + textData + currentValue.slice(cursorPosition);
      
      messageInputElement.value = newValue;
      messageInputElement.setSelectionRange(cursorPosition + textData.length, cursorPosition + textData.length);
      
      // Trigger input event
      messageInputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}

/**
 * Handles paste events for clipboard images
 */
function handlePaste(e) {
  const clipboardItems = e.clipboardData?.items;
  if (!clipboardItems) return;

  const imageFiles = Array.from(clipboardItems)
    .filter(item => item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter(file => file !== null);

  if (imageFiles.length > 0) {
    e.preventDefault();
    handleImageSelection(imageFiles, true); // Mark as from clipboard
  }
}

/**
 * Processes image file selection from various sources
 */
export function handleImageSelection(files, isFromClipboard = false, isExternalDrop = false) {
  if (!files || files.length === 0) return;

  Array.from(files).forEach((file) => {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    
    reader.onload = function(e) {
      const imageData = e.target.result;
      
      // Add to pending images
      pendingImages.push({
        name: file.name || `image-${Date.now()}.png`,
        type: file.type,
        data: imageData,
        isFromClipboard: isFromClipboard,
        isExternalDrop: isExternalDrop
      });
      
      updateImagePreview();
    };
    
    reader.onerror = function() {
      console.error('Error reading image file:', file.name);
    };
    
    // Read image as data URL for preview, but we'll save as temp file when sending
    reader.readAsDataURL(file);
  });
}

/**
 * Updates the image preview display
 */
export function updateImagePreview() {
  if (!imagePreviewContainer) return;

  if (pendingImages.length === 0) {
    imagePreviewContainer.style.display = 'none';
    imagePreviewContainer.innerHTML = '';
    return;
  }

  imagePreviewContainer.style.display = 'block';
  
  const previewHTML = pendingImages.map((image, index) => `
    <div class="image-preview-item" data-index="${index}">
      <img src="${image.data}" alt="${image.name}" class="image-preview-thumbnail" />
      <div class="image-preview-info">
        <span class="image-name">${image.name}</span>
        ${image.isFromClipboard ? '<span class="image-source">📋 Clipboard</span>' : ''}
        ${image.isExternalDrop ? '<span class="image-source">📁 External</span>' : ''}
      </div>
      <button class="image-remove-btn" onclick="removeImage(${index})" title="Remove image">×</button>
    </div>
  `).join('');
  
  imagePreviewContainer.innerHTML = previewHTML;
}

/**
 * Removes an image from the pending list
 */
export function removeImage(index) {
  if (index >= 0 && index < pendingImages.length) {
    pendingImages.splice(index, 1);
    updateImagePreview();
  }
}

/**
 * Processes resolved image paths from the extension
 */
export function processResolvedImages(imagePaths) {
  if (imagePaths && imagePaths.length > 0) {
    imagePaths.forEach(path => {
      const fileName = path.split('/').pop() || path.split('\\').pop() || 'image';
      pendingImages.push({
        name: fileName,
        type: 'image/*', // We don't know the exact type from path
        path: path,
        isFromClipboard: false,
        // Important: path is already a temp file, no need to save again
        alreadySaved: true
      });
    });
    updateImagePreview();
  }
}

/**
 * Processes image file paths from VSCode file selection
 */
export function processImageFilePaths(imagePaths) {
  if (imagePaths && imagePaths.length > 0) {
    imagePaths.forEach(path => {
      const fileName = path.split('/').pop() || path.split('\\').pop() || 'image';
      pendingImages.push({
        name: fileName,
        type: 'image/*', // We don't know the exact type from path
        path: path,
        isFromClipboard: false
      });
    });
    updateImagePreview();
  }
}

/**
 * Processes resolved file/folder paths from the extension
 */
export function processResolvedPaths(paths) {
  if (paths && paths.length > 0) {
    insertDroppedPaths(paths, messageInputElement);
  }
}

/**
 * Gets pending images for sending
 */
export function getPendingImages() {
  return pendingImages;
}

/**
 * Clears pending images
 */
export function clearPendingImages() {
  pendingImages = [];
  updateImagePreview();
}

/**
 * Checks if a URI/path represents an image file
 */
function isImageFile(uri) {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'];
  const lowerUri = uri.toLowerCase();
  return imageExtensions.some(ext => lowerUri.includes(ext));
}

// Make removeImage available globally for onclick handlers
if (typeof window !== 'undefined') {
  window.removeImage = removeImage;
}