/**
 * DurationPicker —— 耗时选择器（两列列表：小时 / 分钟 + 自定义输入）
 *
 * 复刻 Legacy 版本的交互：
 * - 小时列：0–12（点击选择）
 * - 分钟列：0–55（步进5，点击选择）
 * - 底部有自定义数字输入 + 确认按钮
 * - 确认后回传总小时数（字符串）
 */

import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { formatDurationCN } from '../utils/formatTime';

/* ------------------------------------------------------------------ */
/*  常量                                                              */
/* ------------------------------------------------------------------ */

const MAX_HOURS = 12;
const MINUTE_STEP = 5;

/* ------------------------------------------------------------------ */
/*  类型                                                              */
/* ------------------------------------------------------------------ */

interface DurationPickerProps {
  /** 当前耗时（小时，字符串） */
  value: string;
  /** 确认选择后回调（总小时数字符串） */
  onConfirm: (value: string) => void;
  /** 关闭选择器 */
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  工具函数                                                          */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');

/** 生成小时列表 */
function buildHourItems(): { label: string; value: number }[] {
  return Array.from({ length: MAX_HOURS + 1 }, (_, h) => ({
    label: `${h}小时`,
    value: h,
  }));
}

/** 生成分钟列表 */
function buildMinuteItems(): { label: string; value: number }[] {
  const items: { label: string; value: number }[] = [];
  for (let m = 0; m < 60; m += MINUTE_STEP) {
    items.push({ label: `${pad(m)}分钟`, value: m });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/*  自动滚动                                                          */
/* ------------------------------------------------------------------ */

function useScrollToSelected(ref: React.RefObject<HTMLDivElement | null>, dep: number) {
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

export const DurationPicker = memo(function DurationPicker({
  value,
  onConfirm,
  onClose,
}: DurationPickerProps) {
  // 从传入值初始化
  const init = useMemo(() => {
    const totalHours = value ? parseFloat(value) : 0;
    if (isNaN(totalHours) || totalHours < 0) return { hour: 0, minute: 0 };
    const h = Math.min(Math.floor(totalHours), MAX_HOURS);
    const m = Math.floor(((totalHours - Math.floor(totalHours)) * 60) / MINUTE_STEP) * MINUTE_STEP;
    return { hour: h, minute: m };
  }, [value]);

  const [selHour, setSelHour] = useState(init.hour);
  const [selMinute, setSelMinute] = useState(init.minute);
  const [customInput, setCustomInput] = useState('');

  // 列表数据
  const hourItems = useMemo(buildHourItems, []);
  const minuteItems = useMemo(buildMinuteItems, []);

  // 自动滚动
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  useScrollToSelected(hourRef, selHour);
  useScrollToSelected(minuteRef, selMinute);

  // 点击列表时清空自定义输入
  const handleHourClick = useCallback((h: number) => {
    setSelHour(h);
    setCustomInput('');
  }, []);

  const handleMinuteClick = useCallback((m: number) => {
    setSelMinute(m);
    setCustomInput('');
  }, []);

  // 确认
  const handleConfirm = useCallback(() => {
    if (customInput) {
      const custom = parseFloat(customInput);
      if (!isNaN(custom) && custom >= 0) {
        onConfirm(String(Math.round(custom * 100) / 100));
        return;
      }
    }
    const totalHours = selHour + selMinute / 60;
    onConfirm(String(Math.round(totalHours * 100) / 100));
  }, [selHour, selMinute, customInput, onConfirm]);

  // 当前选中的友好描述
  const previewText = customInput
    ? formatDurationCN(parseFloat(customInput) || 0)
    : formatDurationCN(selHour + selMinute / 60);

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div
        className="modal-container duration-picker-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="modal-header">
          <h3 className="modal-title">选择耗时</h3>
          {previewText !== '—' && (
            <span className="duration-preview-label">{previewText}</span>
          )}
        </div>

        {/* 主体 */}
        <div className="modal-body">
          <div className="picker-table-wrapper">
            {/* 小时列 */}
            <div className="picker-table-column">
              <h3>小时</h3>
              <div className="picker-table-content" ref={hourRef}>
                {hourItems.map((item) => (
                  <div
                    key={item.value}
                    className={`picker-item${item.value === selHour && !customInput ? ' selected' : ''}`}
                    onClick={() => handleHourClick(item.value)}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
            </div>

            {/* 分钟列 */}
            <div className="picker-table-column">
              <h3>分钟</h3>
              <div className="picker-table-content" ref={minuteRef}>
                {minuteItems.map((item) => (
                  <div
                    key={item.value}
                    className={`picker-item${item.value === selMinute && !customInput ? ' selected' : ''}`}
                    onClick={() => handleMinuteClick(item.value)}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 自定义输入行 */}
          <div className="duration-custom-row">
            <input
              type="number"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="自定义（小时）"
              min="0"
              step="0.5"
            />
            <button className="btn-primary" onClick={handleConfirm}>确认</button>
          </div>
        </div>

        {/* 底部 */}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
});
