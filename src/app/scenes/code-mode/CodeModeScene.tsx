import { useCallback, useEffect, useRef, useState, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CodeModeLayout } from './CodeModeLayout';
import { ComposerConsole } from './ComposerConsole';
import { InspectorPane, type ApprovalCardData } from './InspectorPane';
import { PtyDrawer } from './PtyDrawer';
import { OnboardingDashboard } from './OnboardingDashboard';
import { ProjectSidebar } from './ProjectSidebar';
import { CodeModeHeader } from './CodeModeHeader';
import { ThinkingBlock } from './CodeModeMessageBlocks';
import { ToolActivityBlock } from './ToolActivityBlock';
import { RunStatusBar } from './RunStatusBar';
import { SystemNotice } from './SystemNotice';
import { applyApprovalStreamEvent, attachApprovalHandlers } from './relay-approval-events';
import { useProjectStore } from '../../../stores/project-store';
import { useCodeModeSessionStore } from '../../../stores/code-mode-session-store';
import { useCodeModeStore } from '../../../stores/code-mode-store';
import { useCodeRunStore } from '../../../stores/code-run-store';
import type { ToolCallState } from '../../../stores/code-run-types';
import emptyStyles from './CodeModeEmpty.module.css';
import msgStyles from '../chat/MessageList.module.css';

const EMPTY_TOOL_CALLS: ToolCallState[] = [];

export function CodeModeScene() {
  const { projects, activeProjectId } = useProjectStore();
  const {
    activeSessionId,
    sessionCache,
    appendExchange,
    switchToProject,
    isSessionExecuting,
  } = useCodeModeSessionStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const initializedProjectIdRef = useRef<string | null>(null);
  const approvalsCacheRef = useRef(new Map<string, ApprovalCardData[]>());
  const [approvals, setApprovals] = useStateApprovals(activeSessionId, approvalsCacheRef);

  const messages = activeSessionId
    ? (sessionCache[activeSessionId] ?? [])
    : [];

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const isThinking = activeSessionId ? isSessionExecuting(activeSessionId) : false;

  // Run state from normalized store — selectors return stable references only
  const activeRunId = useCodeRunStore((s) =>
    activeSessionId ? s.activeRunBySession[activeSessionId] : undefined,
  );
  const activeRun = useCodeRunStore((s) =>
    activeRunId ? s.runsById[activeRunId] : undefined,
  );
  const toolCallsById = useCodeRunStore((s) => s.toolCallsById);
  const activeRunToolCalls = useMemo(() => {
    if (!activeRun) return EMPTY_TOOL_CALLS;
    const result = activeRun.toolCallIds
      .map((id) => toolCallsById[id])
      .filter((tc): tc is ToolCallState => !!tc);
    return result.length > 0 ? result : EMPTY_TOOL_CALLS;
  }, [activeRun, toolCallsById]);
  const currentToolCall = useMemo(() => {
    if (!activeRun?.currentToolCallId) return undefined;
    return toolCallsById[activeRun.currentToolCallId];
  }, [activeRun?.currentToolCallId, toolCallsById]);

  // Group tool calls by the assistant message they belong to.
  // Tool calls from the active run are shown on the last assistant message.
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  }, [messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeRunToolCalls.length]);

  useEffect(() => {
    if (!activeProject) return;
    if (initializedProjectIdRef.current === activeProject.id) return;
    initializedProjectIdRef.current = activeProject.id;
    void switchToProject(activeProject.path);
  }, [activeProject?.id, activeProject?.path, switchToProject]);

  const { activeCli } = useCodeModeStore();

  const handleUserSend = useCallback((prompt: string) => {
    if (!activeSessionId) return;
    appendExchange(prompt, activeCli || undefined);
    approvalsCacheRef.current.set(activeSessionId, []);
    setApprovals([]);
  }, [appendExchange, activeSessionId, activeCli]);

  const handleStreamEvent = useCallback((sessionId: string, event: { type: string; data: unknown }) => {
    // Approval events still use local state (they need callback handlers)
    const prevApprovals = approvalsCacheRef.current.get(sessionId) ?? [];
    let nextApprovals = applyApprovalStreamEvent(prevApprovals, event);
    if (event.type === 'approval_required') {
      nextApprovals = nextApprovals.map((a) =>
        attachApprovalHandlers(a, (id, status) => {
          const updated = (approvalsCacheRef.current.get(sessionId) ?? []).map((c) =>
            c.id === id ? { ...c, status } : c,
          );
          approvalsCacheRef.current.set(sessionId, updated);
          if (sessionId === useCodeModeSessionStore.getState().activeSessionId) {
            setApprovals(updated);
          }
        }),
      );
    }
    approvalsCacheRef.current.set(sessionId, nextApprovals);

    if (sessionId === useCodeModeSessionStore.getState().activeSessionId) {
      setApprovals(nextApprovals);
    }
  }, []);

  const handleCancel = useCallback(() => {
    if (!activeSessionId) return;
    useCodeRunStore.getState().cancelRun(activeSessionId);
  }, [activeSessionId]);

  const showProjectOnboarding = projects.length === 0;
  const showProjectReady = !showProjectOnboarding && !!activeProject;

  const chatBody = showProjectOnboarding ? (
    <OnboardingDashboard />
  ) : !showProjectReady ? (
    <div className={emptyStyles.emptyState}>
      <h2 className={emptyStyles.title}>Select a project</h2>
      <p className={emptyStyles.text}>
        Choose a project from the sidebar to start relaying to your local CLI.
      </p>
    </div>
  ) : (
    <>
      <div key={activeSessionId ?? '__none__'} ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          {messages.length === 0 ? (
            <div className={emptyStyles.emptyState} style={{ minHeight: '240px' }}>
              <h2 className={emptyStyles.title}>{activeProject.name}</h2>
              <p className={emptyStyles.text}>
                Ask anything about this codebase. Messages relay to your selected CLI
                in <code>{shortenPath(activeProject.path)}</code>.
              </p>
            </div>
          ) : (
            <div className={msgStyles.messageList}>
              {messages.map((msg, i) => {
                if (msg.role === 'system') {
                  return (
                    <SystemNotice
                      key={msg.id}
                      tag={msg.systemTag}
                      kind={msg.systemKind}
                      content={msg.content}
                    />
                  );
                }
                const prevAssistant = (() => {
                  for (let j = i - 1; j >= 0; j--) {
                    if (messages[j].role === 'assistant') return messages[j];
                  }
                  return undefined;
                })();
                const showHandoffDivider = msg.role === 'assistant'
                  && msg.cliId
                  && prevAssistant?.cliId
                  && msg.cliId !== prevAssistant.cliId;

                const cliBadge = msg.role === 'assistant' && msg.cliId
                  ? msg.cliId.charAt(0).toUpperCase() + msg.cliId.slice(1)
                  : 'Relay';

                const isLastAssistant = i === lastAssistantIndex;
                const showToolActivity = isLastAssistant && activeRunToolCalls.length > 0;

                return (
                <div key={msg.id}>
                  {showHandoffDivider && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      margin: '16px 0', opacity: 0.6, fontSize: '12px',
                    }}>
                      <div style={{ flex: 1, height: '1px', background: 'var(--border-secondary, #333)' }} />
                      <span>switched to {cliBadge}</span>
                      <div style={{ flex: 1, height: '1px', background: 'var(--border-secondary, #333)' }} />
                    </div>
                  )}
                  <div
                    className={`${msgStyles.message} ${msg.role === 'user' ? msgStyles.userMessage : msgStyles.assistantMessage}`}
                  >
                  {msg.role === 'user' ? (
                    <div className={msgStyles.messageHeader}>
                      <div className={msgStyles.avatarUser}>U</div>
                      <span className={msgStyles.senderName}>You</span>
                    </div>
                  ) : (
                    <div className={msgStyles.messageHeader}>
                      <div className={msgStyles.avatarAssistant}>K</div>
                      <span className={`${msgStyles.senderName} ${msgStyles.senderNameAssistant}`}>Kavis</span>
                      <span className={msgStyles.aiBadge}>{cliBadge}</span>
                    </div>
                  )}
                  <div className={msgStyles.content}>
                    {msg.role === 'assistant' ? (
                      <>
                        {msg.thinking && <ThinkingBlock text={msg.thinking} />}

                        {showToolActivity && (
                          <ToolActivityBlock toolCalls={activeRunToolCalls} />
                        )}

                        {msg.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                            {msg.content}
                          </ReactMarkdown>
                        ) : (
                          isThinking && i === messages.length - 1 && !msg.thinking && activeRunToolCalls.length === 0 ? (
                            <div className={msgStyles.thinkingContainer}>
                              <div className={msgStyles.thinkingDot} />
                              <div className={msgStyles.thinkingDot} />
                              <div className={msgStyles.thinkingDot} />
                              <span className={msgStyles.thinkingText}>
                                {msg.cliId === 'codex' ? 'Processing (batch mode)...' : 'Thinking...'}
                              </span>
                            </div>
                          ) : null
                        )}
                      </>
                    ) : (
                      msg.content
                    )}
                  </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <PtyDrawer />
    </>
  );

  return (
    <CodeModeLayout
      sidebar={<ProjectSidebar />}
      chat={
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <CodeModeHeader />
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            {chatBody}
          </div>
          <RunStatusBar
            run={activeRun}
            currentToolCall={currentToolCall}
            onCancel={handleCancel}
          />
          <ComposerConsole onStreamEvent={handleStreamEvent} onSend={handleUserSend} />
        </div>
      }
      inspector={<InspectorPane sessionId={activeSessionId} approvals={approvals} />}
    />
  );
}

function shortenPath(p: string): string {
  if (p.startsWith('/Users/')) {
    const parts = p.split('/');
    if (parts.length > 3) return '~/' + parts.slice(3).join('/');
  }
  if (p.length > 48) return '…' + p.slice(-45);
  return p;
}

function useStateApprovals(
  activeSessionId: string | null,
  cacheRef: MutableRefObject<Map<string, ApprovalCardData[]>>,
): [ApprovalCardData[], Dispatch<SetStateAction<ApprovalCardData[]>>] {
  const [approvals, setApprovals] = useState<ApprovalCardData[]>([]);

  useEffect(() => {
    if (!activeSessionId) {
      setApprovals([]);
      return;
    }
    setApprovals(cacheRef.current.get(activeSessionId) ?? []);
  }, [activeSessionId, cacheRef]);

  return [approvals, setApprovals];
}
