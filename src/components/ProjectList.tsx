/**
 * ProjectList —— 项目列表组件
 * 使用 selector 精确订阅 projectIds，单个 ProjectCard 独立订阅自身数据。
 */

import React, { memo, useMemo } from 'react';
import { useProjectsStore, selectProjectIds, selectProject, selectMeta, selectTasksByProject } from '../store/useProjectsStore';
import { useProjectActions } from '../hooks/useActions';
import { useShallow } from 'zustand/react/shallow';
import { formatTimeRemainingCN } from '../utils/formatTime';

function isTempProject(project: { is_system?: boolean; category?: string | null; name?: string } | undefined): boolean {
  if (!project) return false;
  return project.is_system === true || project.category === 'system' || project.name === '临时';
}

// ============================================================
// ProjectCard —— 单个项目卡片（memo 化）
// ============================================================

interface ProjectCardProps {
  projectId: number;
  onSelect: (id: number) => void;
}

const ProjectCard = memo(function ProjectCard({ projectId, onSelect }: ProjectCardProps) {
  // 只订阅该 project 的数据，其他 project 变化不会触发 re-render
  const project = useProjectsStore(selectProject(projectId));
  const tasks = useProjectsStore(useShallow(selectTasksByProject(projectId)));
  const { removeProject, updateProject } = useProjectActions();

  // 计算 planEndDate：项目自身有值就用，否则从任务中取最晚的
  const planEndDate = useMemo(() => {
    if (project?.is_frozen || project?.is_archived) return null;
    if (project?.plan_end_date) return project.plan_end_date;
    if (!tasks || tasks.length === 0) return null;

    // 所有任务已完成则不显示
    const allDone = tasks.every((t) => t.completed);
    if (allDone) return null;

    let latest: Date | null = null;
    for (const t of tasks) {
      if (t.plan_end_date) {
        const d = new Date(t.plan_end_date);
        if (!latest || d > latest) latest = d;
      }
    }
    return latest ? latest.toISOString() : null;
  }, [project?.plan_end_date, tasks]);

  if (!project) return null;

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除这个项目吗？所有任务也会被删除！')) return;
    try {
      await removeProject(projectId);
    } catch (err) {
      console.error('删除项目失败:', err);
    }
  };

  const handleToggleFreeze = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!project) return;
    const allDone = tasks.every((t) => t.completed);
    if (!project.is_frozen && allDone) {
      alert('项目已完成，无需冻结');
      return;
    }
    try {
      await updateProject(projectId, { is_frozen: !project.is_frozen });
    } catch (err) {
      console.error('切换冻结状态失败:', err);
      alert('切换冻结状态失败，请重试');
    }
  };

  const handleToggleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!project) return;
    try {
      const nextArchived = !project.is_archived;
      await updateProject(projectId, {
        is_archived: nextArchived,
        ...(nextArchived ? { is_frozen: false } : {}),
      });
    } catch (err) {
      console.error('切换归档状态失败:', err);
      alert('切换归档状态失败，请重试');
    }
  };

  return (
    <div className="project-card" onClick={() => onSelect(projectId)}>
      <div className="project-header">
        <div className="project-header-main">
          {project.is_archived && <span className="project-state-tag">已归档</span>}
          {project.is_frozen && <span className="project-state-tag">已冻结</span>}
          <span className="project-title">{project.name}</span>
        </div>
        <TimeRemaining planEndDate={planEndDate} />
        <div className="project-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn-secondary" onClick={handleToggleArchive}>
            {project.is_archived ? '解档' : '归档'}
          </button>
          <button className="btn-secondary" onClick={handleToggleFreeze}>
            {project.is_frozen ? '解冻' : '冻结'}
          </button>
          <button className="btn-danger" onClick={handleDelete}>
            删除
          </button>
        </div>
      </div>
    </div>
  );
});

// ============================================================
// TimeRemaining —— 剩余时间显示（中文）
// ============================================================

function TimeRemaining({ planEndDate }: { planEndDate: string | null }) {
  const [display, setDisplay] = React.useState('');

  React.useEffect(() => {
    if (!planEndDate) return;

    function update() {
      const diff = new Date(planEndDate!).getTime() - Date.now();
      setDisplay(formatTimeRemainingCN(diff));
    }

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [planEndDate]);

  if (!planEndDate) return null;

  const diff = new Date(planEndDate).getTime() - Date.now();
  const cls = diff > 86_400_000 ? 'positive' : diff > 0 ? 'warning' : 'negative';

  return <span className={`time-remaining ${cls}`}>{display}</span>;
}

// ============================================================
// ProjectList —— 主列表
// ============================================================

interface ProjectListProps {
  onSelectProject: (id: number) => void;
}

export const ProjectList = memo(function ProjectList({ onSelectProject }: ProjectListProps) {
  // 只订阅 projectIds 数组（shallow 比较避免引用变动）
  const projectIds = useProjectsStore(useShallow(selectProjectIds));
  const { initialized, loading, error } = useProjectsStore(useShallow(selectMeta));
  const projects = useProjectsStore((state) => state.projects);

  const visibleProjectIds = projectIds.filter((id) => !isTempProject(projects[id]));

  if (loading && !initialized) {
    return <div className="empty-message">加载中...</div>;
  }

  if (error) {
    return <div className="empty-message">加载失败: {error}</div>;
  }

  if (visibleProjectIds.length === 0) {
    return <div className="empty-message">暂无项目，请创建第一个项目</div>;
  }

  return (
    <div className="project-list">
      {visibleProjectIds.map((id) => (
        <ProjectCard key={id} projectId={id} onSelect={onSelectProject} />
      ))}
    </div>
  );
});
