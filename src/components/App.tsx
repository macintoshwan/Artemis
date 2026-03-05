/**
 * App 根组件
 * ─────────
 * 职责：认证守卫 + useRealtimeSync 挂载 + 页面路由
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { ProjectList } from './ProjectList';
import { ProjectDetail } from './ProjectDetail';
import { ProjectEditModal } from './ProjectEditModal';

export default function App() {
  const { user, loading: authLoading, signIn, signUp, signOut } = useAuth();

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
    return <div className="empty-message">正在检查登录状态...</div>;
  }

  // ──── 未登录 ────
  if (!user) {
    return <AuthScreen onSignIn={signIn} onSignUp={signUp} />;
  }

  // ──── 已登录 ────
  return (
    <>
      <h1>Artemis</h1>

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

// ============================================================
// AuthScreen —— 登录/注册
// ============================================================

interface AuthScreenProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
}

function AuthScreen({ onSignIn, onSignUp }: AuthScreenProps) {
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
  );
}
