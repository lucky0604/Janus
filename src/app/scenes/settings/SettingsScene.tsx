import { useState, useCallback, useRef } from 'react';
import { useChatStore } from '../../../stores/chat-store';
import styles from './SettingsScene.module.css';

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved';

interface FieldState {
  value: string;
  status: SaveStatus;
}

interface HealthResult {
  ok: boolean;
  status?: number;
  latencyMs: number;
  baseUrl?: string;
  model: string;
  message?: string;
  code?: string;
}

export function SettingsScene() {
  const { apiKey, baseUrl, modelName, workspacePath, setApiKey, setBaseUrl, setModelName, setWorkspacePath } = useChatStore();

  const [fields, setFields] = useState<Record<string, FieldState>>({
    baseUrl: { value: baseUrl, status: 'idle' },
    apiKey: { value: apiKey, status: 'idle' },
    modelName: { value: modelName, status: 'idle' },
  });

  const [localWorkspace, setLocalWorkspace] = useState(workspacePath);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthResult, setHealthResult] = useState<HealthResult | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const hasUnsaved = Object.values(fields).some((f) => f.status === 'unsaved');

  const updateField = useCallback((key: string, value: string) => {
    setFields((prev) => ({
      ...prev,
      [key]: { value, status: 'unsaved' },
    }));
  }, []);

  const persistField = useCallback(
    (key: string) => {
      const field = fields[key];
      if (!field || field.status !== 'unsaved') return;

      const trimmed = field.value.trim();

      // Clear previous timer
      if (timers.current[key]) clearTimeout(timers.current[key]);

      setFields((prev) => ({
        ...prev,
        [key]: { ...prev[key], status: 'saving' },
      }));

      // Map to the correct setter
      const setters: Record<string, (v: string) => void> = {
        baseUrl: setBaseUrl,
        apiKey: setApiKey,
        modelName: setModelName,
      };

      setters[key]?.(trimmed);

      setFields((prev) => ({
        ...prev,
        [key]: { value: trimmed, status: 'saved' },
      }));

      // Reset to idle after 2s
      timers.current[key] = setTimeout(() => {
        setFields((prev) => ({
          ...prev,
          [key]: { ...prev[key], status: 'idle' },
        }));
      }, 2000);
    },
    [fields, setBaseUrl, setApiKey, setModelName]
  );

  const saveAll = useCallback(() => {
    Object.keys(fields).forEach((key) => {
      if (fields[key].status === 'unsaved') {
        persistField(key);
      }
    });
  }, [fields, persistField]);

  const runHealthCheck = useCallback(async () => {
    const effectiveKey = fields.apiKey.value.trim() || apiKey;
    if (!effectiveKey) {
      setHealthResult({ ok: false, latencyMs: 0, model: fields.modelName.value, message: 'API key 未配置' });
      return;
    }
    setHealthLoading(true);
    setHealthResult(null);
    try {
      const res = await fetch('/api/health/provider', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': effectiveKey,
        },
        body: JSON.stringify({
          baseUrl: fields.baseUrl.value.trim(),
          modelName: fields.modelName.value.trim(),
        }),
      });
      const data = await res.json() as HealthResult;
      setHealthResult(data);
    } catch (err) {
      setHealthResult({
        ok: false,
        latencyMs: 0,
        model: fields.modelName.value,
        message: err instanceof Error ? err.message : '请求失败',
      });
    } finally {
      setHealthLoading(false);
    }
  }, [apiKey, fields.apiKey.value, fields.baseUrl.value, fields.modelName.value]);

  const statusLabel: Record<SaveStatus, string> = {
    idle: '',
    unsaved: '未保存',
    saving: '保存中…',
    saved: '✓ 已保存',
  };

  return (
    <div className={styles.scene}>
      <div className={styles.content}>
        <h2 className={styles.title}>设置</h2>

        {/* ---- Model Provider Section ---- */}
        <div className={styles.sectionGroup}>
          <h3 className={styles.sectionTitle}>模型提供商</h3>
          <p className={styles.sectionDesc}>
            配置 AI 模型的 API 接入信息，支持 OpenAI、DeepSeek、Ollama 等兼容接口。
          </p>

          <div className={styles.field}>
            <label className={styles.label}>API Base URL</label>
            <div className={styles.inputRow}>
              <input
                type="text"
                className={styles.input}
                value={fields.baseUrl.value}
                onChange={(e) => updateField('baseUrl', e.target.value)}
                onBlur={() => persistField('baseUrl')}
                placeholder="https://api.openai.com/v1"
                spellCheck={false}
              />
              <span className={`${styles.statusBadge} ${styles[fields.baseUrl.status]}`}>
                {statusLabel[fields.baseUrl.status]}
              </span>
            </div>
            <span className={styles.hint}>
              自定义接口地址，如 https://api.deepseek.com/v1
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>API Key</label>
            <div className={styles.inputRow}>
              <input
                type="password"
                className={styles.input}
                value={fields.apiKey.value}
                onChange={(e) => updateField('apiKey', e.target.value)}
                onBlur={() => persistField('apiKey')}
                placeholder="sk-..."
                spellCheck={false}
              />
              <span className={`${styles.statusBadge} ${styles[fields.apiKey.status]}`}>
                {statusLabel[fields.apiKey.status]}
              </span>
            </div>
            <span className={styles.hint}>模型的 API 密钥，本地存储不会上传</span>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>模型名称</label>
            <div className={styles.inputRow}>
              <input
                type="text"
                className={styles.input}
                value={fields.modelName.value}
                onChange={(e) => updateField('modelName', e.target.value)}
                onBlur={() => persistField('modelName')}
                placeholder="gpt-4o"
                spellCheck={false}
              />
              <span className={`${styles.statusBadge} ${styles[fields.modelName.status]}`}>
                {statusLabel[fields.modelName.status]}
              </span>
            </div>
            <span className={styles.hint}>
              模型标识，如 gpt-4o、deepseek-chat、qwen-plus
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>连接诊断</label>
            <div className={styles.inputRow}>
              <button
                className={styles.btnSave}
                onClick={runHealthCheck}
                disabled={healthLoading}
                style={{ minWidth: 120 }}
              >
                {healthLoading ? '检测中…' : '运行健康检查'}
              </button>
              {healthResult && (
                <span
                  className={styles.statusBadge}
                  style={{
                    color: healthResult.ok ? '#16a34a' : '#dc2626',
                    marginLeft: 8,
                  }}
                >
                  {healthResult.ok
                    ? `✓ ${healthResult.latencyMs}ms`
                    : `✗ ${healthResult.status ? `HTTP ${healthResult.status} · ` : ''}${healthResult.message || '失败'}`}
                </span>
              )}
            </div>
            <span className={styles.hint}>
              发送一次极短请求（max_tokens=1, 5s 超时）验证 URL / Key / 模型是否可用，不消耗对话上下文。
            </span>
          </div>
        </div>

        {/* ---- Workspace Section ---- */}
        <div className={styles.sectionGroup}>
          <h3 className={styles.sectionTitle}>工作空间</h3>

          <div className={styles.field}>
            <label className={styles.label}>项目路径</label>
            <input
              type="text"
              className={styles.input}
              value={localWorkspace}
              onChange={(e) => setLocalWorkspace(e.target.value)}
              onBlur={() => {
                const trimmed = localWorkspace.trim();
                setLocalWorkspace(trimmed);
                setWorkspacePath(trimmed);
              }}
              placeholder="/path/to/your/project"
              spellCheck={false}
            />
            <span className={styles.hint}>本地项目目录，用于文件操作</span>
          </div>
        </div>

        {/* ---- Save All ---- */}
        {hasUnsaved && (
          <div className={styles.saveBar}>
            <span className={styles.unsavedHint}>有未保存的更改</span>
            <button className={styles.btnSave} onClick={saveAll}>
              全部保存
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
