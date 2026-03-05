/**
 * PrerequisitePicker —— 前置任务选择器
 *
 * 显示同项目下的所有其他任务，checkbox 多选
 * 排除自身，已完成的任务标记划线
 */

import { useState, useCallback, memo } from 'react';
import { useProjectsStore, selectTasksByProject } from '../store/useProjectsStore';
import { useShallow } from 'zustand/react/shallow';
import { deriveTaskStatus } from '../types';

interface PrerequisitePickerProps {
  projectId: number;
  currentTaskId: number | null;
  selected: number[];
  onChange: (ids: number[]) => void;
  onClose: () => void;
}

export const PrerequisitePicker = memo(function PrerequisitePicker({
  projectId,
  currentTaskId,
  selected,
  onChange,
  onClose,
}: PrerequisitePickerProps) {
  const tasks = useProjectsStore(useShallow(selectTasksByProject(projectId)));
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set(selected));

  const toggleId = useCallback((id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    onChange(Array.from(checkedIds));
    onClose();
  }, [checkedIds, onChange, onClose]);

  // 排除自身
  const available = tasks.filter((t) => t.id !== currentTaskId);

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="btn-secondary" onClick={onClose}>返回</button>
        </div>

        <div className="modal-body">
          <h2 className="modal-title">选择前置任务</h2>

          {available.length === 0 ? (
            <div className="task-empty">暂无其他任务可选</div>
          ) : (
            <div className="prerequisite-list">
              {available.map((task) => {
                const status = deriveTaskStatus(task);
                return (
                  <label key={task.id} className="prerequisite-item" onClick={() => toggleId(task.id)}>
                    <input
                      type="checkbox"
                      checked={checkedIds.has(task.id)}
                      onChange={() => toggleId(task.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className={`task-name ${task.completed ? 'completed' : ''}`}>
                      {task.name}
                    </span>
                    <span className="task-status">{status}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={handleConfirm}>确认</button>
        </div>
      </div>
    </div>
  );
});
