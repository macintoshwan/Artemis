/**
 * BountyPicker —— 赏金选择器
 *
 * 预设金额按钮 + 自定义输入
 */

import { useState, useCallback, memo } from 'react';

const PRESET_VALUES = [0, 50, 100, 150, 200, 250, 300, 500];

interface BountyPickerProps {
  value: number;
  onChange: (value: number) => void;
  onClose: () => void;
}

export const BountyPicker = memo(function BountyPicker({
  value,
  onChange,
  onClose,
}: BountyPickerProps) {
  const [selected, setSelected] = useState(value);
  const [custom, setCustom] = useState('');

  const handleSelect = useCallback((v: number) => {
    setSelected(v);
    setCustom('');
  }, []);

  const handleConfirm = useCallback(() => {
    const final = custom ? parseFloat(custom) || 0 : selected;
    onChange(final);
    onClose();
  }, [selected, custom, onChange, onClose]);

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="modal-container bounty-picker-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">选择赏金</h3>
        </div>

        <div className="modal-body">
          <div className="bounty-options">
            {PRESET_VALUES.map((v) => (
              <button
                key={v}
                className={`bounty-option ${selected === v && !custom ? 'selected' : ''}`}
                onClick={() => handleSelect(v)}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="bounty-custom-row">
            <input
              type="number"
              value={custom}
              onChange={(e) => { setCustom(e.target.value); setSelected(-1); }}
              placeholder="自定义金额"
              min="0"
            />
            <button className="btn-primary" onClick={handleConfirm}>确认</button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
});
