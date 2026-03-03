/**
 * TaskEditModal —— 任务编辑/新建浮层
 *
 * 功能：
 * - 编辑已有任务（自动保存，防抖 1s）
 * - 新建任务（点击确认后创建）
 * - 完整表单：名称、时间、耗时、类别、赏金、完成状态、详情
 * - 优先级矩阵（重要度/紧急度）
 * - 前置任务选择器
 * - 赏金选择器（预设值）
 * - 类别默认继承项目
 * - 相对时间 + 时间一致性验证
 */

import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { useProjectsStore, selectTask, selectProject } from '../store/useProjectsStore';
import { useTaskActions } from '../hooks/useActions';
import { useAuth } from '../hooks/useAuth';
import { formatRelativeTimeCN } from '../utils/formatTime';
import { PriorityMatrixPicker } from './PriorityMatrixPicker';
import { PrerequisitePicker } from './PrerequisitePicker';
import { BountyPicker } from './BountyPicker';
import type { Task, TaskPriority } from '../types';

// ============================================================
// 类型
// ============================================================

interface TaskEditModalProps {
  /** 任务 ID，null 表示新建 */
  taskId: number | null;
  /** 所属项目 ID */
  projectId: number;
  /** 关闭回调 */
  onClose: () => void;
}

interface TaskFormData {
  name: string;
  plan_start_date: string;
  plan_end_date: string;
  plan_duration: string;
  actual_start_date: string;
  actual_end_date: string;
  actual_duration: string;
  category: string;
  bounty: string;
  completed: string;
  description: string;
  importance: number;
  urgency: number;
  prerequisites: number[];
}

const EMPTY_FORM: TaskFormData = {
  name: '',
  plan_start_date: '',
  plan_end_date: '',
  plan_duration: '',
  actual_start_date: '',
  actual_end_date: '',
  actual_duration: '',
  category: '工作',
  bounty: '',
  completed: 'false',
  description: '',
  importance: 0,
  urgency: 0,
  prerequisites: [],
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

function taskToForm(task: Task): TaskFormData {
  const p = task.priority;
  return {
    name: task.name ?? '',
    plan_start_date: isoToLocal(task.plan_start_date),
    plan_end_date: isoToLocal(task.plan_end_date),
    plan_duration: task.plan_duration != null ? String(task.plan_duration) : '',
    actual_start_date: isoToLocal(task.actual_start_date),
    actual_end_date: isoToLocal(task.actual_end_date),
    actual_duration: task.actual_duration != null ? String(task.actual_duration) : '',
    category: task.category ?? '工作',
    bounty: task.bounty != null ? String(task.bounty) : '',
    completed: task.completed ? 'true' : 'false',
    description: task.description ?? '',
    importance: p?.importance ?? 0,
    urgency: p?.urgency ?? 0,
    prerequisites: task.prerequisites ?? [],
  };
}

/** 检查 开始+耗时 是否约等于 结束（容差 30s） */
function checkTimeConsistency(start: string, duration: string, end: string): boolean {
  if (!start || !duration || !end) return true;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const d = parseFloat(duration);
  if (isNaN(s) || isNaN(e) || isNaN(d)) return true;
  return Math.abs(s + d * 3_600_000 - e) <= 30_000;
}

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

/** 格式化优先级显示文字 */
function fmtPriority(imp: number, urg: number): string {
  const iLabel = imp >= 0 ? `重要${imp.toFixed(1)}` : `不重要${Math.abs(imp).toFixed(1)}`;
  const uLabel = urg >= 0 ? `紧急${urg.toFixed(1)}` : `不紧急${Math.abs(urg).toFixed(1)}`;
  return `${iLabel} / ${uLabel}`;
}

// ============================================================
// 组件
// ============================================================

export const TaskEditModal = memo(function TaskEditModal({
  taskId,
  projectId,
  onClose,
}: TaskEditModalProps) {
  const isNew = taskId === null;
  const task = useProjectsStore(selectTask(taskId ?? -1));
  const project = useProjectsStore(selectProject(projectId));
  const { user } = useAuth();
  const { createTask, updateTask } = useTaskActions();

  const [form, setForm] = useState<TaskFormData>(EMPTY_FORM);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitRef = useRef(false);

  // 弹窗开关
  const [showPriority, setShowPriority] = useState(false);
  const [showPrereqs, setShowPrereqs] = useState(false);
  const [showBounty, setShowBounty] = useState(false);

  // 初始化表单（仅首次 / taskId 变化时）
  useEffect(() => {
    if (isNew) {
      // 新建：计算默认时间，继承项目类别
      const now = new Date();
      now.setMinutes(0, 0, 0);
      setForm({
        ...EMPTY_FORM,
        plan_start_date: isoToLocal(now.toISOString()),
        plan_end_date: isoToLocal(new Date(now.getTime() + 3_600_000).toISOString()),
        plan_duration: '1',
        category: project?.category ?? '工作',
      });
    } else if (task) {
      setForm(taskToForm(task));
    }
    isInitRef.current = true;
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 从 store 同步外部变更（realtime），但不覆盖用户正在编辑的字段
  useEffect(() => {
    if (!isInitRef.current || isNew || !task) return;
    setForm((prev) => {
      const fresh = taskToForm(task);
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(fresh) as (keyof TaskFormData)[]) {
        if (JSON.stringify(prev[key]) !== JSON.stringify(fresh[key])) {
          (next as Record<string, unknown>)[key] = fresh[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [task, isNew]);

  // 构建保存 payload
  const buildPayload = useCallback((f: TaskFormData) => ({
    name: f.name.trim(),
    plan_start_date: localToIso(f.plan_start_date),
    plan_end_date: localToIso(f.plan_end_date),
    plan_duration: parseFloat(f.plan_duration) || null,
    actual_start_date: localToIso(f.actual_start_date),
    actual_end_date: localToIso(f.actual_end_date),
    actual_duration: parseFloat(f.actual_duration) || null,
    category: f.category,
    bounty: parseFloat(f.bounty) || null,
    completed: f.completed === 'true',
    description: f.description || null,
    priority: (f.importance !== 0 || f.urgency !== 0)
      ? { importance: f.importance, urgency: f.urgency } as TaskPriority
      : null,
    prerequisites: f.prerequisites.length > 0 ? f.prerequisites : null,
  }), []);

  // 防抖自动保存（仅编辑模式）
  const autoSave = useCallback(
    (newForm: TaskFormData) => {
      if (isNew || !taskId) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        if (!newForm.name.trim()) return;
        try {
          await updateTask(taskId, buildPayload(newForm));
        } catch (err) {
          console.error('自动保存失败:', err);
        }
      }, 1000);
    },
    [taskId, isNew, updateTask, buildPayload],
  );

  // cleanup timer
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handleChange = useCallback(
    (field: keyof TaskFormData, value: string) => {
      setForm((prev) => {
        const next = { ...prev, [field]: value };
        autoSave(next);
        return next;
      });
    },
    [autoSave],
  );

  // 时间一致性
  const planConsistent = useMemo(
    () => checkTimeConsistency(form.plan_start_date, form.plan_duration, form.plan_end_date),
    [form.plan_start_date, form.plan_duration, form.plan_end_date],
  );
  const actualConsistent = useMemo(
    () => checkTimeConsistency(form.actual_start_date, form.actual_duration, form.actual_end_date),
    [form.actual_start_date, form.actual_duration, form.actual_end_date],
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

  // 优先级矩阵回调
  const handlePriorityChange = useCallback(
    (importance: number, urgency: number) => {
      setForm((prev) => {
        const next = { ...prev, importance, urgency };
        autoSave(next);
        return next;
      });
    },
    [autoSave],
  );

  // 前置任务回调
  const handlePrereqsChange = useCallback(
    (ids: number[]) => {
      setForm((prev) => {
        const next = { ...prev, prerequisites: ids };
        autoSave(next);
        return next;
      });
    },
    [autoSave],
  );

  // 赏金选择器回调
  const handleBountySelect = useCallback(
    (value: number) => {
      setForm((prev) => {
        const next = { ...prev, bounty: String(value) };
        autoSave(next);
        return next;
      });
    },
    [autoSave],
  );

  // 新建任务确认
  const handleCreate = useCallback(async () => {
    if (!form.name.trim()) { alert('请输入任务名称！'); return; }
    if (!user) { alert('请先登录'); return; }

    try {
      await createTask({
        id: Date.now(),
        project_id: projectId,
        user_id: user.id,
        ...buildPayload(form),
      });
      onClose();
    } catch (err) {
      console.error('创建任务失败:', err);
      alert('创建任务失败，请重试');
    }
  }, [form, projectId, user, createTask, onClose, buildPayload]);

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="modal-header">
          <button className="btn-secondary" onClick={onClose}>返回</button>
        </div>

        {/* 主体 */}
        <div className="modal-body">
          <h2 className="modal-title">{isNew ? '添加任务' : '编辑任务'}</h2>

          <div className="form-grid">
            {/* 第一行：名称、类别、赏金 */}
            <div className="form-item">
              <label>名称 <span className="required">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="请输入任务名称"
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
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  type="number"
                  value={form.bounty}
                  onChange={(e) => handleChange('bounty', e.target.value)}
                  placeholder="赏金"
                  min="0"
                  style={{ flex: 1 }}
                />
                <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => setShowBounty(true)}>选</button>
              </div>
            </div>

            {/* 第二行：预计 */}
            <div className="form-item">
              <label>
                预计开始
                {!planConsistent && (
                  <button className="btn-fix" onClick={() => handleFix('plan', 'start')} title="修正">修正</button>
                )}
              </label>
              <input
                type="datetime-local"
                value={form.plan_start_date}
                onChange={(e) => handleChange('plan_start_date', e.target.value)}
              />
              {form.plan_start_date && (
                <span className="relative-time">{formatRelativeTimeCN(form.plan_start_date)}</span>
              )}
            </div>
            <div className="form-item">
              <label>
                预计耗时(h)
                {!planConsistent && (
                  <button className="btn-fix" onClick={() => handleFix('plan', 'duration')} title="修正">修正</button>
                )}
              </label>
              <input
                type="number"
                value={form.plan_duration}
                onChange={(e) => handleChange('plan_duration', e.target.value)}
                placeholder="小时"
                min="0"
                step="0.5"
              />
            </div>
            <div className="form-item">
              <label>
                预计结束
                {!planConsistent && (
                  <button className="btn-fix" onClick={() => handleFix('plan', 'end')} title="修正">修正</button>
                )}
              </label>
              <input
                type="datetime-local"
                value={form.plan_end_date}
                onChange={(e) => handleChange('plan_end_date', e.target.value)}
              />
              {form.plan_end_date && (
                <span className="relative-time">{formatRelativeTimeCN(form.plan_end_date)}</span>
              )}
            </div>

            {/* 第三行：实际 */}
            <div className="form-item">
              <label>
                实际开始
                {!actualConsistent && (
                  <button className="btn-fix" onClick={() => handleFix('actual', 'start')} title="修正">修正</button>
                )}
              </label>
              <input
                type="datetime-local"
                value={form.actual_start_date}
                onChange={(e) => handleChange('actual_start_date', e.target.value)}
              />
              {form.actual_start_date && (
                <span className="relative-time">{formatRelativeTimeCN(form.actual_start_date)}</span>
              )}
            </div>
            <div className="form-item">
              <label>
                实际耗时(h)
                {!actualConsistent && (
                  <button className="btn-fix" onClick={() => handleFix('actual', 'duration')} title="修正">修正</button>
                )}
              </label>
              <input
                type="number"
                value={form.actual_duration}
                onChange={(e) => handleChange('actual_duration', e.target.value)}
                placeholder="小时"
                min="0"
                step="0.5"
              />
            </div>
            <div className="form-item">
              <label>
                实际结束
                {!actualConsistent && (
                  <button className="btn-fix" onClick={() => handleFix('actual', 'end')} title="修正">修正</button>
                )}
              </label>
              <input
                type="datetime-local"
                value={form.actual_end_date}
                onChange={(e) => handleChange('actual_end_date', e.target.value)}
              />
              {form.actual_end_date && (
                <span className="relative-time">{formatRelativeTimeCN(form.actual_end_date)}</span>
              )}
            </div>

            {/* 第四行：完成状态、优先级、前置任务 */}
            <div className="form-item">
              <label>完成状态</label>
              <select value={form.completed} onChange={(e) => handleChange('completed', e.target.value)}>
                <option value="false">未完成</option>
                <option value="true">已完成</option>
              </select>
            </div>
            <div className="form-item">
              <label>优先级矩阵</label>
              <button
                className="btn-secondary"
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() => setShowPriority(true)}
              >
                {form.importance === 0 && form.urgency === 0
                  ? '点击设置'
                  : fmtPriority(form.importance, form.urgency)}
              </button>
            </div>
            <div className="form-item">
              <label>前置任务</label>
              <button
                className="btn-secondary"
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() => setShowPrereqs(true)}
              >
                {form.prerequisites.length === 0
                  ? '点击选择'
                  : `已关联 ${form.prerequisites.length} 个`}
              </button>
            </div>

            {/* 详情 - 跨三列 */}
            <div className="form-item form-item-full">
              <label>详情</label>
              <textarea
                value={form.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="在这里输入任务详情、备注、链接等..."
              />
            </div>
          </div>
        </div>

        {/* 底部：新建模式显示确认按钮 */}
        {isNew && (
          <div className="modal-footer">
            <button className="btn-primary" onClick={handleCreate}>确认创建</button>
          </div>
        )}
      </div>

      {/* 优先级矩阵弹窗 */}
      {showPriority && (
        <PriorityMatrixPicker
          importance={form.importance}
          urgency={form.urgency}
          onChange={handlePriorityChange}
          onClose={() => setShowPriority(false)}
        />
      )}

      {/* 前置任务弹窗 */}
      {showPrereqs && (
        <PrerequisitePicker
          projectId={projectId}
          currentTaskId={taskId}
          selected={form.prerequisites}
          onChange={handlePrereqsChange}
          onClose={() => setShowPrereqs(false)}
        />
      )}

      {/* 赏金选择器弹窗 */}
      {showBounty && (
        <BountyPicker
          value={parseFloat(form.bounty) || 0}
          onChange={handleBountySelect}
          onClose={() => setShowBounty(false)}
        />
      )}
    </div>
  );
});
