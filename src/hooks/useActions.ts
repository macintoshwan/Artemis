/**
 * 业务操作 hooks —— 封装乐观更新 + API 调用 + 回滚
 */

import { useCallback } from 'react';
import { useProjectsStore } from '../store/useProjectsStore';
import * as api from '../lib/api';
import type { Project, Task } from '../types';

// ============================================================
// useProjectActions
// ============================================================

export function useProjectActions() {
  const store = useProjectsStore;

  const createProject = useCallback(async (project: Omit<Project, 'created_at'>) => {
    // 乐观插入（使用临时 created_at）
    const optimistic: Project = { ...project, created_at: new Date().toISOString() };
    store.getState().optimisticInsertProject(optimistic);

    try {
      // 服务端创建 → Realtime 会推送 INSERT 覆盖乐观数据
      await api.insertProject(project);
    } catch (err) {
      // 回滚：移除乐观插入
      store.getState().optimisticDeleteProject(project.id);
      throw err;
    }
  }, []);

  const updateProject = useCallback(async (id: number, patch: Partial<Project>) => {
    const prev = store.getState().optimisticUpdateProject(id, patch);
    try {
      await api.updateProject(id, patch);
    } catch (err) {
      if (prev) store.getState().rollbackProject(prev);
      throw err;
    }
  }, []);

  const removeProject = useCallback(async (id: number) => {
    const snapshot = store.getState().optimisticDeleteProject(id);
    try {
      await api.deleteProject(id);
    } catch (err) {
      if (snapshot) store.getState().restoreDeletedProject(snapshot.project, snapshot.tasks);
      throw err;
    }
  }, []);

  return { createProject, updateProject, removeProject };
}

// ============================================================
// useTaskActions
// ============================================================

export function useTaskActions() {
  const store = useProjectsStore;

  const createTask = useCallback(async (task: Omit<Task, 'created_at'>) => {
    const optimistic: Task = { ...task, created_at: new Date().toISOString() };
    store.getState().optimisticInsertTask(optimistic);

    try {
      await api.insertTask(task);
    } catch (err) {
      store.getState().optimisticDeleteTask(task.id);
      throw err;
    }
  }, []);

  const updateTask = useCallback(async (id: number, patch: Partial<Task>) => {
    const prev = store.getState().optimisticUpdateTask(id, patch);
    try {
      await api.updateTask(id, patch);
    } catch (err) {
      if (prev) store.getState().rollbackTask(prev);
      throw err;
    }
  }, []);

  const removeTask = useCallback(async (id: number) => {
    const snapshot = store.getState().optimisticDeleteTask(id);
    try {
      await api.deleteTask(id);
    } catch (err) {
      if (snapshot) store.getState().restoreDeletedTask(snapshot);
      throw err;
    }
  }, []);

  /** 快捷：设置任务状态（backlog/ready/in-progress/done） */
  const setTaskStatus = useCallback(
    async (taskId: number, status: 'backlog' | 'ready' | 'in-progress' | 'done') => {
      const now = new Date().toISOString();
      let patch: Partial<Task> = {};

      switch (status) {
        case 'backlog':
          patch = {
            plan_start_date: null,
            actual_start_date: null,
            actual_end_date: null,
            actual_duration: null,
            completed: false,
          };
          break;
        case 'ready':
          patch = {
            plan_start_date: now,
            actual_start_date: null,
            actual_end_date: null,
            actual_duration: null,
            completed: false,
          };
          break;
        case 'in-progress':
          patch = {
            actual_start_date: now,
            actual_end_date: null,
            actual_duration: null,
            completed: false,
          };
          break;
        case 'done': {
          const task = store.getState().tasks[taskId];
          const startTime = task?.actual_start_date ? new Date(task.actual_start_date) : new Date(now);
          const duration = Math.round(((Date.now() - startTime.getTime()) / 3_600_000) * 100) / 100;
          patch = {
            actual_end_date: now,
            actual_duration: duration,
            completed: true,
            ...(!task?.actual_start_date ? { actual_start_date: now } : {}),
          };
          break;
        }
      }

      await updateTask(taskId, patch);
    },
    [],
  );

  return { createTask, updateTask, removeTask, setTaskStatus };
}
