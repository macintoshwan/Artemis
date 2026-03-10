/**
 * App 根组件
 * ─────────
 * 职责：认证守卫 + useRealtimeSync 挂载 + 页面路由
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { useTheme, type ThemePreset } from '../hooks/useTheme';
import { supabase } from '../lib/supabaseClient';
import { ProjectList } from './ProjectList';
import { ProjectDetail } from './ProjectDetail';
import { ProjectEditModal } from './ProjectEditModal';

export default function App() {
  const { user, loading: authLoading, signIn, signUp, signOut } = useAuth();
  const { theme, themeOptions, setThemePreset } = useTheme();
  const isBotBindRoute = typeof window !== 'undefined' && window.location.pathname === '/bot-bind';

  // 挂载 Realtime 同步（用户变更时自动 cleanup + 重建）
  useRealtimeSync(user?.id);

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

  const handleOpenNewProject = useCallback(() => {
    setIsNewProjectOpen(true);
  }, []);

  const handleCloseNewProject = useCallback(() => {
    setIsNewProjectOpen(false);
  }, []);

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
          <ProjectList onSelectProject={handleSelectProject} />
          <div className="create-project-section">
            <button className="btn-primary btn-create-project" onClick={handleOpenNewProject}>新建项目</button>
          </div>

          {/* 新建项目浮层 */}
          {isNewProjectOpen && (
            <ProjectEditModal
              projectId={null}
              onClose={handleCloseNewProject}
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
