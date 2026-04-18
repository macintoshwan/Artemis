import { useMemo } from 'react';
import { useProjectsStore, selectProjectIds } from '../store/useProjectsStore';
import { deriveTaskStatus } from '../types';
import { TodoList } from './TodoList';
import type { TodoItem } from '../types';
import type { TaskStatus } from '../types';

interface TodoListContainerProps {
  onCreateTodoTask: () => void;
  onChangeTodoStatus: (taskId: number, status: TaskStatus) => Promise<void>;
}

export function TodoListContainer({
  onCreateTodoTask,
  onChangeTodoStatus,
}: TodoListContainerProps) {
  const projectIds = useProjectsStore(selectProjectIds);
  const projects = useProjectsStore((state) => state.projects);
  const tasks = useProjectsStore((state) => state.tasks);
  const tasksByProject = useProjectsStore((state) => state.tasksByProject);

  const todoItems = useMemo(() => {
    const items: TodoItem[] = [];

    for (const projectId of projectIds) {
      const project = projects[projectId];
      if (!project) continue;
      const taskIds = tasksByProject[projectId] ?? [];
      for (const taskId of taskIds) {
        const task = tasks[taskId];
        if (!task) continue;
        const status = deriveTaskStatus(task);
        if (status !== 'done') {
          items.push({
            id: task.id,
            name: task.name,
            type: 'project-task',
            projectId: project.id,
            projectName: project.name,
            status,
            completed: task.completed,
          });
        }
      }
    }

    return items;
  }, [projectIds, projects, tasks, tasksByProject]);

  return (
    <TodoList
      items={todoItems}
      onCreateTodoTask={onCreateTodoTask}
      onChangeTodoStatus={onChangeTodoStatus}
    />
  );
}
