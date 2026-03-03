/**
 * ProjectDetail —— 项目详情视图（含 TaskList）
 */

import { memo, useMemo, useState, useCallback } from 'react';
import { useProjectsStore, selectProject, selectTasksByProject } from '../store/useProjectsStore';
import { TaskList } from './TaskList';
import { TaskGraph } from './TaskGraph';
import { TaskEditModal } from './TaskEditModal';
import { ProjectEditModal } from './ProjectEditModal';
import { useShallow } from 'zustand/react/shallow';
import { formatDateTimeCN, formatDurationCN } from '../utils/formatTime';

interface ProjectDetailProps {
  projectId: number;
  onBack: () => void;
}

/** 格式化 ISO 日期为本地显示 */
function fmtDate(iso: string | null): string {
  return formatDateTimeCN(iso);
}

/** 格式化耗时（小时） */
function fmtDuration(hours: number | null): string {
  return formatDurationCN(hours);
}

export const ProjectDetail = memo(function ProjectDetail({ projectId, onBack }: ProjectDetailProps) {
  const project = useProjectsStore(selectProject(projectId));
  // useShallow 避免 .map().filter() 返回新数组引用导致无限循环
  const tasks = useProjectsStore(useShallow(selectTasksByProject(projectId)));

  // 任务编辑/新建状态
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 项目编辑浮层状态
  const [isProjectEditOpen, setIsProjectEditOpen] = useState(false);

  const handleEditTask = useCallback((taskId: number) => {
    setEditingTaskId(taskId);
    setIsModalOpen(true);
  }, []);

  const handleAddTask = useCallback(() => {
    setEditingTaskId(null);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingTaskId(null);
  }, []);

  const handleEditProject = useCallback(() => {
    setIsProjectEditOpen(true);
  }, []);

  const handleCloseProjectEdit = useCallback(() => {
    setIsProjectEditOpen(false);
  }, []);

  // 从任务汇总时间（如果项目本身没有设置）
  const summary = useMemo(() => {
    if (!project) return null;

    let planStart = project.plan_start_date;
    let planEnd = project.plan_end_date;
    let planDuration = project.plan_duration ?? 0;
    let actualStart = project.actual_start_date;
    let actualEnd = project.actual_end_date;
    let actualDuration = project.actual_duration ?? 0;

    // 如果项目没有时间数据，从任务中汇总
    if ((!planStart || !planEnd || !planDuration) && tasks.length > 0) {
      let tps: Date | null = null;
      let tpe: Date | null = null;
      let tpd = 0;
      let tas: Date | null = null;
      let tae: Date | null = null;
      let tad = 0;

      for (const t of tasks) {
        if (t.plan_start_date) {
          const d = new Date(t.plan_start_date);
          if (!tps || d < tps) tps = d;
        }
        if (t.plan_end_date) {
          const d = new Date(t.plan_end_date);
          if (!tpe || d > tpe) tpe = d;
        }
        tpd += t.plan_duration ?? 0;
        if (t.actual_start_date) {
          const d = new Date(t.actual_start_date);
          if (!tas || d < tas) tas = d;
        }
        if (t.actual_end_date) {
          const d = new Date(t.actual_end_date);
          if (!tae || d > tae) tae = d;
        }
        tad += t.actual_duration ?? 0;
      }

      if (!planStart && tps) planStart = tps.toISOString();
      if (!planEnd && tpe) planEnd = tpe.toISOString();
      if (!planDuration) planDuration = tpd;
      if (!actualStart && tas) actualStart = tas.toISOString();
      if (!actualEnd && tae) actualEnd = tae.toISOString();
      if (!actualDuration) actualDuration = tad;
    }

    return { planStart, planEnd, planDuration, actualStart, actualEnd, actualDuration };
  }, [project, tasks]);

  if (!project || !summary) {
    return <div className="empty-message">项目不存在</div>;
  }

  return (
    <div>
      <button className="btn-secondary" onClick={onBack}>
        返回
      </button>
      <h2 className="modal-title">{project.name}</h2>

      <div className="project-detail-meta" style={{ marginBottom: 16 }}>
        <div className="detail-info-text">
          <div>
            <span className="detail-label">预计：</span>
            {fmtDate(summary.planStart)} <span className="detail-label">至</span>{' '}
            {fmtDate(summary.planEnd)}　
            <span className="detail-label">耗时：</span>
            {fmtDuration(summary.planDuration)}
          </div>
          <div>
            <span className="detail-label">实际：</span>
            {fmtDate(summary.actualStart)} <span className="detail-label">至</span>{' '}
            {fmtDate(summary.actualEnd)}　
            <span className="detail-label">耗时：</span>
            {fmtDuration(summary.actualDuration)}
          </div>
          <div>
            <span className="detail-label">重要度：</span>
            {project.priority ?? '—'}　<span className="detail-label">类别：</span>
            {project.category ?? '—'}　<span className="detail-label">赏金：</span>
            {project.bounty ?? 0}
          </div>
        </div>
      </div>

      {/* 力导向任务关系图 */}
      <TaskGraph tasks={tasks} onEditTask={handleEditTask} />

      <TaskList projectId={projectId} onEditTask={handleEditTask} />

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button className="btn-edit" onClick={handleEditProject}>编辑项目</button>
        <button className="btn-success" onClick={handleAddTask}>添加任务</button>
      </div>

      {/* 任务编辑/新建浮层 */}
      {isModalOpen && (
        <TaskEditModal
          taskId={editingTaskId}
          projectId={projectId}
          onClose={handleCloseModal}
        />
      )}

      {/* 项目编辑浮层 */}
      {isProjectEditOpen && (
        <ProjectEditModal
          projectId={projectId}
          onClose={handleCloseProjectEdit}
        />
      )}
    </div>
  );
});
