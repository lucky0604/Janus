import { useState, useCallback, useRef, useEffect } from 'react';
import { useChatStore } from '../../../stores/chat-store';
import { useSceneStore } from '../../../stores/scene-store';
import styles from './SettingsScene.module.css';

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved';
type TabId = 'work' | 'code' | 'workspace';

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

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  unsaved: '未保存',
  saving: '保存中…',
  saved: '✓ 已保存',
};

export function SettingsScene() {
  const {
    apiKey,
    baseUrl,
    modelName,
    workspacePath,
    setApiKey,
    setBaseUrl,
    setModelName,
    setWorkspacePath,
    codeModeUseOverride,
    codeModeApiKey,
    codeModeBaseUrl,
    codeModeModel,
    setCodeModeUseOverride,
    setCodeModeApiKey,
    setCodeModeBaseUrl,
    setCodeModeModel,
  } = useChatStore();

  const [activeTab, setActiveTab] = useState<TabId>('work');
  const consumeSettingsInitialTab = useSceneStore((s) => s.consumeSettingsInitialTab);

  useEffect(() => {
    const t = consumeSettingsInitialTab();
    if (t) setActiveTab(t);
  }, [consumeSettingsInitialTab]);

  const [workFields, setWorkFields] = useState<Record<string, FieldState>>({
    baseUrl: { value: baseUrl, status: 'idle' },
    apiKey: { value: apiKey, status: 'idle' },
    modelName: { value: modelName, status: 'idle' },
  });

  const [codeFields, setCodeFields] = useState<Record<string, FieldState>>({
    baseUrl: { value: codeModeBaseUrl, status: 'idle' },
    apiKey: { value: codeModeApiKey, status: 'idle' },
    modelName: { value: codeModeModel, status: 'idle' },
  });

  const [localWorkspace, setLocalWorkspace] = useState(workspacePath);
  const [workHealthLoading, setWorkHealthLoading] = useState(false);
  const [workHealthResult, setWorkHealthResult] = useState<HealthResult | null>(null);
  const [codeHealthLoading, setCodeHealthLoading] = useState(false);
  const [codeHealthResult, setCodeHealthResult] = useState<HealthResult | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const workSetters: Record<string, (v: string) => void> = {
    baseUrl: setBaseUrl,
    apiKey: setApiKey,
    modelName: setModelName,
  };
  const codeSetters: Record<string, (v: string) => void> = {
    baseUrl: setCodeModeBaseUrl,
    apiKey: setCodeModeApiKey,
    modelName: setCodeModeModel,
  };

  const updateField = useCallback((scope: 'work' | 'code', key: string, value: string) => {
    const setter = scope === 'work' ? setWorkFields : setCodeFields;
    setter((prev) => ({ ...prev, [key]: { value, status: 'unsaved' } }));
  }, []);

  const persistField = useCallback(
    (scope: 'work' | 'code', key: string) => {
      const fields = scope === 'work' ? workFields : codeFields;
      const setter = scope === 'work' ? setWorkFields : setCodeFields;
      const setters = scope === 'work' ? workSetters : codeSetters;
      const field = fields[key];
      if (!field || field.status !== 'unsaved') return;

      const trimmed = field.value.trim();
      const timerKey = `${scope}.${key}`;
      if (timers.current[timerKey]) clearTimeout(timers.current[timerKey]);

      setter((prev) => ({ ...prev, [key]: { ...prev[key], status: 'saving' } }));
      setters[key]?.(trimmed);
      setter((prev) => ({ ...prev, [key]: { value: trimmed, status: 'saved' } }));

      timers.current[timerKey] = setTimeout(() => {
        setter((prev) => ({ ...prev, [key]: { ...prev[key], status: 'idle' } }));
      }, 2000);
    },
    [workFields, codeFields, workSetters, codeSetters],
  );

  const runHealthCheck = useCallback(
    async (scope: 'work' | 'code') => {
      const fields = scope === 'work' ? workFields : codeFields;
      const setLoading = scope === 'work' ? setWorkHealthLoading : setCodeHealthLoading;
      const setResult = scope === 'work' ? setWorkHealthResult : setCodeHealthResult;

      const fallbackKey = scope === 'work' ? apiKey : (codeModeApiKey || apiKey);
      const fallbackBase = scope === 'work' ? baseUrl : (codeModeBaseUrl || baseUrl);
      const fallbackModel = scope === 'work' ? modelName : (codeModeModel || modelName);

      const effectiveKey = fields.apiKey.value.trim() || fallbackKey;
      const effectiveBase = fields.baseUrl.value.trim() || fallbackBase;
      const effectiveModel = fields.modelName.value.trim() || fallbackModel;

      if (!effectiveKey) {
        setResult({ ok: false, latencyMs: 0, model: effectiveModel, message: 'API key 未配置' });
        return;
      }
      setLoading(true);
      setResult(null);
      try {
        const res = await fetch('/api/health/provider', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': effectiveKey },
          body: JSON.stringify({ baseUrl: effectiveBase, modelName: effectiveModel }),
        });
        const data = (await res.json()) as HealthResult;
        setResult(data);
      } catch (err) {
        setResult({
          ok: false,
          latencyMs: 0,
          model: effectiveModel,
          message: err instanceof Error ? err.message : '请求失败',
        });
      } finally {
        setLoading(false);
      }
    },
    [apiKey, baseUrl, modelName, codeModeApiKey, codeModeBaseUrl, codeModeModel, workFields, codeFields],
  );

  const renderModelFields = (
    scope: 'work' | 'code',
    fields: Record<string, FieldState>,
    placeholders: { baseUrl: string; apiKey: string; modelName: string },
    disabled = false,
  ) => (
    <>
      <div className={styles.field}>
        <label className={styles.label}>API Base URL</label>
        <div className={styles.inputRow}>
          <input
            type="text"
            className={styles.input}
            value={fields.baseUrl.value}
            onChange={(e) => updateField(scope, 'baseUrl', e.target.value)}
            onBlur={() => persistField(scope, 'baseUrl')}
            placeholder={placeholders.baseUrl}
            disabled={disabled}
            spellCheck={false}
          />
          <span className={`${styles.statusBadge} ${styles[fields.baseUrl.status]}`}>
            {STATUS_LABEL[fields.baseUrl.status]}
          </span>
        </div>
        <span className={styles.hint}>
          {scope === 'code' ? '留空则继承通用模型配置' : '自定义接口地址，如 https://api.deepseek.com/v1'}
        </span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>API Key</label>
        <div className={styles.inputRow}>
          <input
            type="password"
            className={styles.input}
            value={fields.apiKey.value}
            onChange={(e) => updateField(scope, 'apiKey', e.target.value)}
            onBlur={() => persistField(scope, 'apiKey')}
            placeholder={placeholders.apiKey}
            disabled={disabled}
            spellCheck={false}
          />
          <span className={`${styles.statusBadge} ${styles[fields.apiKey.status]}`}>
            {STATUS_LABEL[fields.apiKey.status]}
          </span>
        </div>
        <span className={styles.hint}>
          {scope === 'code'
            ? '留空则继承通用 API Key。本地使用 Electron safeStorage 加密存储'
            : '模型的 API 密钥，本地使用 Electron safeStorage 加密存储'}
        </span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>模型名称</label>
        <div className={styles.inputRow}>
          <input
            type="text"
            className={styles.input}
            value={fields.modelName.value}
            onChange={(e) => updateField(scope, 'modelName', e.target.value)}
            onBlur={() => persistField(scope, 'modelName')}
            placeholder={placeholders.modelName}
            disabled={disabled}
            spellCheck={false}
          />
          <span className={`${styles.statusBadge} ${styles[fields.modelName.status]}`}>
            {STATUS_LABEL[fields.modelName.status]}
          </span>
        </div>
        <span className={styles.hint}>
          {scope === 'code' ? '留空则继承通用模型，如 claude-3-5-sonnet-20241022' : '模型标识，如 gpt-4o、deepseek-chat、qwen-plus'}
        </span>
      </div>
    </>
  );

  const renderHealthCheck = (
    scope: 'work' | 'code',
    loading: boolean,
    result: HealthResult | null,
    disabled = false,
  ) => (
    <div className={styles.field}>
      <label className={styles.label}>连接诊断</label>
      <div className={styles.inputRow}>
        <button
          className={styles.btnSave}
          onClick={() => runHealthCheck(scope)}
          disabled={loading || disabled}
          style={{ minWidth: 120 }}
        >
          {loading ? '检测中…' : '运行健康检查'}
        </button>
        {result && (
          <span
            className={styles.statusBadge}
            style={{
              color: result.ok ? '#16a34a' : '#dc2626',
              marginLeft: 8,
            }}
          >
            {result.ok
              ? `✓ ${result.latencyMs}ms`
              : `✗ ${result.status ? `HTTP ${result.status} · ` : ''}${result.message || '失败'}`}
          </span>
        )}
      </div>
      <span className={styles.hint}>
        发送一次极短请求（max_tokens=1, 5s 超时）验证 URL / Key / 模型是否可用，不消耗对话上下文。
      </span>
    </div>
  );

  return (
    <div className={styles.scene}>
      <div className={styles.content}>
        <h2 className={styles.title}>设置</h2>

        <div className={styles.tabBar}>
          <button
            className={`${styles.tab} ${activeTab === 'work' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('work')}
          >
            通用模型
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'code' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('code')}
          >
            Code Mode 模型
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'workspace' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('workspace')}
          >
            工作空间
          </button>
        </div>

        {activeTab === 'work' && (
          <div className={styles.sectionGroup}>
            <h3 className={styles.sectionTitle}>通用模型提供商</h3>
            <p className={styles.sectionDesc}>
              用于 Work Mode 与 Code Mode 默认共享的 AI 模型 API 接入信息，支持 OpenAI、DeepSeek、Ollama 等兼容接口。
            </p>
            {renderModelFields('work', workFields, {
              baseUrl: 'https://api.openai.com/v1',
              apiKey: 'sk-...',
              modelName: 'gpt-4o',
            })}
            {renderHealthCheck('work', workHealthLoading, workHealthResult)}
          </div>
        )}

        {activeTab === 'code' && (
          <div className={styles.sectionGroup}>
            <h3 className={styles.sectionTitle}>Code Mode 模型</h3>
            <p className={styles.sectionDesc}>
              为 Code Mode（kavis-code 原生 Agent）单独配置模型。关闭则继承通用模型配置；打开后每个字段留空可单独继承。
            </p>

            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>当前生效模型</span>
                <span className={styles.summaryValue}>
                  {(codeModeUseOverride && codeModeModel.trim()) || modelName || '未配置'}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Base URL</span>
                <span className={styles.summaryValue}>
                  {(codeModeUseOverride && codeModeBaseUrl.trim()) || baseUrl || '未配置'}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>API Key</span>
                <span className={styles.summaryValue}>
                  {(() => {
                    const effective = codeModeUseOverride ? (codeModeApiKey.trim() || apiKey) : apiKey;
                    if (!effective) return '未配置';
                    const tail = effective.length > 4 ? effective.slice(-4) : effective;
                    return `••••${tail}`;
                  })()}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>来源</span>
                <span className={styles.summaryValue}>
                  {codeModeUseOverride ? 'Code Mode 独立配置（空字段继承通用）' : '继承自通用模型'}
                </span>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={codeModeUseOverride}
                  onChange={(e) => setCodeModeUseOverride(e.target.checked)}
                />
                <span>使用独立模型配置</span>
              </label>
              <span className={styles.hint}>
                {codeModeUseOverride
                  ? '当前 Code Mode 将使用下方独立配置（空字段继承通用配置）'
                  : '当前 Code Mode 与 Work Mode 共用上面"通用模型"配置'}
              </span>
            </div>

            {renderModelFields(
              'code',
              codeFields,
              {
                baseUrl: baseUrl || 'https://api.openai.com/v1',
                apiKey: apiKey ? '继承通用 API Key' : 'sk-...',
                modelName: modelName || 'gpt-4o',
              },
              !codeModeUseOverride,
            )}
            {renderHealthCheck('code', codeHealthLoading, codeHealthResult, !codeModeUseOverride)}
          </div>
        )}

        {activeTab === 'workspace' && (
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
        )}
      </div>
    </div>
  );
}
