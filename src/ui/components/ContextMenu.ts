import { ContextMenuOptionType, ContextMenuQueryItem } from '../../utils/context-mentions';

/**
 * Generates the HTML for the context menu displayed when typing '@'
 */
export function createContextMenuHtml(
    options: ContextMenuQueryItem[],
    selectedIndex: number,
    onSelect: (type: ContextMenuOptionType, value?: string) => void,
    onMouseEnter: (index: number) => void,
    isLoading: boolean = false
): string {
    const menuHtml = `
        <div class="context-menu">
            ${isLoading ? `
                <div class="context-menu-item loading">
                    <div class="loading-spinner"></div>
                    <span>Searching...</span>
                </div>
            ` : ''}
            ${options.map((option, index) => {
                const isSelected = index === selectedIndex;
                const isSelectable = option.type !== ContextMenuOptionType.NoResults && option.type !== ContextMenuOptionType.URL;
                
                const icon = getIconForOption(option);
                const content = renderOptionContent(option);
                let rightIcon = '';
                
                if ((option.type === ContextMenuOptionType.File || 
                     option.type === ContextMenuOptionType.Folder || 
                     option.type === ContextMenuOptionType.Git) && !option.value) {
                    rightIcon = '<span class="codicon codicon-chevron-right"></span>';
                } else if (option.type === ContextMenuOptionType.Problems || 
                           ((option.type === ContextMenuOptionType.File || 
                             option.type === ContextMenuOptionType.Folder || 
                             option.type === ContextMenuOptionType.Git) && option.value)) {
                    rightIcon = '<span class="codicon codicon-add"></span>';
                }
                
                return `
                    <div class="context-menu-item ${isSelected && isSelectable ? 'selected' : ''} ${!isSelectable ? 'not-selectable' : ''}"
                         data-type="${option.type}"
                         data-value="${option.value || ''}"
                         data-index="${index}">
                        <div class="context-menu-item-content">
                            <span class="codicon codicon-${icon}"></span>
                            <div class="context-menu-text">${content}</div>
                        </div>
                        ${rightIcon}
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    return menuHtml;
}

/**
 * Gets the appropriate icon for a context menu option
 */
function getIconForOption(option: ContextMenuQueryItem): string {
    switch (option.type) {
        case ContextMenuOptionType.File:
            return "file";
        case ContextMenuOptionType.Folder:
            return "folder";
        case ContextMenuOptionType.Problems:
            return "warning";
        case ContextMenuOptionType.URL:
            return "link";
        case ContextMenuOptionType.Git:
            return "git-commit";
        case ContextMenuOptionType.NoResults:
            return "info";
        default:
            return "file";
    }
}

/**
 * Renders the content for a specific context menu option
 */
function renderOptionContent(option: ContextMenuQueryItem): string {
    switch (option.type) {
        case ContextMenuOptionType.Problems:
            return `<span>Problems</span>`;
        case ContextMenuOptionType.URL:
            return `<span>Paste URL to fetch contents</span>`;
        case ContextMenuOptionType.NoResults:
            return `<span>No results found</span>`;
        case ContextMenuOptionType.Git:
            if (option.value) {
                return `
                    <div class="git-option">
                        <span>${option.label || ''}</span>
                        <span class="description">${option.description || ''}</span>
                    </div>
                `;
            } else {
                return `<span>Git Commits</span>`;
            }
        case ContextMenuOptionType.File:
        case ContextMenuOptionType.Folder:
            if (option.value) {
                return `
                    <div class="path-option">
                        <span>/</span>
                        ${option.value?.startsWith("/.") ? '<span>.</span>' : ''}
                        <span class="path-text">${cleanPathPrefix(option.value || '')}</span>
                    </div>
                `;
            } else {
                return `<span>Add ${option.type === ContextMenuOptionType.File ? "File" : "Folder"}</span>`;
            }
        default:
            return '';
    }
}

/**
 * Cleans up a path prefix for display
 */
function cleanPathPrefix(path: string): string {
    // Remove leading slash if present
    return path.startsWith('/') ? path.substring(1) : path;
}

/**
 * Adds CSS for the context menu to the document
 */
export function addContextMenuStyles(): string {
    return `
        .context-menu {
            position: absolute;
            background-color: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-editorGroup-border);
            border-radius: 3px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
            width: 100%;
        }
        
        .context-menu-item {
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid var(--vscode-editorGroup-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .context-menu-item.selected {
            color: var(--vscode-quickInputList-focusForeground);
            background-color: var(--vscode-quickInputList-focusBackground);
        }
        
        .context-menu-item.not-selectable {
            cursor: default;
            opacity: 0.7;
        }
        
        .context-menu-item-content {
            display: flex;
            align-items: center;
            flex: 1;
            min-width: 0;
            overflow: hidden;
        }
        
        .context-menu-item .codicon {
            margin-right: 8px;
            font-size: 14px;
            flex-shrink: 0;
        }
        
        .context-menu-text {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .git-option {
            display: flex;
            flex-direction: column;
            gap: 0;
            width: 100%;
        }
        
        .git-option .description {
            font-size: 0.85em;
            opacity: 0.7;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.2;
        }
        
        .path-option {
            display: flex;
            align-items: center;
            width: 100%;
            overflow: hidden;
        }
        
        .path-option .path-text {
            direction: rtl;
            text-align: left;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .loading-spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid var(--vscode-foreground);
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 1s linear infinite;
            margin-right: 8px;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .context-menu-item.loading {
            display: flex;
            align-items: center;
            opacity: 0.7;
        }
        
        .mention-highlight {
            background-color: var(--vscode-editor-selectionBackground);
            color: var(--vscode-editor-selectionForeground);
            border-radius: 2px;
        }
    `;
}