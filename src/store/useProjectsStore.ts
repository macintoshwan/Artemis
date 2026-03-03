/**
 * Zustand Normalized Store
 * ──────────────────────────────────────────────────────────
 *
 * ## 设计决策
 *
 * 1. **Zustand 而非 React Query**
 *    Supabase Realtime 推送的变更需要直接修改本地缓存，与 React Query
 *    的 "server state" 心智模型冲突。Zustand 更适合这种"同步本地 store
 *    + 实时 patch"场景，无需绕开 QueryClient.setQueryData 的 immutable
 *    限制。
 *
 * 2. **Normalized Store**
 *    - projects / tasks 分别存入 Record<id, entity>，O(1) 查找。
 *    - tasksByProject 维护 project → taskId[] 映射。
 *    - projectIds 保持有序引用列表。
 *    这使得单个 task UPDATE 只影响 `tasks[id]`，不触碰 projects 引用，
 *    从而实现**最小粒度 React re-render**。
 *
 * 3. **Selector 精细订阅**
 *    组件通过 selector 只订阅需要的数据切片（如某个 project、某个
 *    project 下的 task ids）。Zustand 默认使用 Object.is 比较，可直接
 *    利用 `shallow` 做浅比较来避免引用变动引起的无效渲染。
 *
 * 4. **并发写入安全**
 *    所有写操作通过 Supabase RPC → 服务端为 single source of truth。
 *    Realtime 回调统一走 `applyProject/TaskChange`，使用 immer-free
 *    immutable 更新（Zustand set 自带）。同一时刻多个 Realtime 事件按
 *    到达顺序串行 patch。
 *
 * 5. **乐观更新 (Optimistic Update)**
 *    写操作先更新本地 store，再发起 API 请求。失败时回滚。
 *    这为用户提供零延迟的交互体验。
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { NormalizedState, Project, Task, RealtimePayload, ProjectWithTasks } from '../types';

// ============================================================
// Store 类型
// ============================================================

interface ProjectsActions {
  // ---- 初始化 ----
  hydrate: (data: ProjectWithTasks[]) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;

  // ---- Realtime patch ----
  applyProjectChange: (payload: RealtimePayload<Project>) => void;
  applyTaskChange: (payload: RealtimePayload<Task>) => void;

  // ---- 乐观写入 ----
  optimisticUpdateProject: (id: number, patch: Partial<Project>) => Project | undefined;
  optimisticUpdateTask: (id: number, patch: Partial<Task>) => Task | undefined;
  optimisticInsertProject: (project: Project) => void;
  optimisticInsertTask: (task: Task) => void;
  optimisticDeleteProject: (id: number) => { project: Project; tasks: Task[] } | undefined;
  optimisticDeleteTask: (id: number) => Task | undefined;

  // ---- 回滚 ----
  rollbackProject: (project: Project) => void;
  rollbackTask: (task: Task) => void;
  restoreDeletedProject: (project: Project, tasks: Task[]) => void;
  restoreDeletedTask: (task: Task) => void;

  // ---- 工具 ----
  reset: () => void;
}

export type ProjectsStore = NormalizedState & ProjectsActions;

// ============================================================
// 初始状态
// ============================================================

const INITIAL_STATE: NormalizedState = {
  projects: {},
  tasks: {},
  tasksByProject: {},
  projectIds: [],
  initialized: false,
  loading: false,
  error: null,
};

// ============================================================
// Store 实现
// ============================================================

export const useProjectsStore = create<ProjectsStore>()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL_STATE,

    // ─────────────────── 初始化 ───────────────────

    hydrate(data: ProjectWithTasks[]) {
      const projects: Record<number, Project> = {};
      const tasks: Record<number, Task> = {};
      const tasksByProject: Record<number, number[]> = {};
      const projectIds: number[] = [];

      for (const pw of data) {
        const { tasks: taskList, ...proj } = pw;
        projects[proj.id] = proj;
        projectIds.push(proj.id);

        const ids: number[] = [];
        for (const t of taskList ?? []) {
          tasks[t.id] = t;
          ids.push(t.id);
        }
        tasksByProject[proj.id] = ids;
      }

      set({ projects, tasks, tasksByProject, projectIds, initialized: true, loading: false, error: null });
    },

    setLoading(v) {
      set({ loading: v });
    },

    setError(e) {
      set({ error: e, loading: false });
    },

    // ─────────────────── Realtime Patch ───────────────────

    applyProjectChange(payload: RealtimePayload<Project>) {
      const state = get();
      const { eventType } = payload;

      if (eventType === 'INSERT') {
        const p = payload.new;
        // 如果已存在（乐观写入过），覆盖服务端版本
        set({
          projects: { ...state.projects, [p.id]: p },
          projectIds: state.projectIds.includes(p.id)
            ? state.projectIds
            : [p.id, ...state.projectIds],
          tasksByProject: {
            ...state.tasksByProject,
            [p.id]: state.tasksByProject[p.id] ?? [],
          },
        });
      } else if (eventType === 'UPDATE') {
        const p = payload.new;
        if (!state.projects[p.id]) return; // 不属于当前用户
        set({ projects: { ...state.projects, [p.id]: p } });
      } else if (eventType === 'DELETE') {
        const id = payload.old.id;
        const { [id]: _, ...restProjects } = state.projects;
        const { [id]: __, ...restTbp } = state.tasksByProject;

        // 移除关联 tasks
        const removedTaskIds = state.tasksByProject[id] ?? [];
        const nextTasks = { ...state.tasks };
        for (const tid of removedTaskIds) delete nextTasks[tid];

        set({
          projects: restProjects,
          tasks: nextTasks,
          tasksByProject: restTbp,
          projectIds: state.projectIds.filter((pid) => pid !== id),
        });
      }
    },

    applyTaskChange(payload: RealtimePayload<Task>) {
      const state = get();
      const { eventType } = payload;

      if (eventType === 'INSERT') {
        const t = payload.new;
        const pid = t.project_id;

        const existingIds = state.tasksByProject[pid] ?? [];
        set({
          tasks: { ...state.tasks, [t.id]: t },
          tasksByProject: {
            ...state.tasksByProject,
            [pid]: existingIds.includes(t.id) ? existingIds : [...existingIds, t.id],
          },
        });
      } else if (eventType === 'UPDATE') {
        const t = payload.new;
        if (!state.tasks[t.id]) return;
        set({ tasks: { ...state.tasks, [t.id]: t } });
      } else if (eventType === 'DELETE') {
        const id = payload.old.id;
        const old = state.tasks[id];
        if (!old) return;

        const { [id]: _, ...restTasks } = state.tasks;
        const pid = old.project_id;
        set({
          tasks: restTasks,
          tasksByProject: {
            ...state.tasksByProject,
            [pid]: (state.tasksByProject[pid] ?? []).filter((tid) => tid !== id),
          },
        });
      }
    },

    // ─────────────────── 乐观写入 ───────────────────

    optimisticInsertProject(project: Project) {
      const state = get();
      set({
        projects: { ...state.projects, [project.id]: project },
        projectIds: [project.id, ...state.projectIds],
        tasksByProject: { ...state.tasksByProject, [project.id]: [] },
      });
    },

    optimisticUpdateProject(id, patch) {
      const state = get();
      const prev = state.projects[id];
      if (!prev) return undefined;
      set({ projects: { ...state.projects, [id]: { ...prev, ...patch } } });
      return prev; // 返回旧值用于回滚
    },

    optimisticDeleteProject(id) {
      const state = get();
      const project = state.projects[id];
      if (!project) return undefined;

      const taskIds = state.tasksByProject[id] ?? [];
      const removedTasks = taskIds.map((tid) => state.tasks[tid]).filter((t): t is Task => t != null);

      const { [id]: _, ...restProjects } = state.projects;
      const { [id]: __, ...restTbp } = state.tasksByProject;
      const nextTasks = { ...state.tasks };
      for (const tid of taskIds) delete nextTasks[tid];

      set({
        projects: restProjects,
        tasks: nextTasks,
        tasksByProject: restTbp,
        projectIds: state.projectIds.filter((pid) => pid !== id),
      });

      return { project, tasks: removedTasks };
    },

    optimisticInsertTask(task: Task) {
      const state = get();
      const pid = task.project_id;
      set({
        tasks: { ...state.tasks, [task.id]: task },
        tasksByProject: {
          ...state.tasksByProject,
          [pid]: [...(state.tasksByProject[pid] ?? []), task.id],
        },
      });
    },

    optimisticUpdateTask(id, patch) {
      const state = get();
      const prev = state.tasks[id];
      if (!prev) return undefined;
      set({ tasks: { ...state.tasks, [id]: { ...prev, ...patch } } });
      return prev;
    },

    optimisticDeleteTask(id) {
      const state = get();
      const task = state.tasks[id];
      if (!task) return undefined;

      const { [id]: _, ...restTasks } = state.tasks;
      const pid = task.project_id;
      set({
        tasks: restTasks,
        tasksByProject: {
          ...state.tasksByProject,
          [pid]: (state.tasksByProject[pid] ?? []).filter((tid) => tid !== id),
        },
      });

      return task;
    },

    // ─────────────────── 回滚 ───────────────────

    rollbackProject(project: Project) {
      const state = get();
      set({ projects: { ...state.projects, [project.id]: project } });
    },

    rollbackTask(task: Task) {
      const state = get();
      set({ tasks: { ...state.tasks, [task.id]: task } });
    },

    restoreDeletedProject(project: Project, tasks: Task[]) {
      const state = get();
      const nextTasks = { ...state.tasks };
      const taskIds: number[] = [];
      for (const t of tasks) {
        nextTasks[t.id] = t;
        taskIds.push(t.id);
      }
      set({
        projects: { ...state.projects, [project.id]: project },
        tasks: nextTasks,
        tasksByProject: { ...state.tasksByProject, [project.id]: taskIds },
        projectIds: [project.id, ...state.projectIds],
      });
    },

    restoreDeletedTask(task: Task) {
      const state = get();
      set({
        tasks: { ...state.tasks, [task.id]: task },
        tasksByProject: {
          ...state.tasksByProject,
          [task.project_id]: [...(state.tasksByProject[task.project_id] ?? []), task.id],
        },
      });
    },

    // ─────────────────── 工具 ───────────────────

    reset() {
      set(INITIAL_STATE);
    },
  })),
);

// ============================================================
// 便捷 Selectors
// ============================================================

/** 获取单个 project（稳定引用，id 不变则引用不变） */
export const selectProject = (id: number) => (state: ProjectsStore) => state.projects[id];

/** 获取单个 task */
export const selectTask = (id: number) => (state: ProjectsStore) => state.tasks[id];

/** 获取 project 下所有 task ids */
export const selectTaskIdsByProject = (projectId: number) => (state: ProjectsStore) =>
  state.tasksByProject[projectId] ?? [];

/** 获取有序 project id 列表 */
export const selectProjectIds = (state: ProjectsStore) => state.projectIds;

/** 获取 project 下的所有 tasks 实体列表 */
export const selectTasksByProject = (projectId: number) => (state: ProjectsStore) => {
  const ids = state.tasksByProject[projectId] ?? [];
  return ids.map((id) => state.tasks[id]).filter((t): t is Task => t != null);
};

/** 加载/初始化状态 */
export const selectMeta = (state: ProjectsStore) => ({
  initialized: state.initialized,
  loading: state.loading,
  error: state.error,
});
