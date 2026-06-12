import { useState, useEffect, useCallback } from 'react';
import styles from './OnboardingDashboard.module.css';

interface CliInfo {
  id: string;
  name: string;
  available: boolean;
  version: string | null;
  installHint: string;
}

interface OnboardingStatus {
  workspace: {
    path: string;
    hasGit: boolean;
    branch: string | null;
    isClean: boolean;
  };
  clis: CliInfo[];
  environment: {
    hasAnthropicKey: boolean;
    hasOpenaiKey: boolean;
    nodeVersion: string;
    platform: string;
  };
  sessions: {
    count: number;
  };
}

interface Props {
  onStartSession: () => void;
}

export function OnboardingDashboard({ onStartSession }: Props) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (loading) {
    return <div className={styles.loading}>检测本地环境中...</div>;
  }

  if (error || !status) {
    return (
      <div className={styles.errorState}>
        <span>无法检测环境状态</span>
        <button className={styles.retryButton} onClick={fetchStatus}>
          重试
        </button>
      </div>
    );
  }

  const availableCount = status.clis.filter((c) => c.available).length;
  const hasAnyKey = status.environment.hasAnthropicKey || status.environment.hasOpenaiKey;

  return (
    <div className={styles.onboardingContainer}>
      <div className={styles.onboardingInner}>
        {/* Workspace */}
        <div className={styles.workspaceSection}>
          <div className={styles.workspacePath}>
            <span className={styles.workspaceIcon}>📁</span>
            <span>{shortenPath(status.workspace.path)}</span>
          </div>
          {status.workspace.hasGit && (
            <div className={styles.branchInfo}>
              {status.workspace.branch && (
                <span className={styles.branchBadge}>
                  ⎇ {status.workspace.branch}
                </span>
              )}
              <span className={status.workspace.isClean ? styles.cleanBadge : styles.dirtyBadge}>
                {status.workspace.isClean ? '● clean' : '● uncommitted'}
              </span>
            </div>
          )}
        </div>

        <div className={styles.divider} />

        {/* CLI Environment */}
        <div className={styles.sectionTitle}>
          <span>⚡</span>
          <span>Local CLI Environment</span>
        </div>

        <div className={styles.cliGrid}>
          {status.clis.map((cli) => (
            <div
              key={cli.id}
              className={cli.available ? styles.cliCardAvailable : styles.cliCardMissing}
            >
              <div className={styles.cliName}>{cli.name}</div>
              <div className={cli.available ? styles.cliStatusReady : styles.cliStatusMissing}>
                <span>{cli.available ? '✓' : '✗'}</span>
                <span>{cli.available ? 'Ready' : 'Not Found'}</span>
              </div>
              {cli.available && cli.version && (
                <div className={styles.cliVersion}>v{cli.version}</div>
              )}
              {!cli.available && cli.installHint && (
                <div className={styles.installHint}>{cli.installHint}</div>
              )}
            </div>
          ))}
        </div>

        {/* API Keys */}
        <div className={styles.sectionTitle}>
          <span>🔑</span>
          <span>API Keys</span>
        </div>

        <div className={styles.envRow}>
          <span className={styles.envKey}>ANTHROPIC_API_KEY</span>
          <span className={status.environment.hasAnthropicKey ? styles.envPresent : styles.envMissing}>
            {status.environment.hasAnthropicKey ? '✓ Configured' : '✗ Not set'}
          </span>
        </div>
        <div className={styles.envRow}>
          <span className={styles.envKey}>OPENAI_API_KEY</span>
          <span className={status.environment.hasOpenaiKey ? styles.envPresent : styles.envMissing}>
            {status.environment.hasOpenaiKey ? '✓ Configured' : '✗ Not set'}
          </span>
        </div>

        <div className={styles.divider} />

        {/* CTA */}
        <div className={styles.ctaSection}>
          <button
            className={styles.ctaButton}
            onClick={onStartSession}
            disabled={availableCount === 0 && !hasAnyKey}
          >
            <span className={styles.ctaIcon}>◆</span>
            <span>创建第一个 Code Mode 会话</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function shortenPath(p: string): string {
  if (p.startsWith('/Users/')) {
    const parts = p.split('/');
    if (parts.length > 3) {
      return '~/' + parts.slice(3).join('/');
    }
  }
  if (p.length > 50) {
    return '...' + p.slice(-47);
  }
  return p;
}
