/**
 * App 根组件
 * ─────────
 * 职责：认证守卫 + useRealtimeSync 挂载 + 页面路由
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { useTheme, type ThemePreset } from '../hooks/useTheme';
import { supabase } from '../lib/supabaseClient';
import {
  fetchCheckinTemplates,
  fetchCheckinRecordsByDate,
  insertCheckinTemplate,
  upsertCheckinRecord,
  ensureSystemTodoProject,
} from '../lib/api';
import { ProjectList } from './ProjectList';
import { ProjectDetail } from './ProjectDetail';
import { ProjectEditModal } from './ProjectEditModal';
import { TaskEditModal } from './TaskEditModal';
import { TodoList } from './TodoList';
import type { CheckinTemplate, TodoItem, Project, TaskStatus } from '../types';
import { useProjectsStore } from '../store/useProjectsStore';
import { deriveTaskStatus } from '../types';
import { useTaskActions } from '../hooks/useActions';

function isTempProject(project: Project | null | undefined): boolean {
  if (!project) return false;
  return project.is_system || project.category === 'system' || project.name === '临时';
}

export default function App() {
  const { user, loading: authLoading, signIn, signUp, signOut } = useAuth();
  const { theme, themeOptions, setThemePreset } = useTheme();
  const isBotBindRoute = typeof window !== 'undefined' && window.location.pathname === '/bot-bind';

  // 挂载 Realtime 同步（用户变更时自动 cleanup + 重建）
  useRealtimeSync(user?.id);

  // 从 store 获取最基础的数据
  const { optimisticInsertProject } = useProjectsStore();
  const { setTaskStatus } = useTaskActions();
  const projectIds = useProjectsStore((s) => s.projectIds);
  const projects = useProjectsStore((s) => s.projects);
  const tasks = useProjectsStore((s) => s.tasks);
  const tasksByProject = useProjectsStore((s) => s.tasksByProject);

  // 用 useMemo 计算待办项，只在依赖变化时重新计算
  const todoItems: TodoItem[] = useMemo(() => {
    const items: TodoItem[] = [];
    const statusOrder: Record<TaskStatus, number> = {
      'in-progress': 0,
      ready: 1,
      backlog: 2,
      done: 3,
    };
    const projectOrder = new Map<number, number>(projectIds.map((id, index) => [id, index]));

    // 1. 添加项目中的 backlog / ready / in-progress 任务
    for (const projectId of projectIds) {
      const project = projects[projectId];
      if (!project) continue;
      if (project.is_frozen || project.is_archived) continue;
      const taskIdsArr = tasksByProject[projectId] ?? [];
      for (const taskId of taskIdsArr) {
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

    items.sort((a, b) => {
      const byStatus = statusOrder[a.status] - statusOrder[b.status];
      if (byStatus !== 0) return byStatus;

      const aProjectOrder = a.projectId !== undefined ? (projectOrder.get(a.projectId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      const bProjectOrder = b.projectId !== undefined ? (projectOrder.get(b.projectId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      if (aProjectOrder !== bProjectOrder) return aProjectOrder - bProjectOrder;

      return a.id - b.id;
    });

    return items;
  }, [projectIds, projects, tasks, tasksByProject]);

  // 当前查看的项目 ID
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);

  const handleSelectProject = useCallback((id: number) => {
    setActiveProjectId(id);
  }, []);

  const handleBack = useCallback(() => {
    setActiveProjectId(null);
  }, []);

  // 新建项目浮层
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isCheckinModalOpen, setIsCheckinModalOpen] = useState(false);
  const [isTodoProjectPickerOpen, setIsTodoProjectPickerOpen] = useState(false);
  const [todoCreateTarget, setTodoCreateTarget] = useState<number | 'temp' | null>(null);
  const [checkins, setCheckins] = useState<CheckinTemplate[]>([]);
  const [checkinRecords, setCheckinRecords] = useState<Record<number, string>>({});
  const [checkinLoading, setCheckinLoading] = useState(false);

  const todayKey = getLocalDateKey();

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    const currentUserId = userId as string;

    let cancelled = false;

    async function ensureTempProjectOnLogin() {
      try {
        const tempProject = await ensureSystemTodoProject(currentUserId);
        if (cancelled) return;
        const state = useProjectsStore.getState();
        if (!state.projects[tempProject.id]) {
          optimisticInsertProject(tempProject);
        }
      } catch (error) {
        console.error('初始化临时项目失败:', error);
      }
    }

    void ensureTempProjectOnLogin();
    return () => {
      cancelled = true;
    };
  }, [user?.id, optimisticInsertProject]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      setCheckins([]);
      setCheckinRecords({});
      return;
    }
    const currentUserId: string = userId;

    let mounted = true;
    async function loadCheckinData() {
      setCheckinLoading(true);
      try {
        const [templates, records] = await Promise.all([
          fetchCheckinTemplates(currentUserId),
          fetchCheckinRecordsByDate(currentUserId, todayKey),
        ]);

        if (!mounted) return;

        setCheckins(templates);
        const recordMap: Record<number, string> = {};
        for (const row of records) {
          recordMap[row.template_id] = row.checkin_date;
        }
        setCheckinRecords(recordMap);
      } catch (error) {
        console.error('加载打卡数据失败:', error);
      } finally {
        if (mounted) setCheckinLoading(false);
      }
    }

    loadCheckinData();
    return () => {
      mounted = false;
    };
  }, [user?.id, todayKey]);

  // 按任务流程创建待办：先本地选择项目，再进入任务表单
  const handleStartCreateTodoTask = useCallback(() => {
    if (!user?.id) {
      alert('请先登录');
      return;
    }
    setIsTodoProjectPickerOpen(true);
  }, [user?.id]);

  const handleChooseTodoProject = useCallback((projectId: number) => {
    setTodoCreateTarget(projectId);
    setIsTodoProjectPickerOpen(false);
  }, []);

  const handleChooseTempTodoProject = useCallback(() => {
    setTodoCreateTarget('temp');
    setIsTodoProjectPickerOpen(false);
  }, []);

  const handleCloseTodoProjectPicker = useCallback(() => {
    setIsTodoProjectPickerOpen(false);
  }, []);

  const handleCloseTodoTaskModal = useCallback(() => {
    setTodoCreateTarget(null);
  }, []);

  const resolveTempTodoProjectId = useCallback(async (): Promise<number> => {
    if (!user?.id) {
      throw new Error('请先登录');
    }

    const todoProject = await ensureSystemTodoProject(user.id);
    const state = useProjectsStore.getState();
    if (!state.projects[todoProject.id]) {
      optimisticInsertProject(todoProject);
    }
    return todoProject.id;
  }, [user?.id, optimisticInsertProject]);

  // 处理切换待办任务状态
  const handleChangeTodoStatus = useCallback(async (taskId: number, status: TaskStatus) => {
    try {
      await setTaskStatus(taskId, status);
    } catch (error) {
      console.error('更新待办状态失败:', error);
      alert('更新待办状态失败，请重试');
    }
  }, [setTaskStatus]);

  const handleOpenNewProject = useCallback(() => {
    setIsNewProjectOpen(true);
  }, []);

  const handleCloseNewProject = useCallback(() => {
    setIsNewProjectOpen(false);
  }, []);

  const handleOpenCheckin = useCallback(() => {
    setIsCheckinModalOpen(true);
  }, []);

  const handleCloseCheckin = useCallback(() => {
    setIsCheckinModalOpen(false);
  }, []);

  const todoProjectCandidates = projectIds
    .map((id) => projects[id])
    .filter((project): project is Project => project !== undefined);
  const visibleTodoProjects = todoProjectCandidates.filter((project) => !isTempProject(project) && !project.is_frozen && !project.is_archived);

  const handleCreateCheckin = useCallback(async (name: string) => {
    if (!user?.id) {
      alert('请先登录');
      return;
    }

    try {
      const row = await insertCheckinTemplate({
        user_id: user.id,
        name,
      });
      setCheckins((prev) => [row, ...prev]);
      setIsCheckinModalOpen(false);
    } catch (error) {
      console.error('创建打卡失败:', error);
      alert('创建打卡失败，请重试');
    }
  }, [user?.id]);

  const handleCheckinCardClick = useCallback(async (id: number) => {
    if (!user?.id) {
      alert('请先登录');
      return;
    }
    if (checkinRecords[id] === todayKey) {
      return;
    }

    try {
      await upsertCheckinRecord({
        user_id: user.id,
        template_id: id,
        checkin_date: todayKey,
      });
      setCheckinRecords((prev) => ({ ...prev, [id]: todayKey }));
    } catch (error) {
      console.error('打卡失败:', error);
      alert('打卡失败，请重试');
    }
  }, [checkinRecords, todayKey, user?.id]);

  // ──── 认证中 ────
  if (authLoading) {
    return (
      <>
        <header className="app-topbar">
          <h1>Artemis</h1>
          <ThemePicker theme={theme} onChangeTheme={setThemePreset} themeOptions={themeOptions} />
        </header>
        <div className="empty-message">正在检查登录状态...</div>
      </>
    );
  }

  if (isBotBindRoute) {
    return (
      <BotBindScreen
        user={user}
        onSignIn={signIn}
        onSignUp={signUp}
        theme={theme}
        onChangeTheme={setThemePreset}
        themeOptions={themeOptions}
      />
    );
  }

  // ──── 未登录 ────
  if (!user) {
    return <AuthScreen onSignIn={signIn} onSignUp={signUp} theme={theme} onChangeTheme={setThemePreset} themeOptions={themeOptions} />;
  }

  // ──── 已登录 ────
  return (
    <>
      <header className="app-topbar">
        <h1>Artemis</h1>
        <ThemePicker theme={theme} onChangeTheme={setThemePreset} themeOptions={themeOptions} />
      </header>

      {activeProjectId ? (
        <ProjectDetail projectId={activeProjectId} onBack={handleBack} />
      ) : (
        <>
          <CheckinSection
            templates={checkins}
            records={checkinRecords}
            todayKey={todayKey}
            onCheckin={handleCheckinCardClick}
            onCreateCheckin={handleOpenCheckin}
          />

          {checkinLoading && <div className="empty-message">正在加载打卡数据...</div>}

          <TodoList
            items={todoItems}
            onCreateTodoTask={handleStartCreateTodoTask}
            onChangeTodoStatus={handleChangeTodoStatus}
          />

          <section className="project-section">
            <ProjectList onSelectProject={handleSelectProject} />
            <div className="section-footer">
              <button className="btn-primary btn-create-action" onClick={handleOpenNewProject}>
                创建项目
              </button>
            </div>
          </section>

          {/* 新建项目浮层 */}
          {isNewProjectOpen && (
            <ProjectEditModal
              projectId={null}
              onClose={handleCloseNewProject}
            />
          )}

          {isCheckinModalOpen && (
            <CheckinCreateModal
              onClose={handleCloseCheckin}
              onConfirm={handleCreateCheckin}
            />
          )}

          {isTodoProjectPickerOpen && (
            <TodoProjectPickerModal
              projects={visibleTodoProjects}
              onClose={handleCloseTodoProjectPicker}
              onPick={handleChooseTodoProject}
              onPickTemp={handleChooseTempTodoProject}
            />
          )}

          {todoCreateTarget !== null && (
            <TaskEditModal
              taskId={null}
              projectId={typeof todoCreateTarget === 'number' ? todoCreateTarget : -1}
              onClose={handleCloseTodoTaskModal}
              defaultInProgress
              resolveProjectId={todoCreateTarget === 'temp' ? resolveTempTodoProjectId : undefined}
            />
          )}
        </>
      )}

      <div className="user-bar">
        <span>{user.email}</span>
        <button className="btn-logout" onClick={signOut}>
          退出登录
        </button>
      </div>
    </>
  );
}

interface CheckinSectionProps {
  templates: CheckinTemplate[];
  records: Record<number, string>;
  todayKey: string;
  onCheckin: (id: number) => void;
  onCreateCheckin: () => void;
}

function CheckinSection({ templates, records, todayKey, onCheckin, onCreateCheckin }: CheckinSectionProps) {

  return (
    <section className="checkin-section">
      <h2 className="checkin-title">每日打卡</h2>
      {templates.length === 0 ? (
        <div className="empty-message">暂无打卡项，请先创建一个打卡</div>
      ) : (
        <div className="checkin-grid">
          {templates.map((item) => {
            const doneToday = records[item.id] === todayKey;
            return (
              <button
                key={item.id}
                type="button"
                className={`checkin-card ${doneToday ? 'done' : ''}`}
                onClick={() => onCheckin(item.id)}
                disabled={doneToday}
              >
                <span className="checkin-card-tag">打卡</span>
                <span className="checkin-card-name">{item.name}</span>
                <span className="checkin-card-state">{doneToday ? '今日已完成' : '点击打卡'}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="section-footer">
        <button className="btn-primary btn-create-action" onClick={onCreateCheckin}>
          创建打卡
        </button>
      </div>
    </section>
  );
}

function getLocalDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface TodoProjectPickerModalProps {
  projects: Project[];
  onClose: () => void;
  onPick: (projectId: number) => void;
  onPickTemp: () => void;
}

function TodoProjectPickerModal({ projects, onClose, onPick, onPickTemp }: TodoProjectPickerModalProps) {
  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="modal-container checkin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header checkin-modal-header">
          <button className="btn-back" onClick={onClose}>返回</button>
        </div>
        <div className="modal-body checkin-modal-body">
          <h2 className="modal-title">选择待办所属项目</h2>
          <div className="form-item form-item-full">
            <label>先选一个项目，再填写任务内容</label>
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              <button className="btn-secondary" onClick={onPickTemp}>
                临时
              </button>
              {projects.map((project) => (
                <button
                  key={project.id}
                  className="btn-secondary"
                  onClick={() => onPick(project.id)}
                >
                  {project.name}
                </button>
              ))}
              {projects.length === 0 && (
                <div className="empty-message">当前没有可选项目</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CheckinCreateModalProps {
  onClose: () => void;
  onConfirm: (name: string) => void;
}

function CheckinCreateModal({ onClose, onConfirm }: CheckinCreateModalProps) {
  const [name, setName] = useState('');

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      alert('请输入打卡名称');
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="modal-container checkin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header checkin-modal-header">
          <button className="btn-back" onClick={onClose}>返回</button>
        </div>
        <div className="modal-body checkin-modal-body">
          <h2 className="modal-title">创建打卡</h2>
          <div className="form-item form-item-full">
            <label>打卡名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：早饭"
            />
          </div>
        </div>
        <div className="modal-footer checkin-modal-footer">
          <button className="btn-primary" onClick={handleConfirm}>确认</button>
        </div>
      </div>
    </div>
  );
}

interface BotBindScreenProps {
  user: { id: string; email?: string | null } | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  theme: ThemePreset;
  onChangeTheme: (theme: ThemePreset) => void;
  themeOptions: Array<{ value: ThemePreset; label: string }>;
}

function BotBindScreen({ user, onSignIn, onSignUp, theme, onChangeTheme, themeOptions }: BotBindScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isBinding, setIsBinding] = useState(false);

  const openId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('open_id')?.trim() || ''
    : '';

  const handleAuth = async (action: 'login' | 'register') => {
    setError('');
    setSuccess('');
    if (!email.trim()) { setError('请输入邮箱'); return; }
    if (!password) { setError('请输入密码'); return; }
    if (action === 'register' && password.length < 6) { setError('密码至少需要6位'); return; }

    try {
      if (action === 'login') {
        await onSignIn(email, password);
      } else {
        await onSignUp(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleBind = async () => {
    setError('');
    setSuccess('');
    if (!openId) {
      setError('缺少 open_id 参数，请从飞书机器人给你的链接进入。');
      return;
    }
    if (!user?.id) {
      setError('请先登录后再绑定。');
      return;
    }

    setIsBinding(true);
    try {
      const { error: bindError } = await supabase
        .from('bot_user_bindings')
        .upsert(
          {
            feishu_open_id: openId,
            supabase_user_id: user.id,
          },
          { onConflict: 'feishu_open_id' },
        );

      if (bindError) {
        throw bindError;
      }

      setSuccess('绑定成功。请回到飞书回复“是”继续创建任务。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '绑定失败');
    } finally {
      setIsBinding(false);
    }
  };

  return (
    <>
      <header className="app-topbar">
        <h1>Artemis</h1>
        <ThemePicker theme={theme} onChangeTheme={onChangeTheme} themeOptions={themeOptions} />
      </header>

      <div className="auth-container" style={{ display: 'flex' }}>
        <div className="auth-box">
          <h1 className="auth-title">绑定飞书账号</h1>
          <p className="auth-subtitle">open_id: {openId || '未提供'}</p>

          {!user ? (
            <div className="auth-form">
              <div className="form-item">
                <label>邮箱</label>
                <input
                  type="email"
                  className="auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="请输入邮箱"
                />
              </div>
              <div className="form-item">
                <label>密码</label>
                <input
                  type="password"
                  className="auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                />
              </div>
              <div className="auth-buttons">
                <button className="btn-primary" onClick={() => handleAuth('login')}>登录</button>
                <button className="btn-secondary" onClick={() => handleAuth('register')}>注册</button>
              </div>
            </div>
          ) : (
            <div className="auth-form">
              <p>当前登录账号：{user.email || '未知邮箱'}</p>
              <button className="btn-primary" onClick={handleBind} disabled={isBinding}>
                {isBinding ? '绑定中...' : '确认绑定到当前账号'}
              </button>
            </div>
          )}

          {success && <p className="auth-subtitle">{success}</p>}
          {error && <p className="auth-error">{error}</p>}
        </div>
      </div>
    </>
  );
}

// ============================================================
// AuthScreen —— 登录/注册
// ============================================================

interface AuthScreenProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  theme: ThemePreset;
  onChangeTheme: (theme: ThemePreset) => void;
  themeOptions: Array<{ value: ThemePreset; label: string }>;
}

function AuthScreen({ onSignIn, onSignUp, theme, onChangeTheme, themeOptions }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handle = async (action: 'login' | 'register') => {
    setError('');
    if (!email.trim()) { setError('请输入邮箱'); return; }
    if (!password) { setError('请输入密码'); return; }
    if (action === 'register' && password.length < 6) { setError('密码至少需要6位'); return; }
    try {
      if (action === 'login') {
        await onSignIn(email, password);
      } else {
        await onSignUp(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  return (
    <>
      <header className="app-topbar">
        <h1>Artemis</h1>
        <ThemePicker theme={theme} onChangeTheme={onChangeTheme} themeOptions={themeOptions} />
      </header>
      <div className="auth-container" style={{ display: 'flex' }}>
        <div className="auth-box">
          <h1 className="auth-title">Artemis</h1>
          <p className="auth-subtitle">极简项目管理系统</p>
          <div className="auth-form">
            <div className="form-item">
              <label>邮箱</label>
              <input
                type="email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="请输入邮箱"
              />
            </div>
            <div className="form-item">
              <label>密码</label>
              <input
                type="password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码（至少6位）"
              />
            </div>
            <div className="auth-buttons">
              <button className="btn-primary" onClick={() => handle('login')}>
                登录
              </button>
              <button className="btn-secondary" onClick={() => handle('register')}>
                注册
              </button>
            </div>
            {error && <p className="auth-error">{error}</p>}
          </div>
        </div>
      </div>
    </>
  );
}

interface ThemePickerProps {
  theme: ThemePreset;
  onChangeTheme: (theme: ThemePreset) => void;
  themeOptions: Array<{ value: ThemePreset; label: string }>;
}

function ThemePicker({ theme, onChangeTheme, themeOptions }: ThemePickerProps) {
  return (
    <select
      className="theme-toggle theme-toggle-select"
      value={theme}
      onChange={(e) => onChangeTheme(e.target.value as ThemePreset)}
      aria-label="选择主题"
    >
      {themeOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
