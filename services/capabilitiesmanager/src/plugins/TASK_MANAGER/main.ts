import { AuthenticatedApiClient } from '../../../../../../shared/src/AuthenticatedApiClient';
import { IBaseEntity } from '../../../../../../shared/src/interfaces/IBaseEntity';

const LIBRARIAN_URL = process.env.LIBRARIAN_URL || 'http://librarian:3000';
const TASK_MANAGER_KEY = 'task-manager-tasks';

interface Subtask {
  id: string;
  goal: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

interface Task {
  id: string;
  goal: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  subtasks: Subtask[];
}

interface TaskManagerData {
  tasks: Task[];
}

class LibrarianClient {
  private apiClient: AuthenticatedApiClient;

  constructor(baseEntity: IBaseEntity) {
    this.apiClient = new AuthenticatedApiClient(baseEntity);
  }

  async getTaskList(): Promise<TaskManagerData> {
    try {
      const response = await this.apiClient.get(`${LIBRARIAN_URL}/data/${TASK_MANAGER_KEY}`);
      if (response.status === 404) {
        return { tasks: [] };
      }
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return { tasks: [] };
      }
      throw error;
    }
  }

  async saveTaskList(data: TaskManagerData): Promise<void> {
    await this.apiClient.post(`${LIBRARIAN_URL}/data`, {
      key: TASK_MANAGER_KEY,
      value: data,
    });
  }
}
// No changes to existing content
// Appending the execute function and its helpers

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export async function execute(
  command: string,
  args: any,
  baseEntity: IBaseEntity
): Promise<any> {
  const librarianClient = new LibrarianClient(baseEntity);

  switch (command) {
    case 'create_task': {
      const { goal } = args;
      const data = await librarianClient.getTaskList();
      const newTask: Task = {
        id: generateId('task'),
        goal,
        status: 'pending',
        subtasks: [],
      };
      data.tasks.push(newTask);
      await librarianClient.saveTaskList(data);
      return { task_id: newTask.id };
    }

    case 'create_subtask': {
      const { parent_task_id, goal } = args;
      const data = await librarianClient.getTaskList();
      const parentTask = data.tasks.find((task) => task.id === parent_task_id);
      if (!parentTask) {
        throw new Error(`Task with id ${parent_task_id} not found`);
      }
      const newSubtask: Subtask = {
        id: generateId('subtask'),
        goal,
        status: 'pending',
      };
      parentTask.subtasks.push(newSubtask);
      await librarianClient.saveTaskList(data);
      return { subtask_id: newSubtask.id };
    }

    case 'update_task_status': {
      const { task_id, status } = args;
      const data = await librarianClient.getTaskList();
      let taskUpdated = false;

      for (const task of data.tasks) {
        if (task.id === task_id) {
          task.status = status;
          taskUpdated = true;
          break;
        }
        const subtask = task.subtasks.find((sub) => sub.id === task_id);
        if (subtask) {
          subtask.status = status;
          taskUpdated = true;
          break;
        }
      }

      if (!taskUpdated) {
        throw new Error(`Task or subtask with id ${task_id} not found`);
      }

      await librarianClient.saveTaskList(data);
      return { success: true };
    }

    case 'get_task_list': {
      return await librarianClient.getTaskList();
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}