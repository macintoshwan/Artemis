/**
 * PriorityMatrixPicker —— 重要度/紧急度矩阵选择器
 *
 * SVG 直角坐标系，X=紧急度(-1~1)，Y=重要度(-1~1)
 * 点击选取坐标，显示数值
 */

import { useState, useCallback, useRef, memo, type ReactElement } from 'react';

interface PriorityMatrixPickerProps {
  importance: number;
  urgency: number;
  onChange: (importance: number, urgency: number) => void;
  onClose: () => void;
}

const PADDING = 40;
const SIZE = 300;
const INNER = SIZE - PADDING * 2;

function valueToCoord(value: number): number {
  return PADDING + ((value + 1) / 2) * INNER;
}

function coordToValue(coord: number): number {
  const raw = ((coord - PADDING) / INNER) * 2 - 1;
  return Math.round(raw * 20) / 20; // 0.05 步进
}

export const PriorityMatrixPicker = memo(function PriorityMatrixPicker({
  importance,
  urgency,
  onChange,
  onClose,
}: PriorityMatrixPickerProps) {
  const [imp, setImp] = useState(importance);
  const [urg, setUrg] = useState(urgency);
  const svgRef = useRef<SVGSVGElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const newUrg = Math.max(-1, Math.min(1, coordToValue(x)));
      // Y 轴反转（SVG 上方=正方向）
      const newImp = Math.max(-1, Math.min(1, Math.round(((PADDING + INNER - (y - PADDING)) / INNER * 2 - 1) * 20) / 20));

      setUrg(newUrg);
      setImp(newImp);
      onChange(newImp, newUrg);
    },
    [onChange],
  );

  const cx = valueToCoord(urg);
  const cy = PADDING + INNER - ((imp + 1) / 2) * INNER;

  // 网格线
  const gridLines: ReactElement[] = [];
  for (let v = -0.5; v <= 0.5; v += 0.5) {
    if (v === 0) continue;
    const xg = valueToCoord(v);
    const yg = PADDING + INNER - ((v + 1) / 2) * INNER;
    gridLines.push(
      <line key={`vx${v}`} x1={xg} y1={PADDING} x2={xg} y2={PADDING + INNER} className="priority-grid" />,
      <line key={`hy${v}`} x1={PADDING} y1={yg} x2={PADDING + INNER} y2={yg} className="priority-grid" />,
    );
  }

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="btn-secondary" onClick={onClose}>返回</button>
        </div>
        <div className="modal-body">
          <h2 className="modal-title">选择重要度/紧急度</h2>

          <div className="priority-matrix-container" style={{ width: SIZE, height: SIZE, margin: '0 auto' }}>
            <svg
              ref={svgRef}
              className="priority-matrix-svg"
              width={SIZE}
              height={SIZE}
              onClick={handleClick}
            >
              {/* 网格 */}
              {gridLines}
              {/* 零线 */}
              <line x1={valueToCoord(0)} y1={PADDING} x2={valueToCoord(0)} y2={PADDING + INNER} stroke="rgba(254,165,0,0.3)" strokeWidth={1} />
              <line x1={PADDING} y1={PADDING + INNER / 2} x2={PADDING + INNER} y2={PADDING + INNER / 2} stroke="rgba(254,165,0,0.3)" strokeWidth={1} />

              {/* 坐标轴 */}
              <line x1={PADDING} y1={PADDING + INNER} x2={PADDING + INNER} y2={PADDING + INNER} className="priority-axis" />
              <line x1={PADDING} y1={PADDING} x2={PADDING} y2={PADDING + INNER} className="priority-axis" />

              {/* 轴箭头 */}
              <polygon points={`${PADDING + INNER},${PADDING + INNER} ${PADDING + INNER - 6},${PADDING + INNER - 4} ${PADDING + INNER - 6},${PADDING + INNER + 4}`} className="priority-axis-arrow" />
              <polygon points={`${PADDING},${PADDING} ${PADDING - 4},${PADDING + 6} ${PADDING + 4},${PADDING + 6}`} className="priority-axis-arrow" />

              {/* 轴标签 */}
              <text x={PADDING + INNER / 2} y={SIZE - 5} textAnchor="middle" className="priority-label" style={{ fontSize: 14 }}>紧急度</text>
              <text x={12} y={PADDING + INNER / 2} textAnchor="middle" className="priority-label" style={{ fontSize: 14 }} transform={`rotate(-90, 12, ${PADDING + INNER / 2})`}>重要度</text>

              {/* 刻度标签 */}
              <text x={PADDING} y={SIZE - 5} textAnchor="middle" className="priority-label" style={{ fontSize: 11 }}>-1</text>
              <text x={PADDING + INNER} y={SIZE - 5} textAnchor="middle" className="priority-label" style={{ fontSize: 11 }}>1</text>
              <text x={PADDING - 8} y={PADDING + INNER + 4} textAnchor="middle" className="priority-label" style={{ fontSize: 11 }}>-1</text>
              <text x={PADDING - 8} y={PADDING + 4} textAnchor="middle" className="priority-label" style={{ fontSize: 11 }}>1</text>

              {/* 选中的点 */}
              <circle cx={cx} cy={cy} r={8} className="priority-point" />
              <text x={cx} y={cy - 14} textAnchor="middle" className="priority-point-label">
                {`${imp.toFixed(1)}, ${urg.toFixed(1)}`}
              </text>
            </svg>
          </div>

          <div className="priority-info-box">
            重要度：{imp.toFixed(2)}　紧急度：{urg.toFixed(2)}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>确认</button>
        </div>
      </div>
    </div>
  );
});
