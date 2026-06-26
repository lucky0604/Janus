import styles from './ComposerConsole.module.css';

interface PickerSheetProps {
  title: string;
  options: Array<{ id: string; label: string; disabled?: boolean; active?: boolean }>;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function PickerSheet({ title, options, onSelect, onClose }: PickerSheetProps) {
  return (
    <div className={styles.sheetOverlay} onClick={onClose}>
      <div className={styles.sheetPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.sheetHeader}>
          <span className={styles.sheetTitle}>{title}</span>
          <button className={styles.sheetCloseBtn} onClick={onClose}>×</button>
        </div>
        {options.map((opt) => (
          <button
            key={opt.id}
            className={
              opt.disabled
                ? styles.sheetOptionDisabled
                : opt.active
                  ? styles.sheetOptionActive
                  : styles.sheetOption
            }
            onClick={() => !opt.disabled && onSelect(opt.id)}
            disabled={opt.disabled}
          >
            <span>{opt.active && <span className={styles.sheetCheck}>✓ </span>}{opt.label}</span>
            <span className={styles.sheetOptionStatus}></span>
          </button>
        ))}
      </div>
    </div>
  );
}
