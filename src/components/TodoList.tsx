import { useCallback } from 'react';
import type { TaskStatus, TodoItem } from '../types';

const STATUS_OPTIONS: { key: TaskStatus; label: string }[] = [
  { key: 'backlog', label: 'back' },
  { key: 'ready', label: 'ready' },
  { key: 'in-progress', label: 'inprocess' },
  { key: 'done', label: 'done' },
];

interface TodoListProps {
  items: TodoItem[];
  onCreateTodoTask: () => void;
  onChangeTodoStatus: (taskId: number, status: TaskStatus) => Promise<void>;
  onSelectTodoTask: (taskId: number) => void;
}

export function TodoList({
  items,
  onCreateTodoTask,
  onChangeTodoStatus,
  onSelectTodoTask,
}: TodoListProps) {
  const handleChangeStatus = useCallback(
    async (taskId: number, status: TaskStatus) => {
      try {
        await onChangeTodoStatus(taskId, status);
      } catch (error) {
        console.error('更新待办状态失败:', error);
      }
    },
    [onChangeTodoStatus],
  );

  return (
    <section className="todo-section">
      <h2 className="todo-title">待办事项</h2>

      {items.length === 0 ? (
        <div className="todo-empty">暂无待办事项</div>
      ) : (
        <ul className="todo-list">
          {items.map((item) => (
            <li
              key={item.id}
              className="todo-item"
              onClick={() => onSelectTodoTask(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectTodoTask(item.id);
                }
              }}
            >
              <div className="task-status-buttons">
                {STATUS_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    className={`task-status-btn status-${key} ${item.status === key ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleChangeStatus(item.id, key);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="todo-content">
                <span className={`todo-text ${item.completed ? 'completed' : ''}`}>
                  {item.name}
                </span>
                {item.projectName && (
                  <span className="todo-project-tag">{item.projectName}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="section-footer">
        <button className="btn-primary btn-create-action" onClick={onCreateTodoTask}>
          创建待办
        </button>
      </div>
    </section>
  );
}
