/**
 * useRealtimeSync
 * ──────────────────────────────────────────
 * 负责：
 * 1. 首次加载 → fetchAllUserData → hydrate store
 * 2. 建立 Realtime 订阅 → patch store
 * 3. 组件卸载 / 用户变更 → 清理资源
 *
 * 调用位置：App 根组件，用户登录后仅挂载一次。
 */

import { useEffect, useRef } from 'react';
import { fetchAllUserData, subscribeRealtime } from '../lib/api';
import { useProjectsStore } from '../store/useProjectsStore';
import type { Project, Task, RealtimePayload } from '../types';

export function useRealtimeSync(userId: string | undefined) {
  const hydrateRef = useRef(false);

  const hydrate = useProjectsStore((s) => s.hydrate);
  const setLoading = useProjectsStore((s) => s.setLoading);
  const setError = useProjectsStore((s) => s.setError);
  const applyProjectChange = useProjectsStore((s) => s.applyProjectChange);
  const applyTaskChange = useProjectsStore((s) => s.applyTaskChange);
  const reset = useProjectsStore((s) => s.reset);

  useEffect(() => {
    if (!userId) {
      reset();
      hydrateRef.current = false;
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    async function init() {
      setLoading(true);

      try {
        const data = await fetchAllUserData(userId!);
        if (cancelled) return;

        hydrate(data);
        hydrateRef.current = true;

        // 数据加载完成后再建立 Realtime，避免丢失初始化过程中的事件
        // Supabase Realtime 不支持按 user_id 过滤，需在回调中手动过滤
        unsubscribe = subscribeRealtime({
          onProjectChange(payload: RealtimePayload<Project>) {
            // 安全检查：只处理当前用户的项目
            const ownerId =
              payload.eventType === 'DELETE'
                ? payload.old?.user_id
                : (payload.new as Project)?.user_id;
            if (ownerId && ownerId !== userId) return;

            applyProjectChange(payload);
          },
          onTaskChange(payload: RealtimePayload<Task>) {
            const ownerId =
              payload.eventType === 'DELETE'
                ? payload.old?.user_id
                : (payload.new as Task)?.user_id;
            if (ownerId && ownerId !== userId) return;

            applyTaskChange(payload);
          },
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [userId, hydrate, setLoading, setError, applyProjectChange, applyTaskChange, reset]);
}
