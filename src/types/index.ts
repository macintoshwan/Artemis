// ============================================================
// 数据库实体类型 —— 严格对齐 Supabase schema
// ============================================================

/** projects 表行类型 */
export interface Project {
  id: number; // bigint → JS number（安全范围内）
  name: string;
  plan_start_date: string | null; // timestamptz ISO string
  plan_end_date: string | null;
  plan_duration: number | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  actual_duration: number | null;
  priority: string | null;
  category: string | null;
  bounty: number | null;
  created_at: string;
  user_id: string; // uuid
}

/** tasks 表行类型 */
export interface Task {
  id: number;
  project_id: number;
  name: string;
  plan_start_date: string | null;
  plan_end_date: string | null;
  plan_duration: number | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  actual_duration: number | null;
  category: string | null;
  bounty: number | null;
  completed: boolean;
  created_at: string;
  prerequisites: number[] | null; // jsonb → number[]
  priority: TaskPriority | null; // jsonb → structured
  user_id: string;
  description: string | null;
}

/** priority 字段 JSONB 结构 */
export interface TaskPriority {
  importance: number; // 0-100
  urgency: number; // 0-100
}

// ============================================================
// 带 tasks 的项目（JOIN 查询结果）
// ============================================================

export interface ProjectWithTasks extends Project {
  tasks: Task[];
}

// ============================================================
// Normalized Store 类型
// ============================================================

export interface NormalizedState {
  /** project id → Project */
  projects: Record<number, Project>;
  /** task id → Task */
  tasks: Record<number, Task>;
  /** project id → task id[] (有序) */
  tasksByProject: Record<number, number[]>;
  /** 所有 project id (有序，按 created_at DESC) */
  projectIds: number[];
  /** 数据是否已完成首次加载 */
  initialized: boolean;
  /** 加载中 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
}

// ============================================================
// Realtime payload 类型
// ============================================================

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RealtimePayload<T> {
  eventType: RealtimeEventType;
  new: T;
  old: { id: number } & Partial<T>;
}

// ============================================================
// 任务状态枚举（业务逻辑层）
// ============================================================

export type TaskStatus = 'backlog' | 'ready' | 'in-progress' | 'done';

/** 根据 task 字段推导出状态 */
export function deriveTaskStatus(task: Task): TaskStatus {
  if (task.actual_end_date) return 'done';
  if (task.actual_start_date) return 'in-progress';
  if (task.plan_start_date) return 'ready';
  return 'backlog';
}
