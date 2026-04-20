import { memo, useMemo } from 'react';

interface ScheduleEvent {
  id: number;
  name: string;
  startMinute: number;
  endMinute: number;
}

interface ScheduleTimelineProps {
  events: ScheduleEvent[];
}

type Segment =
  | { kind: 'free'; startMinute: number; endMinute: number }
  | { kind: 'occupied'; startMinute: number; endMinute: number; id: number; name: string };

const MINUTE_HEIGHT = 0.4;

function minuteToLabel(minute: number): string {
  const clamped = Math.max(0, Math.min(1440, minute));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}

function buildSegments(events: ScheduleEvent[]): Segment[] {
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

export const ScheduleTimeline = memo(function ScheduleTimeline({ events }: ScheduleTimelineProps) {
  const segments = useMemo(() => buildSegments(events), [events]);

  return (
    <div className="schedule-timeline">
      {segments.map((segment, index) => {
        const duration = segment.endMinute - segment.startMinute;
        const height = Math.max(32, duration * MINUTE_HEIGHT);
        const start = minuteToLabel(segment.startMinute);
        const end = minuteToLabel(segment.endMinute);

        if (segment.kind === 'occupied') {
          const minHeight = Math.max(64, height);
          return (
            <div
              key={`${segment.id}-${segment.startMinute}-${segment.endMinute}`}
              className="schedule-block schedule-block-occupied"
              style={{ minHeight: `${minHeight}px` }}
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
            style={{ height: `${height}px` }}
          >
            <div className="schedule-block-time">{start} - {end}</div>
            <div className="schedule-block-name">可用</div>
          </div>
        );
      })}
    </div>
  );
});
