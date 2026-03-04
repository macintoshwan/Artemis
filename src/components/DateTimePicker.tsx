/**
 * DateTimePicker —— 日期时间选择器（三列列表：日期 / 小时 / 分钟）
 *
 * 复刻 Legacy 版本的交互：
 * - 日期列：过去10天 ~ 未来20天，标记"今天"
 * - 小时列：0–23，标记当前小时
 * - 分钟列：0–55（步进5），标记当前最近5分钟
 * - 每列底部显示相对时间提示
 * - 点击"确认"回传 datetime-local 字符串
 */

import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';

/* ------------------------------------------------------------------ */
/*  常量                                                              */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;
const PAST_DAYS = 10;
const FUTURE_DAYS = 20;
const MINUTE_STEP = 5;

/* ------------------------------------------------------------------ */
/*  类型                                                              */
/* ------------------------------------------------------------------ */

interface DateTimePickerProps {
  /** 当前值（datetime-local 格式） */
  value: string;
  /** 确认选择后回调 */
  onConfirm: (value: string) => void;
  /** 关闭选择器 */
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  工具函数                                                          */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD */
function dateFmt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 生成日期列表项 */
function buildDateItems(): { label: string; value: string; isCurrent: boolean }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = dateFmt(today);

  const items: { label: string; value: string; isCurrent: boolean }[] = [];
  for (let i = -PAST_DAYS; i <= FUTURE_DAYS; i++) {
    const d = new Date(today.getTime() + i * DAY_MS);
    const ds = dateFmt(d);
    const weekDay = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    let label = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} 周${weekDay}`;
    if (i === 0) label += ' (今天)';
    else if (i === 1) label += ' (明天)';
    else if (i === -1) label += ' (昨天)';
    items.push({ label, value: ds, isCurrent: ds === todayStr });
  }
  return items;
}

/** 生成小时列表项 */
function buildHourItems(nowHour: number): { label: string; value: number; isCurrent: boolean }[] {
  return Array.from({ length: 24 }, (_, h) => ({
    label: `${pad(h)}时`,
    value: h,
    isCurrent: h === nowHour,
  }));
}

/** 生成分钟列表项 */
function buildMinuteItems(nowMinute: number): { label: string; value: number; isCurrent: boolean }[] {
  const currentStep = Math.floor(nowMinute / MINUTE_STEP) * MINUTE_STEP;
  const items: { label: string; value: number; isCurrent: boolean }[] = [];
  for (let m = 0; m < 60; m += MINUTE_STEP) {
    items.push({
      label: `${pad(m)}分`,
      value: m,
      isCurrent: m === currentStep,
    });
  }
  return items;
}

/** 日期相对描述 */
function dateRelative(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((target.getTime() - today.getTime()) / DAY_MS);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  return diff > 0 ? `${diff}天后` : `${Math.abs(diff)}天前`;
}

/** 小时相对描述 */
function hourRelative(selectedHour: number): string {
  const now = new Date().getHours();
  const diff = selectedHour - now;
  if (diff === 0) return '当前时刻';
  return diff > 0 ? `${diff}小时后` : `${Math.abs(diff)}小时前`;
}

/** 分钟相对描述 */
function minuteRelative(selectedMinute: number): string {
  const nowMinute = Math.floor(new Date().getMinutes() / MINUTE_STEP) * MINUTE_STEP;
  const diff = selectedMinute - nowMinute;
  if (diff === 0) return '当前分钟';
  return diff > 0 ? `${diff}分钟后` : `${Math.abs(diff)}分钟前`;
}

/* ------------------------------------------------------------------ */
/*  自动滚动到选中项                                                  */
/* ------------------------------------------------------------------ */

function useScrollToSelected(ref: React.RefObject<HTMLDivElement | null>, dep: string | number) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const selected = el.querySelector('.picker-item.selected') as HTMLElement | null;
    if (selected) {
      selected.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [ref, dep]);
}

/* ------------------------------------------------------------------ */
/*  组件                                                              */
/* ------------------------------------------------------------------ */

export const DateTimePicker = memo(function DateTimePicker({
  value,
  onConfirm,
  onClose,
}: DateTimePickerProps) {
  const now = useMemo(() => new Date(), []);

  // 从传入值或当前时间初始化
  const init = useMemo(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return {
          date: dateFmt(d),
          hour: d.getHours(),
          minute: Math.floor(d.getMinutes() / MINUTE_STEP) * MINUTE_STEP,
        };
      }
    }
    return {
      date: dateFmt(now),
      hour: now.getHours(),
      minute: Math.floor(now.getMinutes() / MINUTE_STEP) * MINUTE_STEP,
    };
  }, [value, now]);

  const [selDate, setSelDate] = useState(init.date);
  const [selHour, setSelHour] = useState(init.hour);
  const [selMinute, setSelMinute] = useState(init.minute);

  // 列表数据（稳定引用）
  const dateItems = useMemo(buildDateItems, []);
  const hourItems = useMemo(() => buildHourItems(now.getHours()), [now]);
  const minuteItems = useMemo(() => buildMinuteItems(now.getMinutes()), [now]);

  // 自动滚动
  const dateRef = useRef<HTMLDivElement>(null);
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  useScrollToSelected(dateRef, selDate);
  useScrollToSelected(hourRef, selHour);
  useScrollToSelected(minuteRef, selMinute);

  // 确认
  const handleConfirm = useCallback(() => {
    // 组装 datetime-local 字符串：YYYY-MM-DDTHH:MM
    const dtLocal = `${selDate}T${pad(selHour)}:${pad(selMinute)}`;
    onConfirm(dtLocal);
  }, [selDate, selHour, selMinute, onConfirm]);

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div
        className="modal-container picker-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="modal-header">
          <button className="btn-secondary" onClick={onClose}>返回</button>
        </div>

        {/* 主体 */}
        <div className="modal-body">
          <h2 className="modal-title">选择日期时间</h2>

          <div className="picker-table-wrapper">
            {/* 日期列 */}
            <div className="picker-table-column">
              <h3>日期</h3>
              <div className="picker-table-content" ref={dateRef}>
                {dateItems.map((item) => (
                  <div
                    key={item.value}
                    className={`picker-item${item.value === selDate ? ' selected' : ''}${item.isCurrent ? ' current' : ''}`}
                    onClick={() => setSelDate(item.value)}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
              <div className="picker-relative-display">{dateRelative(selDate)}</div>
            </div>

            {/* 小时列 */}
            <div className="picker-table-column">
              <h3>小时</h3>
              <div className="picker-table-content" ref={hourRef}>
                {hourItems.map((item) => (
                  <div
                    key={item.value}
                    className={`picker-item${item.value === selHour ? ' selected' : ''}${item.isCurrent ? ' current' : ''}`}
                    onClick={() => setSelHour(item.value)}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
              <div className="picker-relative-display">{hourRelative(selHour)}</div>
            </div>

            {/* 分钟列 */}
            <div className="picker-table-column">
              <h3>分钟</h3>
              <div className="picker-table-content" ref={minuteRef}>
                {minuteItems.map((item) => (
                  <div
                    key={item.value}
                    className={`picker-item${item.value === selMinute ? ' selected' : ''}${item.isCurrent ? ' current' : ''}`}
                    onClick={() => setSelMinute(item.value)}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
              <div className="picker-relative-display">{minuteRelative(selMinute)}</div>
            </div>
          </div>
        </div>

        {/* 底部 */}
        <div className="modal-footer">
          <button className="btn-primary" onClick={handleConfirm}>确认</button>
        </div>
      </div>
    </div>
  );
});
