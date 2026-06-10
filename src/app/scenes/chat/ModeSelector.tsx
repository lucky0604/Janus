import { useAgentStore } from '../../../stores/app-stores';
import styles from './ModeSelector.module.css';

export function ModeSelector() {
  const { modes, activeMode, setMode } = useAgentStore();

  return (
    <div className={styles.segmented} role="radiogroup" aria-label="Operating mode">
      {modes.map((mode) => (
        <button
          key={mode.id}
          className={`${styles.choice} ${mode.id === activeMode ? styles.choiceActive : ''}`}
          onClick={() => setMode(mode.id)}
          role="radio"
          aria-checked={mode.id === activeMode}
          title={mode.description}
        >
          <span className={styles.label}>{mode.name}</span>
        </button>
      ))}
    </div>
  );
}