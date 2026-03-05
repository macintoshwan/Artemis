/**
 * 时间格式化工具 —— 中文格式
 */

/**
 * 格式化剩余/超时毫秒数为中文（与旧版一致）
 * 正数："剩3天4时20分" / "剩2时5分30秒"
 * 负数/零："超1时5分30秒"
 */
export function formatTimeRemainingCN(diffMs: number): string {
  const abs = Math.abs(diffMs);
  const prefix = diffMs > 0 ? '剩' : '超';

  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);

  if (d > 0) {
    return `${prefix}${d}天${h}时${m}分`;
  }
  if (h > 0) {
    return `${prefix}${h}时${m}分${s}秒`;
  }
  if (m > 0) {
    return `${prefix}${m}分${s}秒`;
  }
  return `${prefix}${s}秒`;
}

/**
 * 格式化耗时（小时）为中文
 * "3小时20分钟" / "45分钟" / "—"
 */
export function formatDurationCN(hours: number | null): string {
  if (!hours || hours <= 0) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0 && m > 0) return `${h}小时${m}分钟`;
  if (h > 0) return `${h}小时`;
  return `${m}分钟`;
}

/**
 * 计算日期的相对时间描述（中文）
 * "今天 此刻" / "明天 3小时后" / "3天后 2小时后"
 */
export function formatRelativeTimeCN(isoOrLocal: string): string {
  if (!isoOrLocal) return '';
  const target = new Date(isoOrLocal);
  if (isNaN(target.getTime())) return '';

  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const isPast = diffMs < 0;

  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);

  const suffix = isPast ? '前' : '后';

  if (d === 0 && h === 0 && m <= 5) return '此刻';
  if (d === 0 && h === 0) return `${m}分钟${suffix}`;
  if (d === 0) return `${h}小时${m > 0 ? `${m}分钟` : ''}${suffix}`;
  if (d === 1 && !isPast) return `明天`;
  if (d === 1 && isPast) return `昨天`;
  return `${d}天${suffix}`;
}

/**
 * 格式化日期为 YYYY-MM-DD HH:MM（中文统一格式）
 */
export function formatDateTimeCN(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
