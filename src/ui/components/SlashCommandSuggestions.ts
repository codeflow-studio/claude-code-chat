import { SlashCommand, SLASH_COMMANDS, filterSlashCommands } from '../../utils/slash-commands';

export class SlashCommandSuggestions {
  private container: HTMLDivElement;
  private commands: SlashCommand[] = [];
  private selectedIndex: number = -1;
  private onSelectCallback?: (command: string) => void;
  private onDismissCallback?: () => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'slash-command-suggestions';
    this.container.style.display = 'none';
    this.hide();
  }

  public getElement(): HTMLDivElement {
    return this.container;
  }

  public show(
    inputElement: HTMLElement, 
    searchTerm: string = '',
    onSelect?: (command: string) => void,
    onDismiss?: () => void
  ) {
    this.onSelectCallback = onSelect;
    this.onDismissCallback = onDismiss;
    
    // Filter commands based on search term
    this.commands = searchTerm ? filterSlashCommands(searchTerm) : SLASH_COMMANDS;
    
    if (this.commands.length === 0) {
      this.hide();
      return;
    }

    this.selectedIndex = 0;
    this.render();
    this.position(inputElement);
    this.container.style.display = 'block';
  }

  public hide() {
    this.container.style.display = 'none';
    this.selectedIndex = -1;
    this.commands = [];
    if (this.onDismissCallback) {
      this.onDismissCallback();
    }
  }

  public isVisible(): boolean {
    return this.container.style.display !== 'none';
  }

  public handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.isVisible()) return false;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectNext();
        return true;
      case 'ArrowUp':
        event.preventDefault();
        this.selectPrevious();
        return true;
      case 'Enter':
        event.preventDefault();
        this.selectCurrent();
        return true;
      case 'Tab':
        event.preventDefault();
        this.selectCurrent();
        return true;
      case 'Escape':
        event.preventDefault();
        this.hide();
        return true;
      default:
        return false;
    }
  }

  private selectNext() {
    this.selectedIndex = (this.selectedIndex + 1) % this.commands.length;
    this.render();
  }

  private selectPrevious() {
    this.selectedIndex = this.selectedIndex - 1;
    if (this.selectedIndex < 0) {
      this.selectedIndex = this.commands.length - 1;
    }
    this.render();
  }

  private selectCurrent() {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.commands.length) {
      const command = this.commands[this.selectedIndex];
      if (this.onSelectCallback) {
        this.onSelectCallback(command.command);
      }
      this.hide();
    }
  }

  private render() {
    this.container.innerHTML = '';
    
    this.commands.forEach((command, index) => {
      const item = document.createElement('div');
      item.className = 'slash-command-item';
      if (index === this.selectedIndex) {
        item.classList.add('selected');
      }

      const icon = document.createElement('span');
      icon.className = 'slash-command-icon';
      icon.textContent = command.icon || '/';

      const content = document.createElement('div');
      content.className = 'slash-command-content';

      const commandName = document.createElement('div');
      commandName.className = 'slash-command-name';
      commandName.textContent = command.command;

      const description = document.createElement('div');
      description.className = 'slash-command-description';
      description.textContent = command.description;

      content.appendChild(commandName);
      content.appendChild(description);

      item.appendChild(icon);
      item.appendChild(content);

      item.addEventListener('click', () => {
        this.selectedIndex = index;
        this.selectCurrent();
      });

      item.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.render();
      });

      this.container.appendChild(item);
    });
  }

  private position(targetElement: HTMLElement) {
    const containerRect = targetElement.closest('.input-container')?.getBoundingClientRect();
    
    if (containerRect) {
      this.container.style.position = 'absolute';
      this.container.style.bottom = `${containerRect.height}px`;
      this.container.style.left = '0';
      this.container.style.right = '0';
      this.container.style.maxHeight = '300px';
    }
  }
}