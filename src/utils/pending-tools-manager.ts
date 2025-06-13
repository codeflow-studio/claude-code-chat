import { 
  ToolExecution, 
  ToolExecutionGroup, 
  ToolExecutionContext, 
  MessageContent,
  TaskExecution
} from '../types/claude-message-types';

/**
 * Manages pending tool executions and tracks tool call/result pairing
 * Handles parallel tool execution scenarios where multiple tools are called simultaneously
 * Enhanced with Task workflow support for hierarchical tool execution
 */
export class PendingToolsManager {
  private pendingTools: Map<string, ToolExecution> = new Map();
  private executionGroups: Map<string, ToolExecutionGroup> = new Map();
  private currentGroupId?: string;
  private executionCounter = 0;
  
  // Task-specific tracking
  private pendingTasks: Map<string, TaskExecution> = new Map();
  private taskGroups: Map<string, string> = new Map(); // taskId -> groupId mapping

  /**
   * Start tracking a new group of tool executions
   */
  startExecutionGroup(): string {
    const groupId = `group_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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
   * Enhanced to handle Task tools and parent-child relationships
   */
  addToolExecution(toolUseContent: MessageContent, parentToolUseId?: string): ToolExecution {
    if (toolUseContent.type !== 'tool_use' || !toolUseContent.id || !toolUseContent.name) {
      throw new Error('Invalid tool_use content');
    }

    // Handle Task tool specially
    if (toolUseContent.name === 'Task') {
      return this.addTaskExecution(toolUseContent);
    }

    // Handle regular tool execution
    const execution: ToolExecution = {
      id: toolUseContent.id,
      name: toolUseContent.name,
      input: toolUseContent.input,
      status: 'pending',
      timestamp: new Date().toISOString(),
      executionOrder: this.executionCounter++,
      parentToolUseId: parentToolUseId || toolUseContent.parent_tool_use_id
    };

    this.pendingTools.set(toolUseContent.id, execution);

    // Check if this is a sub-tool of a Task
    if (execution.parentToolUseId) {
      const parentTask = this.pendingTasks.get(execution.parentToolUseId);
      if (parentTask) {
        // Add to the parent Task's subTools
        parentTask.subTools.push(execution);
        parentTask.status = 'running'; // Task is now running sub-tools
        
        // Get the Task's execution group
        const taskGroupId = this.taskGroups.get(parentTask.id);
        if (taskGroupId) {
          const group = this.executionGroups.get(taskGroupId);
          if (group) {
            group.executions.push(execution);
            group.isTaskGroup = true;
            group.taskExecution = parentTask;
          }
        }
        
        return execution;
      }
    }

    // Add to current execution group if one exists (for non-Task tools)
    if (this.currentGroupId) {
      const group = this.executionGroups.get(this.currentGroupId);
      if (group && !group.isTaskGroup) {
        group.executions.push(execution);
      }
    }

    return execution;
  }

  /**
   * Add a Task tool execution and set up hierarchical tracking
   */
  private addTaskExecution(toolUseContent: MessageContent): ToolExecution {
    const taskExecution: TaskExecution = {
      id: toolUseContent.id!,
      name: 'Task',
      input: toolUseContent.input,
      status: 'pending',
      timestamp: new Date().toISOString(),
      executionOrder: this.executionCounter++,
      subTools: [],
      isComplete: false
    };

    this.pendingTasks.set(taskExecution.id, taskExecution);

    // Create a new execution group for this Task
    const groupId = this.startExecutionGroup();
    this.taskGroups.set(taskExecution.id, groupId);

    const group = this.executionGroups.get(groupId);
    if (group) {
      group.isTaskGroup = true;
      group.taskExecution = taskExecution;
    }

    // Create a ToolExecution wrapper for the Task (map 'running' to 'pending' for ToolExecution)
    const execution: ToolExecution = {
      id: taskExecution.id,
      name: taskExecution.name,
      input: taskExecution.input,
      status: taskExecution.status === 'running' ? 'pending' : taskExecution.status,
      timestamp: taskExecution.timestamp,
      executionOrder: taskExecution.executionOrder
    };

    this.pendingTools.set(taskExecution.id, execution);

    return execution;
  }

  /**
   * Complete a tool execution with its result
   * Enhanced to handle Task completion detection
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

    // If this is a Task execution, update the TaskExecution too
    if (execution.name === 'Task') {
      const taskExecution = this.pendingTasks.get(execution.id);
      if (taskExecution) {
        taskExecution.status = 'completed';
        taskExecution.result = toolResultContent;
        taskExecution.isComplete = true;
        taskExecution.completionDetectedAt = new Date().toISOString();
      }
    }

    // If this is a sub-tool, update its parent Task
    if (execution.parentToolUseId) {
      const parentTask = this.pendingTasks.get(execution.parentToolUseId);
      if (parentTask) {
        // Update the sub-tool in the Task's subTools array
        const subTool = parentTask.subTools.find(st => st.id === execution.id);
        if (subTool) {
          subTool.status = 'completed';
          subTool.result = toolResultContent;
        }
        
        // Note: Don't auto-complete the Task here, as it might have more sub-tools coming
        // Task completion will be detected by checkTaskCompletion method
      }
    }

    // Update in execution groups
    for (const group of this.executionGroups.values()) {
      const groupExecution = group.executions.find(e => e.id === execution.id);
      if (groupExecution) {
        groupExecution.status = 'completed';
        groupExecution.result = toolResultContent;
        
        // For Task groups, check Task completion instead of group completion
        if (group.isTaskGroup && group.taskExecution) {
          // Update the Task execution in the group
          if (group.taskExecution.id === execution.id) {
            group.taskExecution.status = 'completed';
            group.taskExecution.result = toolResultContent;
            group.taskExecution.isComplete = true;
            group.taskExecution.completionDetectedAt = new Date().toISOString();
            
            group.isComplete = true;
            group.endTime = new Date().toISOString();
          }
          // Note: Sub-tool completion doesn't mark Task group as complete
        } else {
          // Check if non-Task group is complete
          const allComplete = group.executions.every(e => e.status !== 'pending');
          if (allComplete && !group.isComplete) {
            group.isComplete = true;
            group.endTime = new Date().toISOString();
          }
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
   * Check for Task completion based on parent_tool_use_id pattern
   * Call this when a new tool without parent_tool_use_id is encountered
   */
  checkTaskCompletion(newToolWithoutParent?: MessageContent): TaskExecution[] {
    const completedTasks: TaskExecution[] = [];
    
    // Check all pending Tasks for completion
    for (const [taskId, task] of this.pendingTasks.entries()) {
      if (!task.isComplete && task.status === 'running') {
        // A Task is considered complete when:
        // 1. We see a new tool call that doesn't have this Task as parent
        // 2. OR explicitly when we detect the pattern change
        
        // For now, we'll mark it as complete if we have a new tool without parent
        // and this Task has at least one sub-tool
        if (newToolWithoutParent && task.subTools.length > 0) {
          task.status = 'completed';
          task.isComplete = true;
          task.completionDetectedAt = new Date().toISOString();
          
          // Update the execution group
          const groupId = this.taskGroups.get(taskId);
          if (groupId) {
            const group = this.executionGroups.get(groupId);
            if (group && group.taskExecution) {
              group.taskExecution.isComplete = true;
              group.taskExecution.status = 'completed';
              group.taskExecution.completionDetectedAt = task.completionDetectedAt;
              group.isComplete = true;
              group.endTime = new Date().toISOString();
            }
          }
          
          completedTasks.push(task);
          
          // Remove from pending tasks (keep in groups for history)
          this.pendingTasks.delete(taskId);
        }
      }
    }
    
    return completedTasks;
  }

  /**
   * Get Task execution by ID
   */
  getTaskExecution(taskId: string): TaskExecution | undefined {
    return this.pendingTasks.get(taskId);
  }

  /**
   * Get all pending Tasks
   */
  getPendingTasks(): TaskExecution[] {
    return Array.from(this.pendingTasks.values());
  }

  /**
   * Create tool execution context for UI consumption
   * Enhanced with Task workflow support
   */
  createExecutionContext(groupId?: string): ToolExecutionContext {
    const targetGroupId = groupId || this.currentGroupId;
    const group = targetGroupId ? this.executionGroups.get(targetGroupId) : undefined;
    const executions = group ? group.executions : this.getPendingExecutions();

    // Check if this is a Task workflow
    const isTaskWorkflow = group?.isTaskGroup || false;
    const taskExecution = group?.taskExecution;

    return {
      toolExecutions: executions,
      executionGroup: group,
      hasPendingTools: executions.some(e => e.status === 'pending'),
      completedToolCount: executions.filter(e => e.status === 'completed').length,
      totalToolCount: executions.length,
      taskExecution,
      isTaskWorkflow
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
   * Enhanced to handle Tasks
   */
  clear(): void {
    this.pendingTools.clear();
    this.executionGroups.clear();
    this.pendingTasks.clear();
    this.taskGroups.clear();
    this.currentGroupId = undefined;
    this.executionCounter = 0;
  }

  /**
   * Get statistics about current state
   * Enhanced with Task tracking
   */
  getStats() {
    return {
      pendingToolCount: this.pendingTools.size,
      totalGroupCount: this.executionGroups.size,
      activeGroupCount: Array.from(this.executionGroups.values()).filter(g => !g.isComplete).length,
      currentGroupId: this.currentGroupId,
      pendingTaskCount: this.pendingTasks.size,
      taskGroupCount: Array.from(this.executionGroups.values()).filter(g => g.isTaskGroup).length,
      activeTasks: Array.from(this.pendingTasks.values()).filter(t => !t.isComplete).length
    };
  }
}