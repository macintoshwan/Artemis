/**
 * ProjectEditModal —— 项目编辑/新建浮层
 *
 * 功能：
 * - 编辑已有项目（自动保存，防抖 1s）
 * - 新建项目（点击确认后创建）
 * - 完整表单：名称、时间、耗时、优先级（下拉）、类别、赏金
 * - 日期字段下方显示相对时间（今天/明天/3天后…）
 * - 时间一致性验证（开始+耗时≈结束）
 */

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useProjectsStore, selectProject } from '../store/useProjectsStore';
import { useProjectActions } from '../hooks/useActions';
import { useAuth } from '../hooks/useAuth';
import { TimeFieldGroup } from './TimeFieldGroup';
import type { Project } from '../types';

// ============================================================
// 类型
// ============================================================

interface ProjectEditModalProps {
  /** 项目 ID，null 表示新建 */
  projectId: number | null;
  /** 关闭回调 */
  onClose: () => void;
}

interface ProjectFormData {
  name: string;
  plan_start_date: string;
  plan_end_date: string;
  plan_duration: string;
  actual_start_date: string;
  actual_end_date: string;
  actual_duration: string;
  priority: string;
  category: string;
  bounty: string;
}

const EMPTY_FORM: ProjectFormData = {
  name: '',
  plan_start_date: '',
  plan_end_date: '',
  plan_duration: '',
  actual_start_date: '',
  actual_end_date: '',
  actual_duration: '',
  priority: '中',
  category: '工作',
  bounty: '',
};

// ============================================================
// 辅助
// ============================================================

/** ISO → 本地 datetime-local 格式 */
function isoToLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local → ISO */
function localToIso(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

function projectToForm(project: Project): ProjectFormData {
  return {
    name: project.name ?? '',
    plan_start_date: isoToLocal(project.plan_start_date),
    plan_end_date: isoToLocal(project.plan_end_date),
    plan_duration: project.plan_duration !== null && project.plan_duration !== undefined ? String(project.plan_duration) : '',
    actual_start_date: isoToLocal(project.actual_start_date),
    actual_end_date: isoToLocal(project.actual_end_date),
    actual_duration: project.actual_duration !== null && project.actual_duration !== undefined ? String(project.actual_duration) : '',
    priority: project.priority ?? '中',
    category: project.category ?? '工作',
    bounty: project.bounty !== null && project.bounty !== undefined ? String(project.bounty) : '',
  };
}

/** 修正三个值中的一个 */
type FixTarget = 'start' | 'duration' | 'end';
function fixTime(start: string, duration: string, end: string, target: FixTarget): { start: string; duration: string; end: string } {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const d = parseFloat(duration);
  if (target === 'start' && !isNaN(e) && !isNaN(d)) {
    return { start: isoToLocal(new Date(e - d * 3_600_000).toISOString()), duration, end };
  }
  if (target === 'duration' && !isNaN(s) && !isNaN(e)) {
    const hours = Math.round((e - s) / 3_600_000 * 100) / 100;
    return { start, duration: String(Math.max(0, hours)), end };
  }
  if (target === 'end' && !isNaN(s) && !isNaN(d)) {
    return { start, duration, end: isoToLocal(new Date(s + d * 3_600_000).toISOString()) };
  }
  return { start, duration, end };
}

// ============================================================
// 组件
// ============================================================

export const ProjectEditModal = memo(function ProjectEditModal({
  projectId,
  onClose,
}: ProjectEditModalProps) {
  const isNew = projectId === null;
  const project = useProjectsStore(selectProject(projectId ?? -1));
  const { user } = useAuth();
  const { createProject, updateProject } = useProjectActions();

  const [form, setForm] = useState<ProjectFormData>(EMPTY_FORM);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitRef = useRef(false);

  // 初始化表单
  useEffect(() => {
    if (isNew) {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      setForm({
        ...EMPTY_FORM,
        plan_start_date: isoToLocal(now.toISOString()),
        plan_end_date: isoToLocal(new Date(now.getTime() + 3_600_000).toISOString()),
        plan_duration: '1',
      });
    } else if (project) {
      setForm(projectToForm(project));
    }
    isInitRef.current = true;
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 从 store 同步外部变更（realtime）
  useEffect(() => {
    if (!isInitRef.current || isNew || !project) return;
    setForm((prev) => {
      const fresh = projectToForm(project);
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(fresh) as (keyof ProjectFormData)[]) {
        if (prev[key] !== fresh[key]) {
          next[key] = fresh[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [project, isNew]);

  // 防抖自动保存（仅编辑模式）
  const autoSave = useCallback(
    (newForm: ProjectFormData) => {
      if (isNew || !projectId) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        if (!newForm.name.trim()) return;
        try {
          await updateProject(projectId, {
            name: newForm.name.trim(),
            plan_start_date: localToIso(newForm.plan_start_date),
            plan_end_date: localToIso(newForm.plan_end_date),
            plan_duration: parseFloat(newForm.plan_duration) || null,
            actual_start_date: localToIso(newForm.actual_start_date),
            actual_end_date: localToIso(newForm.actual_end_date),
            actual_duration: parseFloat(newForm.actual_duration) || null,
            priority: newForm.priority || null,
            category: newForm.category,
            bounty: parseFloat(newForm.bounty) || null,
          });
        } catch (err) {
          console.error('自动保存项目失败:', err);
        }
      }, 1000);
    },
    [projectId, isNew, updateProject],
  );

  // cleanup timer
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handleChange = useCallback(
    (field: keyof ProjectFormData, value: string) => {
      setForm((prev) => {
        const next = { ...prev, [field]: value };
        autoSave(next);
        return next;
      });
    },
    [autoSave],
  );

  // 时间字段变更回调（映射 TimeFieldGroup 的 field 到 form 字段）
  const handleTimeChange = useCallback(
    (group: 'plan' | 'actual', field: 'start' | 'duration' | 'end', value: string) => {
      const fieldMap = {
        plan: { start: 'plan_start_date', duration: 'plan_duration', end: 'plan_end_date' },
        actual: { start: 'actual_start_date', duration: 'actual_duration', end: 'actual_end_date' },
      } as const;
      handleChange(fieldMap[group][field], value);
    },
    [handleChange],
  );

  const handleFix = useCallback(
    (group: 'plan' | 'actual', target: FixTarget) => {
      setForm((prev) => {
        const s = group === 'plan' ? prev.plan_start_date : prev.actual_start_date;
        const d = group === 'plan' ? prev.plan_duration : prev.actual_duration;
        const e = group === 'plan' ? prev.plan_end_date : prev.actual_end_date;
        const fixed = fixTime(s, d, e, target);
        const next = group === 'plan'
          ? { ...prev, plan_start_date: fixed.start, plan_duration: fixed.duration, plan_end_date: fixed.end }
          : { ...prev, actual_start_date: fixed.start, actual_duration: fixed.duration, actual_end_date: fixed.end };
        autoSave(next);
        return next;
      });
    },
    [autoSave],
  );

  // 新建项目确认
  const handleCreate = useCallback(async () => {
    if (!form.name.trim()) { alert('请输入项目名称！'); return; }
    if (!user) { alert('请先登录'); return; }

    try {
      await createProject({
        id: Date.now(),
        user_id: user.id,
        is_system: false,
        is_frozen: false,
        is_archived: false,
        name: form.name.trim(),
        plan_start_date: localToIso(form.plan_start_date),
        plan_end_date: localToIso(form.plan_end_date),
        plan_duration: parseFloat(form.plan_duration) || null,
        actual_start_date: localToIso(form.actual_start_date),
        actual_end_date: localToIso(form.actual_end_date),
        actual_duration: parseFloat(form.actual_duration) || null,
        priority: form.priority || null,
        category: form.category,
        bounty: parseFloat(form.bounty) || null,
      });
      onClose();
    } catch (err) {
      console.error('创建项目失败:', err);
      alert('创建项目失败，请重试');
    }
  }, [form, user, createProject, onClose]);

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="modal-header">
          <button className="btn-secondary" onClick={onClose}>返回</button>
        </div>

        {/* 主体 */}
        <div className="modal-body">
          <h2 className="modal-title">{isNew ? '新建项目' : '编辑项目'}</h2>

          <div className="form-grid">
            {/* 第一行：名称、类别、赏金 */}
            <div className="form-item">
              <label>名称 <span className="required">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="请输入项目名称"
              />
            </div>
            <div className="form-item">
              <label>类别</label>
              <select value={form.category} onChange={(e) => handleChange('category', e.target.value)}>
                <option value="工作">工作</option>
                <option value="学习">学习</option>
                <option value="生活">生活</option>
                <option value="其他">其他</option>
              </select>
            </div>
            <div className="form-item">
              <label>赏金</label>
              <input
                type="number"
                value={form.bounty}
                onChange={(e) => handleChange('bounty', e.target.value)}
                placeholder="赏金"
                min="0"
              />
            </div>

            {/* 第二行：预计时间 */}
            <TimeFieldGroup
              label="预计"
              start={form.plan_start_date}
              duration={form.plan_duration}
              end={form.plan_end_date}
              onChange={(field, value) => handleTimeChange('plan', field, value)}
              onFix={(target) => handleFix('plan', target)}
            />

            {/* 第三行：实际时间 */}
            <TimeFieldGroup
              label="实际"
              start={form.actual_start_date}
              duration={form.actual_duration}
              end={form.actual_end_date}
              onChange={(field, value) => handleTimeChange('actual', field, value)}
              onFix={(target) => handleFix('actual', target)}
            />

            {/* 第四行：优先级 */}
            <div className="form-item">
              <label>优先级</label>
              <select value={form.priority} onChange={(e) => handleChange('priority', e.target.value)}>
                <option value="低">低</option>
                <option value="中">中</option>
                <option value="高">高</option>
              </select>
            </div>
            <div className="form-item" style={{ gridColumn: '2 / -1' }} />
          </div>
        </div>

        {/* 底部：新建模式显示确认按钮 */}
        {isNew && (
          <div className="modal-footer">
            <button className="btn-primary" onClick={handleCreate}>确认创建</button>
          </div>
        )}
      </div>
    </div>
  );
});
