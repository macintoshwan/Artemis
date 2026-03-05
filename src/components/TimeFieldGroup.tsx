/**
 * TimeFieldGroup —— 时间三元组（开始 + 耗时 + 结束）
 *
 * 功能：
 * - 开始/耗时/结束三个输入字段
 * - 实时相对时间提示（今天/明天/3天后…）
 * - 时间一致性验证（开始+耗时≈结束，容差30秒）
 * - 不一致时显示偏差量 + 修正按钮 + 修正预览
 * - 当只填了 2/3 个字段时，自动建议补全第三个
 * - 不一致的字段加警告边框
 */

import { useState, useMemo, useCallback, memo, type ReactElement } from 'react';
import { formatRelativeTimeCN, formatDurationCN } from '../utils/formatTime';
import { DateTimePicker } from './DateTimePicker';
import { DurationPicker } from './DurationPicker';

// ============================================================
// 类型
// ============================================================

interface TimeFieldGroupProps {
  /** 标签前缀：预计 / 实际 */
  label: '预计' | '实际';
  /** 开始时间（datetime-local 格式） */
  start: string;
  /** 耗时（小时，字符串） */
  duration: string;
  /** 结束时间（datetime-local 格式） */
  end: string;
  /** 值变更回调 */
  onChange: (field: 'start' | 'duration' | 'end', value: string) => void;
  /** 修正回调 */
  onFix: (target: 'start' | 'duration' | 'end') => void;
}

// ============================================================
// 辅助函数
// ============================================================

/** ISO → 本地 datetime-local 格式 */
function isoToLocal(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 解析三元组的数值状态 */
function parseTriple(start: string, duration: string, end: string) {
  const s = start ? new Date(start).getTime() : NaN;
  const d = duration ? parseFloat(duration) : NaN;
  const e = end ? new Date(end).getTime() : NaN;
  return {
    s, d, e,
    hasStart: !isNaN(s),
    hasDuration: !isNaN(d) && d >= 0,
    hasEnd: !isNaN(e),
  };
}

interface ConsistencyResult {
  /** 三个字段是否一致 */
  consistent: boolean;
  /** 偏差描述文字 */
  deviationText: string;
  /** 修正预览：每个 fix target 会得到的新值 */
  fixPreviews: {
    start: string;
    duration: string;
    end: string;
  };
  /** 是否可以建议自动补全 */
  suggestion: { field: 'start' | 'duration' | 'end'; value: string } | null;
  /** 填了几个字段 */
  filledCount: number;
}

/** 分析时间一致性 */
function analyzeConsistency(start: string, duration: string, end: string): ConsistencyResult {
  const { s, d, e, hasStart, hasDuration, hasEnd } = parseTriple(start, duration, end);
  const filledCount = [hasStart, hasDuration, hasEnd].filter(Boolean).length;

  const empty: ConsistencyResult = {
    consistent: true,
    deviationText: '',
    fixPreviews: { start: '', duration: '', end: '' },
    suggestion: null,
    filledCount,
  };

  // 填了不到2个，无法验证也无法建议
  if (filledCount < 2) return empty;

  // 恰好填了2个：可以建议补全第三个
  if (filledCount === 2) {
    let suggestion: ConsistencyResult['suggestion'] = null;
    if (hasStart && hasDuration && !hasEnd) {
      suggestion = { field: 'end', value: isoToLocal(new Date(s + d * 3_600_000).toISOString()) };
    } else if (hasStart && !hasDuration && hasEnd) {
      const hours = Math.round((e - s) / 3_600_000 * 100) / 100;
      suggestion = { field: 'duration', value: String(Math.max(0, hours)) };
    } else if (!hasStart && hasDuration && hasEnd) {
      suggestion = { field: 'start', value: isoToLocal(new Date(e - d * 3_600_000).toISOString()) };
    }
    return { ...empty, suggestion };
  }

  // 三个都填了：检查一致性
  const expectedEnd = s + d * 3_600_000;
  const deviationMs = Math.abs(expectedEnd - e);
  const isConsistent = deviationMs <= 30_000; // 30秒容差

  if (isConsistent) return empty;

  // 计算偏差文字
  const devHours = Math.floor(deviationMs / 3_600_000);
  const devMinutes = Math.floor((deviationMs % 3_600_000) / 60_000);
  const devSeconds = Math.floor((deviationMs % 60_000) / 1_000);
  let deviationText: string;
  if (devHours > 0) {
    deviationText = `偏差 ${devHours}小时${devMinutes > 0 ? `${devMinutes}分` : ''}`;
  } else if (devMinutes > 0) {
    deviationText = `偏差 ${devMinutes}分${devSeconds > 0 ? `${devSeconds}秒` : ''}`;
  } else {
    deviationText = `偏差 ${devSeconds}秒`;
  }

  // 计算各修正目标的预览值
  const fixStartMs = e - d * 3_600_000;
  const fixDurationHours = Math.round((e - s) / 3_600_000 * 100) / 100;
  const fixEndMs = s + d * 3_600_000;

  return {
    consistent: false,
    deviationText,
    fixPreviews: {
      start: isoToLocal(new Date(fixStartMs).toISOString()),
      duration: String(Math.max(0, fixDurationHours)),
      end: isoToLocal(new Date(fixEndMs).toISOString()),
    },
    suggestion: null,
    filledCount,
  };
}

/** 格式化 datetime-local 为简短预览文字（修正按钮用） */
function fmtPreview(dtLocal: string): string {
  if (!dtLocal) return '';
  const d = new Date(dtLocal);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 格式化 datetime-local 为输入框显示文字 */
function fmtDisplay(dtLocal: string): string {
  if (!dtLocal) return '';
  const d = new Date(dtLocal);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ============================================================
// 组件
// ============================================================

export const TimeFieldGroup = memo(function TimeFieldGroup({
  label,
  start,
  duration,
  end,
  onChange,
  onFix,
}: TimeFieldGroupProps): ReactElement {
  // Picker 开关状态
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const analysis = useMemo(
    () => analyzeConsistency(start, duration, end),
    [start, duration, end],
  );

  const { consistent, deviationText, fixPreviews, suggestion } = analysis;
  const showWarning = !consistent;

  // DateTimePicker 确认回调
  const handleStartConfirm = useCallback((v: string) => {
    onChange('start', v);
    setShowStartPicker(false);
  }, [onChange]);

  const handleEndConfirm = useCallback((v: string) => {
    onChange('end', v);
    setShowEndPicker(false);
  }, [onChange]);

  // DurationPicker 确认回调
  const handleDurationConfirm = useCallback((v: string) => {
    onChange('duration', v);
    setShowDurationPicker(false);
  }, [onChange]);

  // 格式化 datetime-local 为用户可读文本
  const startDisplay = start ? fmtDisplay(start) : '';
  const endDisplay = end ? fmtDisplay(end) : '';
  const durationDisplay = duration && parseFloat(duration) > 0
    ? formatDurationCN(parseFloat(duration))
    : '';

  return (
    <>
      {/* 开始时间 */}
      <div className="form-item">
        <label>
          {label}开始
          {showWarning && (
            <button
              className="btn-fix"
              onClick={() => onFix('start')}
              title={`修正为 ${fmtPreview(fixPreviews.start)}`}
            >
              修正→{fmtPreview(fixPreviews.start)}
            </button>
          )}
        </label>
        <div className="input-with-fix">
          <input
            type="text"
            readOnly
            className={showWarning ? 'time-warning' : ''}
            value={startDisplay}
            placeholder="点击选择时间"
            onClick={() => setShowStartPicker(true)}
          />
        </div>
        <div className="time-hint-row">
          {start && (
            <span className="relative-time">{formatRelativeTimeCN(start)}</span>
          )}
          {suggestion?.field === 'start' && (
            <button
              className="btn-suggest"
              onClick={() => onChange('start', suggestion.value)}
              title="自动补全"
            >
              建议：{fmtPreview(suggestion.value)}
            </button>
          )}
        </div>
      </div>

      {/* 耗时 */}
      <div className="form-item">
        <label>
          {label}耗时
          {showWarning && (
            <button
              className="btn-fix"
              onClick={() => onFix('duration')}
              title={`修正为 ${formatDurationCN(parseFloat(fixPreviews.duration))}`}
            >
              修正→{formatDurationCN(parseFloat(fixPreviews.duration))}
            </button>
          )}
        </label>
        <div className="input-with-fix">
          <input
            type="text"
            readOnly
            className={showWarning ? 'time-warning' : ''}
            value={durationDisplay}
            placeholder="点击选择耗时"
            onClick={() => setShowDurationPicker(true)}
          />
        </div>
        <div className="time-hint-row">
          {suggestion?.field === 'duration' && (
            <button
              className="btn-suggest"
              onClick={() => onChange('duration', suggestion.value)}
              title="自动补全"
            >
              建议：{formatDurationCN(parseFloat(suggestion.value))}
            </button>
          )}
        </div>
      </div>

      {/* 结束时间 */}
      <div className="form-item">
        <label>
          {label}结束
          {showWarning && (
            <button
              className="btn-fix"
              onClick={() => onFix('end')}
              title={`修正为 ${fmtPreview(fixPreviews.end)}`}
            >
              修正→{fmtPreview(fixPreviews.end)}
            </button>
          )}
        </label>
        <div className="input-with-fix">
          <input
            type="text"
            readOnly
            className={showWarning ? 'time-warning' : ''}
            value={endDisplay}
            placeholder="点击选择时间"
            onClick={() => setShowEndPicker(true)}
          />
        </div>
        <div className="time-hint-row">
          {end && (
            <span className="relative-time">{formatRelativeTimeCN(end)}</span>
          )}
          {suggestion?.field === 'end' && (
            <button
              className="btn-suggest"
              onClick={() => onChange('end', suggestion.value)}
              title="自动补全"
            >
              建议：{fmtPreview(suggestion.value)}
            </button>
          )}
        </div>
      </div>

      {/* 不一致警告行 —— 横跨三列 */}
      {showWarning && (
        <div className="form-item-full time-inconsistency-warning">
          ⚠ 开始 + 耗时 ≠ 结束（{deviationText}），请点击上方「修正」按钮校准
        </div>
      )}

      {/* ---- Picker 模态框 ---- */}
      {showStartPicker && (
        <DateTimePicker
          value={start}
          onConfirm={handleStartConfirm}
          onClose={() => setShowStartPicker(false)}
        />
      )}
      {showDurationPicker && (
        <DurationPicker
          value={duration}
          onConfirm={handleDurationConfirm}
          onClose={() => setShowDurationPicker(false)}
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={end}
          onConfirm={handleEndConfirm}
          onClose={() => setShowEndPicker(false)}
        />
      )}
    </>
  );
});
