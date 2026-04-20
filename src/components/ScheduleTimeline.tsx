import { memo, useMemo } from 'react';

interface ScheduleTimelineProps {
  events: Array<{ id: number; name: string; startMinute: number; endMinute: number; dateKey: string; dayIndex: number }>;
  todayKey: string;
  viewDays: number;
}

type Segment =
  | { kind: 'free'; startMinute: number; endMinute: number }
  | { kind: 'occupied'; startMinute: number; endMinute: number; id: number; name: string };

const MINUTE_HEIGHT = 0.4;
const MIN_DISPLAY_MINUTES = 60;
const MIN_BLOCK_HEIGHT = 80;

function getDisplayHeight(durationMinutes: number): number {
  if (durationMinutes < MIN_DISPLAY_MINUTES) {
    return MIN_BLOCK_HEIGHT;
  }
  return Math.max(32, durationMinutes * MINUTE_HEIGHT);
}

function minuteToLabel(minute: number): string {
  const clamped = Math.max(0, Math.min(1440, minute));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}

function buildSegmentsForDay(events: Array<{ startMinute: number; endMinute: number; id: number; name: string }>): Segment[] {
  const normalized = [...events]
    .map((event) => ({
      ...event,
      startMinute: Math.max(0, Math.min(1440, event.startMinute)),
      endMinute: Math.max(0, Math.min(1440, event.endMinute)),
    }))
    .filter((event) => event.endMinute > event.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute);

  const segments: Segment[] = [];
  let cursor = 0;

  for (const event of normalized) {
    if (event.startMinute > cursor) {
      segments.push({
        kind: 'free',
        startMinute: cursor,
        endMinute: event.startMinute,
      });
    }

    segments.push({
      kind: 'occupied',
      startMinute: event.startMinute,
      endMinute: event.endMinute,
      id: event.id,
      name: event.name,
    });

    cursor = Math.max(cursor, event.endMinute);
  }

  if (cursor < 1440) {
    segments.push({
      kind: 'free',
      startMinute: cursor,
      endMinute: 1440,
    });
  }

  if (segments.length === 0) {
    segments.push({
      kind: 'free',
      startMinute: 0,
      endMinute: 1440,
    });
  }

  return segments;
}

export const ScheduleTimeline = memo(function ScheduleTimeline({ events, todayKey, viewDays }: ScheduleTimelineProps) {
  // 生成日期列表
  const dates = useMemo(() => {
    const result: string[] = [];
    for (let i = 0; i < viewDays; i++) {
      const d = new Date(todayKey);
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      result.push(`${y}-${m}-${dd}`);
    }
    return result;
  }, [todayKey, viewDays]);

  // 按日期分组事件
  const eventsByDate = useMemo(() => {
    const grouped: Record<string, typeof events> = {};
    for (const date of dates) {
      grouped[date] = events.filter((e) => e.dateKey === date);
    }
    return grouped;
  }, [events, dates]);

  // 获取日期显示文本
  function formatDateLabel(dateKey: string): string {
    const d = new Date(`${dateKey}T00:00:00`);
    const weekDay = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${m}/${dd} 周${weekDay}`;
  }

  return (
    <div className="schedule-timeline-container">
      {dates.map((dateKey) => (
        <div key={dateKey} className="schedule-day-column">
          <div className="schedule-day-header">{formatDateLabel(dateKey)}</div>
          <div className="schedule-timeline">
            {buildSegmentsForDay(eventsByDate[dateKey] || []).map((segment, index) => {
              const duration = segment.endMinute - segment.startMinute;
              const height = getDisplayHeight(duration);
              const start = minuteToLabel(segment.startMinute);
              const end = minuteToLabel(segment.endMinute);

              if (segment.kind === 'occupied') {
                return (
                  <div
                    key={`${segment.id}-${segment.startMinute}-${segment.endMinute}`}
                    className="schedule-block schedule-block-occupied"
                    style={{ minHeight: `${height}px` }}
                  >
                    <div className="schedule-block-time">{start} - {end}</div>
                    <div className="schedule-block-name">{segment.name}</div>
                  </div>
                );
              }

              return (
                <div
                  key={`free-${index}-${segment.startMinute}-${segment.endMinute}`}
                  className="schedule-block schedule-block-free"
                  style={{ minHeight: `${height}px` }}
                >
                  <div className="schedule-block-time">{start} - {end}</div>
                  <div className="schedule-block-name">可用</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
});
