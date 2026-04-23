/**
 * Supabase 数据层
 * ──────────────────────────────────────────
 * 封装所有 DB 读写与 Realtime 订阅，对上层暴露类型安全 API。
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { Project, Task, ProjectWithTasks, RealtimePayload, CheckinTemplate, CheckinRecord, Todo } from '../types';

export interface AiTaskDescriptionSuggestion {
  description: string;
}

interface SuggestTaskDescriptionInput {
  taskTitle: string;
  projectContext?: string;
  draftDescription?: string;
}

export async function suggestTaskDescriptionByTitle({
  taskTitle,
  projectContext,
  draftDescription,
}: SuggestTaskDescriptionInput): Promise<AiTaskDescriptionSuggestion> {
  const trimmedTitle = taskTitle.trim();
  if (!trimmedTitle) {
    throw new Error('任务标题不能为空');
  }

  const trimmedContext = projectContext?.trim();
  const trimmedDraft = draftDescription?.trim();

  const { data, error } = await supabase.functions.invoke('ai-task-suggest', {
    body: {
      taskTitle: trimmedTitle,
      projectContext: trimmedContext ? trimmedContext.slice(0, 240) : undefined,
      draftDescription: trimmedDraft ? trimmedDraft.slice(0, 300) : undefined,
    },
  });

  if (error) {
    throw new Error(`ai-task-suggest: ${error.message}`);
  }

  const description = typeof data?.description === 'string' ? data.description.trim() : '';
  if (!description) {
    throw new Error('AI 未返回有效描述');
  }

  return { description };
}

// ============================================================
// 批量拉取
// ============================================================

/**
 * 一次性拉取当前用户的所有 projects + tasks。
 * 利用 Supabase 的关系查询在一次 HTTP 请求内完成 JOIN。
 */
export async function fetchAllUserData(userId: string): Promise<ProjectWithTasks[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*, tasks(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`fetchAllUserData: ${error.message}`);
  return (data ?? []) as ProjectWithTasks[];
}

export async function ensureSystemTodoProject(userId: string): Promise<Project> {
  const { data: existing, error: fetchError } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .eq('is_system', true)
    .maybeSingle();

  if (fetchError) {
    const missingSystemColumn =
      fetchError.message.includes('projects.is_system') ||
      (fetchError.message.includes('column') && fetchError.message.includes('is_system'));

    if (missingSystemColumn) {
      const { data: legacyExisting, error: legacyFetchError } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .eq('category', 'system')
        .eq('name', '临时')
        .maybeSingle();

      if (legacyFetchError) {
        throw new Error(`ensureSystemTodoProject legacy fetch: ${legacyFetchError.message}`);
      }

      if (legacyExisting) {
        return { ...(legacyExisting as Project), is_system: true, is_frozen: false, is_archived: false };
      }

      const { data: legacyInserted, error: legacyInsertError } = await supabase
        .from('projects')
        .insert({
          id: Date.now(),
          user_id: userId,
          name: '临时',
          plan_start_date: null,
          plan_end_date: null,
          plan_duration: null,
          actual_start_date: null,
          actual_end_date: null,
          actual_duration: null,
          priority: null,
          category: 'system',
          bounty: null,
        })
        .select()
        .single();

      if (legacyInsertError) {
        throw new Error(`ensureSystemTodoProject legacy insert: ${legacyInsertError.message}`);
      }

      return { ...(legacyInserted as Project), is_system: true, is_frozen: false, is_archived: false };
    }

    throw new Error(`ensureSystemTodoProject fetch: ${fetchError.message}`);
  }

  if (existing) {
    if (existing.name !== '临时') {
      const { data: renamed, error: renameError } = await supabase
        .from('projects')
        .update({ name: '临时' })
        .eq('id', existing.id)
        .select()
        .single();

      if (renameError) {
        throw new Error(`ensureSystemTodoProject rename: ${renameError.message}`);
      }

      return renamed as Project;
    }

    return existing as Project;
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      id: Date.now(),
      user_id: userId,
      name: '临时',
      plan_start_date: null,
      plan_end_date: null,
      plan_duration: null,
      actual_start_date: null,
      actual_end_date: null,
      actual_duration: null,
      priority: null,
      category: 'system',
      bounty: null,
      is_system: true,
      is_frozen: false,
      is_archived: false,
    })
    .select()
    .single();

  if (error) throw new Error(`ensureSystemTodoProject insert: ${error.message}`);
  return data as Project;
}

// ============================================================
// 单表 CRUD
// ============================================================

export async function insertProject(project: Omit<Project, 'created_at'>): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .insert(project)
    .select()
    .single();
  if (error) throw new Error(`insertProject: ${error.message}`);
  return data as Project;
}

export async function updateProject(id: number, patch: Partial<Project>): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`updateProject: ${error.message}`);
  return data as Project;
}

export async function deleteProject(id: number): Promise<void> {
  // 先删 tasks（外键约束）
  const { error: taskErr } = await supabase.from('tasks').delete().eq('project_id', id);
  if (taskErr) throw new Error(`deleteProject tasks: ${taskErr.message}`);

  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new Error(`deleteProject: ${error.message}`);
}

export async function insertTask(task: Omit<Task, 'created_at'>): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select()
    .single();
  if (error) throw new Error(`insertTask: ${error.message}`);
  return data as Task;
}

export async function updateTask(id: number, patch: Partial<Task>): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`updateTask: ${error.message}`);
  return data as Task;
}

export async function deleteTask(id: number): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw new Error(`deleteTask: ${error.message}`);
}

// ============================================================
// Daily Check-in CRUD
// ============================================================

export async function fetchCheckinTemplates(userId: string): Promise<CheckinTemplate[]> {
  const { data, error } = await supabase
    .from('checkin_templates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`fetchCheckinTemplates: ${error.message}`);
  return (data ?? []) as CheckinTemplate[];
}

export async function fetchCheckinRecordsByDate(userId: string, dateKey: string): Promise<CheckinRecord[]> {
  const { data, error } = await supabase
    .from('checkin_records')
    .select('*')
    .eq('user_id', userId)
    .eq('checkin_date', dateKey);

  if (error) throw new Error(`fetchCheckinRecordsByDate: ${error.message}`);
  return (data ?? []) as CheckinRecord[];
}

export async function insertCheckinTemplate(input: { user_id: string; name: string }): Promise<CheckinTemplate> {
  const { data, error } = await supabase
    .from('checkin_templates')
    .insert({
      user_id: input.user_id,
      name: input.name,
    })
    .select('*')
    .single();

  if (error) throw new Error(`insertCheckinTemplate: ${error.message}`);
  return data as CheckinTemplate;
}

export async function upsertCheckinRecord(input: {
  user_id: string;
  template_id: number;
  checkin_date: string;
}): Promise<CheckinRecord> {
  const { data, error } = await supabase
    .from('checkin_records')
    .upsert(
      {
        user_id: input.user_id,
        template_id: input.template_id,
        checkin_date: input.checkin_date,
      },
      { onConflict: 'template_id,checkin_date' },
    )
    .select('*')
    .single();

  if (error) throw new Error(`upsertCheckinRecord: ${error.message}`);
  return data as CheckinRecord;
}

// ============================================================
// Realtime 订阅
// ============================================================

export interface RealtimeCallbacks {
  onProjectChange: (payload: RealtimePayload<Project>) => void;
  onTaskChange: (payload: RealtimePayload<Task>) => void;
}

/**
 * 订阅 projects / tasks 两张表的 Realtime 事件。
 * 返回 cleanup 函数用于组件卸载时取消订阅。
 *
 * 断线重连策略：Supabase JS v2 内置了自动重连；
 * 额外通过 status 回调在 CHANNEL_ERROR / TIMED_OUT 时手动重订阅。
 */
export function subscribeRealtime(callbacks: RealtimeCallbacks): () => void {
  let channel: RealtimeChannel | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function subscribe() {
    channel = supabase
      .channel('artemis-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        (payload) => {
          callbacks.onProjectChange({
            eventType: payload.eventType as RealtimePayload<Project>['eventType'],
            new: payload.new as Project,
            old: payload.old as { id: number } & Partial<Project>,
          });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          callbacks.onTaskChange({
            eventType: payload.eventType as RealtimePayload<Task>['eventType'],
            new: payload.new as Task,
            old: payload.old as { id: number } & Partial<Task>,
          });
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[Realtime] ${status}, retrying in 5s...`);
          cleanup();
          retryTimer = setTimeout(subscribe, 5000);
        }
      });
  }

  function cleanup() {
    if (retryTimer) clearTimeout(retryTimer);
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  }

  subscribe();

  return cleanup;
}

// ============================================================
// Todo CRUD
// ============================================================

export async function fetchTodos(userId: string): Promise<Todo[]> {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`fetchTodos: ${error.message}`);
  return (data ?? []) as Todo[];
}

export async function insertTodo(todo: Omit<Todo, 'created_at' | 'id'>): Promise<Todo> {
  const { data, error } = await supabase
    .from('todos')
    .insert(todo)
    .select()
    .single();
  if (error) throw new Error(`insertTodo: ${error.message}`);
  return data as Todo;
}

export async function updateTodo(id: number, patch: Partial<Todo>): Promise<Todo> {
  const { data, error } = await supabase
    .from('todos')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`updateTodo: ${error.message}`);
  return data as Todo;
}

export async function deleteTodo(id: number): Promise<void> {
  const { error } = await supabase.from('todos').delete().eq('id', id);
  if (error) throw new Error(`deleteTodo: ${error.message}`);
}
