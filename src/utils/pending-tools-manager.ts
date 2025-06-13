import { 
  ToolExecution, 
  ToolExecutionGroup, 
  ToolExecutionContext, 
  MessageContent 
} from '../types/claude-message-types';

/**
 * Manages pending tool executions and tracks tool call/result pairing
 * Handles parallel tool execution scenarios where multiple tools are called simultaneously
 */
export class PendingToolsManager {
  private pendingTools: Map<string, ToolExecution> = new Map();
  private executionGroups: Map<string, ToolExecutionGroup> = new Map();
  private currentGroupId?: string;
  private executionCounter = 0;

  /**
   * Start tracking a new group of tool executions
   */
  startExecutionGroup(): string {
    const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.currentGroupId = groupId;
    this.executionGroups.set(groupId, {
      id: groupId,
      executions: [],
      startTime: new Date().toISOString(),
      isComplete: false
    });
    return groupId;
  }

  /**
   * Add a tool_use to the pending executions
   */
  addToolExecution(toolUseContent: MessageContent): ToolExecution {
    if (toolUseContent.type !== 'tool_use' || !toolUseContent.id || !toolUseContent.name) {
      throw new Error('Invalid tool_use content');
    }

    const execution: ToolExecution = {
      id: toolUseContent.id,
      name: toolUseContent.name,
      input: toolUseContent.input,
      status: 'pending',
      timestamp: new Date().toISOString(),
      executionOrder: this.executionCounter++
    };

    this.pendingTools.set(toolUseContent.id, execution);

    // Add to current execution group if one exists
    if (this.currentGroupId) {
      const group = this.executionGroups.get(this.currentGroupId);
      if (group) {
        group.executions.push(execution);
      }
    }

    return execution;
  }

  /**
   * Complete a tool execution with its result
   */
  completeToolExecution(toolResultContent: MessageContent): ToolExecution | null {
    if (toolResultContent.type !== 'tool_result' || !toolResultContent.tool_use_id) {
      return null;
    }

    const execution = this.pendingTools.get(toolResultContent.tool_use_id);
    if (!execution) {
      return null; // Tool result without matching tool_use
    }

    // Update the execution with result
    execution.status = 'completed';
    execution.result = toolResultContent;

    // Update in execution groups
    for (const group of this.executionGroups.values()) {
      const groupExecution = group.executions.find(e => e.id === execution.id);
      if (groupExecution) {
        groupExecution.status = 'completed';
        groupExecution.result = toolResultContent;
        
        // Check if group is complete
        const allComplete = group.executions.every(e => e.status !== 'pending');
        if (allComplete && !group.isComplete) {
          group.isComplete = true;
          group.endTime = new Date().toISOString();
        }
        break;
      }
    }

    // Remove from pending (keep in groups for history)
    this.pendingTools.delete(toolResultContent.tool_use_id);

    return execution;
  }

  /**
   * Get all executions for the current group
   */
  getCurrentGroupExecutions(): ToolExecution[] {
    if (!this.currentGroupId) {
      return [];
    }

    const group = this.executionGroups.get(this.currentGroupId);
    return group ? group.executions : [];
  }

  /**
   * Get execution group by ID
   */
  getExecutionGroup(groupId: string): ToolExecutionGroup | undefined {
    return this.executionGroups.get(groupId);
  }

  /**
   * Get all pending tool executions
   */
  getPendingExecutions(): ToolExecution[] {
    return Array.from(this.pendingTools.values());
  }

  /**
   * Check if a tool execution exists by ID
   */
  hasToolExecution(toolId: string): boolean {
    return this.pendingTools.has(toolId) || 
           Array.from(this.executionGroups.values()).some(group => 
             group.executions.some(e => e.id === toolId)
           );
  }

  /**
   * Create tool execution context for UI consumption
   */
  createExecutionContext(groupId?: string): ToolExecutionContext {
    const targetGroupId = groupId || this.currentGroupId;
    const group = targetGroupId ? this.executionGroups.get(targetGroupId) : undefined;
    const executions = group ? group.executions : this.getPendingExecutions();

    return {
      toolExecutions: executions,
      executionGroup: group,
      hasPendingTools: executions.some(e => e.status === 'pending'),
      completedToolCount: executions.filter(e => e.status === 'completed').length,
      totalToolCount: executions.length
    };
  }

  /**
   * Clean up completed groups older than specified time (default: 1 hour)
   */
  cleanup(maxAgeMs: number = 60 * 60 * 1000): void {
    const cutoffTime = Date.now() - maxAgeMs;

    for (const [groupId, group] of this.executionGroups.entries()) {
      if (group.isComplete && group.endTime) {
        const groupEndTime = new Date(group.endTime).getTime();
        if (groupEndTime < cutoffTime) {
          this.executionGroups.delete(groupId);
        }
      }
    }
  }

  /**
   * Clear all pending tools and groups
   */
  clear(): void {
    this.pendingTools.clear();
    this.executionGroups.clear();
    this.currentGroupId = undefined;
    this.executionCounter = 0;
  }

  /**
   * Get statistics about current state
   */
  getStats() {
    return {
      pendingToolCount: this.pendingTools.size,
      totalGroupCount: this.executionGroups.size,
      activeGroupCount: Array.from(this.executionGroups.values()).filter(g => !g.isComplete).length,
      currentGroupId: this.currentGroupId
    };
  }
}