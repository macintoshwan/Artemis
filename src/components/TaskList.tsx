/**
 * TaskList —— 按 project 分组的任务列表
 * 每个 TaskItem 只订阅自己的 task 数据。
 */

import React, { memo, useCallback } from 'react';
import {
  useProjectsStore,
  selectTaskIdsByProject,
  selectTask,
} from '../store/useProjectsStore';
import { useTaskActions } from '../hooks/useActions';
import { deriveTaskStatus } from '../types';
import type { TaskStatus } from '../types';
import { useShallow } from 'zustand/react/shallow';
import { formatTimeRemainingCN } from '../utils/formatTime';

// ============================================================
// TaskStatusBar —— 状态切换按钮组
// ============================================================

const STATUS_OPTIONS: { key: TaskStatus; label: string }[] = [
  { key: 'backlog', label: 'backlog' },
  { key: 'ready', label: 'ready' },
  { key: 'in-progress', label: 'in progress' },
  { key: 'done', label: 'done' },
];

interface TaskStatusBarProps {
  currentStatus: TaskStatus;
  onChangeStatus: (status: TaskStatus) => void;
}

const TaskStatusBar = memo(function TaskStatusBar({ currentStatus, onChangeStatus }: TaskStatusBarProps) {
  return (
    <div className="task-status-buttons">
      {STATUS_OPTIONS.map(({ key, label }) => (
        <button
          key={key}
          className={`task-status-btn status-${key} ${
            currentStatus === key ? 'active' : ''
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onChangeStatus(key);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
});

// ============================================================
// TaskItem —— 单个任务项（memo 化，独立订阅）
// ============================================================

interface TaskItemProps {
  taskId: number;
  onEdit?: (taskId: number) => void;
}

const TaskItem = memo(function TaskItem({ taskId, onEdit }: TaskItemProps) {
  const task = useProjectsStore(selectTask(taskId));
  const { removeTask, setTaskStatus } = useTaskActions();

  const handleStatusChange = useCallback(
    async (status: TaskStatus) => {
      try {
        await setTaskStatus(taskId, status);
      } catch (err) {
        console.error('设置任务状态失败:', err);
      }
    },
    [taskId, setTaskStatus],
  );

  const handleDelete = useCallback(async () => {
    try {
      await removeTask(taskId);
    } catch (err) {
      console.error('删除任务失败:', err);
    }
  }, [taskId, removeTask]);

  if (!task) return null;

  const status = deriveTaskStatus(task);

  return (
    <div className="task-item">
      <TaskStatusBar currentStatus={status} onChangeStatus={handleStatusChange} />
      <span
        className={`task-name ${task.completed ? 'completed' : ''}`}
        onClick={() => onEdit?.(taskId)}
      >
        {task.name}
      </span>
      {task.plan_end_date && !task.actual_end_date && (
        <TimeRemainingTask planEndDate={task.plan_end_date} />
      )}
      <button className="btn-danger" onClick={handleDelete}>
        删除
      </button>
    </div>
  );
});

// ============================================================
// TimeRemainingTask —— 任务剩余时间（秒级更新）
// ============================================================

function TimeRemainingTask({ planEndDate }: { planEndDate: string }) {
  const [text, setText] = React.useState('');

  React.useEffect(() => {
    function tick() {
      const diff = new Date(planEndDate).getTime() - Date.now();
      setText(formatTimeRemainingCN(diff));
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [planEndDate]);

  const diff = new Date(planEndDate).getTime() - Date.now();
  const cls = diff > 86_400_000 ? 'positive' : diff > 0 ? 'warning' : 'negative';

  return <span className={`time-remaining ${cls}`}>{text}</span>;
}

// ============================================================
// TaskList —— 外部接口
// ============================================================

interface TaskListProps {
  projectId: number;
  onEditTask?: (taskId: number) => void;
}

export const TaskList = memo(function TaskList({ projectId, onEditTask }: TaskListProps) {
  // 只订阅该 project 的 task id 列表
  const taskIds = useProjectsStore(useShallow(selectTaskIdsByProject(projectId)));

  if (taskIds.length === 0) {
    return <div className="task-empty">暂无任务</div>;
  }

  return (
    <div className="task-list">
      {taskIds.map((id) => (
        <TaskItem key={id} taskId={id} onEdit={onEditTask} />
      ))}
    </div>
  );
});
