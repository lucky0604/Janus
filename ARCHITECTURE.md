# Janus Architecture

Janus is an Electron + React desktop application for AI-assisted development. This document describes the project's directory structure, naming conventions, and module organization after the v0.2.7 restructuring.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Electron 42 |
| Frontend | React 18 + Zustand 5 |
| Backend | Node.js HTTP server (embedded in Electron) |
| Build | Vite 8 (frontend) + tsc (server) + esbuild (electron) |
| Language | TypeScript 5.6, strict mode |
| Database | better-sqlite3 (memory system) |
| Terminal | node-pty + xterm |

## Directory Structure

```
Janus/
├── electron/              # Electron main process
│   ├── main.ts            # App lifecycle, window creation, IPC, settings persistence
│   ├── preload.ts         # Context bridge (janusNative API)
│   └── pty-manager.ts     # PTY session management via node-pty
│
├── src/                   # Frontend (React SPA)
│   ├── main.tsx           # Vite entry point
│   ├── App.tsx            # Root component, hydrates stores on mount
│   ├── app/               # Application UI layer
│   │   ├── components/     # Shared cross-scene components (e.g. SessionItem)
│   │   ├── layout/         # App shell: AppLayout, NavBar, SceneArea
│   │   └── scenes/         # Scene-based routing (one dir per scene)
│   │       ├── chat/       # Chat scene (Work Mode)
│   │       ├── code-mode/  # Code Mode scene (CLI relay)
│   │       ├── settings/   # Settings scene
│   │       ├── welcome/    # Welcome/onboarding scene
│   │       └── terminal-spike/ # Terminal experiment scene
│   ├── stores/            # Zustand state stores (one file per store)
│   ├── hooks/             # Shared React hooks
│   ├── constants/         # Static constants (agent icons, etc.)
│   └── theme/             # CSS design tokens and dark theme
│
├── server/                # Backend (embedded HTTP server)
│   ├── index.ts           # Dev entry (re-exports configureApiRoutes)
│   ├── prod.ts            # Production server factory + Vite integration
│   ├── router.ts          # API route dispatcher
│   ├── handlers/          # HTTP request handlers (one per endpoint group)
│   ├── agents/            # Agent definitions, registry, prompt templates
│   │   ├── config.ts      # Operating modes + agent roles configuration
│   │   ├── registry.ts    # Agent registration system
│   │   └── prompts/       # System prompt markdown templates
│   ├── ai/                # LLM provider adapters
│   │   ├── adapter.ts     # AIAdapter interface
│   │   ├── openai-adapter.ts      # Main OpenAI adapter (orchestrator)
│   │   ├── openai-request-builder.ts  # Request body construction
│   │   ├── openai-stream-parser.ts     # SSE stream chunk processing
│   │   ├── openai-retry.ts             # Error classification + retry logic
│   │   ├── openai-errors.ts            # Error classes (AuthError, etc.)
│   │   ├── headers.ts          # Browser headers for upstream requests
│   │   ├── upstream-fetch.ts   # Custom fetch with proxy support
│   │   └── health-check.ts     # Provider connectivity probe
│   ├── engine/            # Core agent execution engine
│   │   ├── agent-loop.ts          # Main dialog turn executor
│   │   ├── tool-dispatcher.ts     # Tool call execution + approval flow
│   │   ├── message-handler.ts     # Error formatting, system prompt, memory recall
│   │   ├── context-compressor.ts  # Context window management
│   │   ├── loop-detector.ts       # Tool-call cycle detection
│   │   ├── cancellation.ts        # Abort token for cancellable operations
│   │   └── tool-approval.ts       # Write tool approval gate
│   ├── code-mode/         # Code Mode (external CLI relay)
│   │   ├── subprocess-runner.ts   # CLI subprocess lifecycle
│   │   ├── subprocess-io.ts       # NDJSON event parsing
│   │   ├── subprocess-types.ts    # Shared types for subprocess layer
│   │   ├── stream-routes.ts       # SSE streaming route handlers
│   │   ├── stream-sse.ts          # SSE writer (headers, debounce, flush)
│   │   ├── stream-format.ts       # CLI arg building, resume mode detection
│   │   ├── cli-registry.ts        # CLI tool definitions (claudecode, opencode, codex)
│   │   ├── cli-session-tracker.ts # Session metadata tracking
│   │   ├── context-assembler.ts   # Workspace context file assembly
│   │   ├── git-syncer.ts          # Git stash/apply for CLI handoffs
│   │   ├── handoff-helper.ts      # Handoff context persistence
│   │   ├── handoff-routes.ts      # Handoff API routes
│   │   ├── onboarding-routes.ts   # Onboarding API routes
│   │   ├── model-detectors.ts     # CLI model detection
│   │   └── translator.ts          # Event format translation
│   ├── memory/            # AI memory system (SQLite-backed)
│   │   ├── persistent-memory.ts   # MemoryContext factory + re-exports
│   │   ├── db-connection.ts       # SQLite singleton (getDb, closeDb)
│   │   ├── memory-crud.ts         # CRUD: preferences, project knowledge, FTS5 index
│   │   ├── memory-files.ts        # File-based ops: MEMORY.md, daily logs
│   │   ├── memory-recall.ts       # Memory recall at dialog start
│   │   ├── memory-consolidation.ts # Memory dedup + summarization
│   │   ├── memory-flush.ts        # Batch flush of observed memories
│   │   ├── memory-types.ts        # Memory system type definitions
│   │   ├── session-memory.ts      # Per-session memory observation
│   │   ├── schema.sql             # SQLite schema
│   │   └── index.ts               # Barrel export
│   ├── persistence/       # Session/project persistence (JSON files)
│   │   ├── session-store.ts       # Session CRUD + title generation
│   │   ├── file-utils.ts          # Atomic writes, ensureDir, index lock
│   │   ├── session-names.ts       # Name derivation + placeholder detection
│   │   ├── index-manager.ts       # Session index file management
│   │   ├── project-repository.ts  # Project metadata storage
│   │   └── title-generator.ts     # LLM-based session title generation
│   ├── evolution/         # Self-improvement system
│   │   ├── evolver-bridge.ts      # Evolver subprocess orchestration
│   │   ├── evolver-types.ts       # Evolution types + constants
│   │   ├── binary-resolver.ts     # Evolver binary location resolution
│   │   ├── gep-parser.ts          # GEP output parsing
│   │   ├── nudge-engine.ts        # Proactive complexity nudges
│   │   ├── pattern-detector.ts    # Usage pattern detection
│   │   ├── skill-crafter.ts       # Skill draft generation
│   │   ├── skill-review.ts        # Skill review workflow
│   │   └── index.ts               # Barrel export
│   ├── routes/            # API route handlers
│   │   ├── chat.ts                # Chat stream + message history
│   │   ├── sessions.ts            # Session list/create/delete
│   │   └── projects.ts            # Project list/create/delete
│   ├── tools/             # Agent tool definitions
│   │   ├── registry.ts            # Tool registration system
│   │   ├── read-file.ts           # File reading tool
│   │   ├── write-file.ts          # File writing tool (approval-gated)
│   │   ├── list-dir-tree.ts       # Directory listing tool
│   │   ├── search-content.ts      # Content search tool
│   │   ├── shell-exec.ts          # Shell execution tool
│   │   ├── git-ops.ts             # Git operations tool
│   │   ├── evolve.ts              # Evolution trigger tool
│   │   ├── path-validator.ts      # Path traversal prevention
│   │   ├── workspace-context.ts   # Workspace root detection
│   │   └── web/                   # Web-related tools
│   │       ├── web-search.ts      # Web search (Tavily + DuckDuckGo)
│   │       ├── web-fetch.ts       # Web page fetching
│   │       ├── url-validator.ts   # URL validation + SSRF prevention
│   │       └── content-extractor.ts # HTML content extraction
│   └── utils/             # Shared server utilities
│       ├── error-log.ts           # Structured error logging
│       └── read-body.ts           # HTTP body reading helper
│
├── shared/                # Types shared between frontend and backend
│   └── types/             # Domain-organized type definitions
│       ├── index.ts       # Barrel export (import from '../shared/types')
│       ├── messages.ts    # Message, ToolCall, ToolMeta, EventMeta
│       ├── stream.ts      # StreamEvent, SSE payloads, StreamErrorEventData
│       ├── agents.ts      # AgentDefinition, OperatingMode, AgentRole
│       ├── session.ts     # SessionMeta, ProjectMeta, DialogTurn
│       ├── memory.ts      # MemoryEntry, SkillDraft
│       └── code-mode.ts   # CliToolId, HandoffContext, CliToolConfig
│
├── types/                 # Ambient type declarations
│   └── dist-server.d.ts   # Module declaration for dist/server/prod.js
│
├── public/                # Static assets
├── dist/                  # Build output (tsc + Vite, gitignored)
├── release/               # Electron builder output (gitignored)
└── agent_flow/            # Architecture design docs (gitignored)
```

## Naming Conventions

### Files

| Pattern | Example | Rule |
|---------|---------|------|
| `{Name}Scene.tsx` | `WelcomeScene.tsx`, `ChatScene.tsx` | Scene components use `Scene` suffix |
| `{name}-store.ts` | `chat-store.ts`, `theme-store.ts` | Zustand stores use kebab-case + `-store` |
| `{name}-handler.ts` | `stream-handler.ts`, `agents-handler.ts` | HTTP handlers use `-handler` suffix |
| `{name}-routes.ts` | `stream-routes.ts`, `handoff-routes.ts` | Route files use `-routes` suffix |
| `use{Name}.ts` | `useFocusTrap.ts`, `useNativeBridge.ts` | Hooks use `use` prefix |
| `{name}.module.css` | `ChatScene.module.css` | CSS modules match component filename |
| `{name}.test.ts` | `web-search.test.ts` | Tests colocated, `.test.ts` suffix |
| `index.ts` | `shared/types/index.ts` | Barrel exports for domain directories |

### Directories

| Pattern | Example | Rule |
|---------|---------|------|
| `kebab-case` | `code-mode/`, `openai-retry.ts` | Multi-word names use kebab-case |
| Singular for domain | `memory/`, `persistence/` | Domain directories are singular |
| Plural for collections | `tools/`, `handlers/`, `routes/` | Collection directories are plural |

### Stores

Each Zustand store is in its own file under `src/stores/`:

| Store File | Hook | Responsibility |
|-----------|------|----------------|
| `theme-store.ts` | `useThemeStore` | Dark/light theme toggle |
| `agent-store.ts` | `useAgentStore` | Operating mode + agent role selection |
| `scene-store.ts` | `useSceneStore` | Scene navigation (welcome/chat/settings/code-mode) |
| `session-store.ts` | `useSessionStore` | Work-mode session list management |
| `layout-store.ts` | `useLayoutStore` | Code Mode pane widths |
| `code-mode-store.ts` | `useCodeModeStore` | Code Mode CLI/model selection |
| `chat-store.ts` | `useChatStore` | Chat messages, streaming, settings |
| `chat-sse-handler.ts` | (helper) | SSE event parsing for chat-store |
| `chat-actions.ts` | (helper) | Approval + hydrate actions for chat-store |
| `code-mode-session-store.ts` | `useCodeModeSessionStore` | Code Mode session CRUD + tool calls |
| `code-mode-session-types.ts` | (helper) | Type definitions |
| `code-mode-session-events.ts` | (helper) | Streaming event processing |
| `code-mode-session-helpers.ts` | (helper) | localStorage + message conversion |
| `project-store.ts` | `useProjectStore` | Project list management |

## Module Organization Patterns

### Barrel Exports

Directories with many internal modules use barrel `index.ts` files:

- `shared/types/index.ts` - re-exports all type domains
- `server/memory/index.ts` - re-exports memory system API
- `server/evolution/index.ts` - re-exports evolution system API

Import path stays stable: `import { Message } from '../shared/types'` resolves to `shared/types/index.ts`.

### Extracted Helper Pattern

Large files are split by extracting pure functions and helpers into separate modules. The main file keeps the public API and re-exports if needed:

**Example: chat-store.ts (648 -> 285 lines)**
```
chat-store.ts          -> State + store creation + sendMessage orchestration
chat-sse-handler.ts    -> SSE event parsing (processSSEEvent)
chat-actions.ts        -> Approval response + settings hydration
```

**Example: prod.ts (517 -> 120 lines)**
```
prod.ts                -> createJanusServer + configureApiRoutes + entry
router.ts              -> handleApiRequest (route dispatcher)
handlers/              -> One file per endpoint group
```

### Re-export for Backward Compatibility

When code is extracted to new files, the original file re-exports to preserve import paths:

```typescript
// session-store.ts re-exports shouldUpgradeName for backward compat
export { shouldUpgradeName } from './session-names';
```

## Architectural Decisions

### Scene-Based Routing (No Router Library)

Janus uses a simple scene store (`useSceneStore`) instead of react-router. Scenes are switched via `navigate('chat')` calls. This works because the app is a single-window desktop application with no URL bar.

### Embedded Server (No Separate Backend Process)

The backend HTTP server runs inside the Electron app process. In dev mode, Vite serves the frontend with API routes injected via middleware. In production, `createJanusServer()` starts an HTTP server on a random port and the BrowserWindow loads `http://localhost:{port}`.

### SSE Streaming (Not WebSocket)

Chat responses use Server-Sent Events. The server sends `text/event-stream` responses with heartbeat pings every 15s. The client (`chat-sse-handler.ts`) parses SSE blocks and dispatches events to the Zustand store.

### Tool Approval Gate

Write operations (`write_file`) require user approval before execution. The server emits an `approval_required` SSE event, the frontend shows an approval card, and the user's response is sent back via `POST /api/chat/approval`.

### Memory System (SQLite + Markdown)

The memory system uses two storage layers:
1. **SQLite** (`memory.db`) - structured data: preferences, project knowledge, FTS5 search index, conversation summaries
2. **Markdown files** (`MEMORY.md`, daily logs) - human-readable persistent memory

`persistent-memory.ts` is the public API; `db-connection.ts`, `memory-crud.ts`, and `memory-files.ts` are internal modules.

## Known Constraints

### Circular Import: agent-store <-> scene-store

`agent-store.ts` and `scene-store.ts` import each other. This is safe because:
- Both stores use `useXxxStore.getState()` inside action callbacks (deferred execution)
- Neither store's `create()` call depends on the other store's value
- This is a standard Zustand cross-store communication pattern

The circular dependency existed implicitly when both stores were in `app-stores.ts`. Splitting them into separate files made it explicit. A future refactor could resolve this by introducing an event bus or lifting the shared state.

### Build Artifacts

The following files are build outputs and must not be committed:
- `electron/main.js`, `electron/preload.js` (esbuild output)
- `main.js` (standalone server bundle)
- `server/prod.js` (tsc output)
- `dist/` (tsc + Vite output)
- `release/` (electron-builder output)

All are listed in `.gitignore`.

## File Size Policy

All source files are kept under 300 lines. Files approaching this limit should be split by:
1. Extracting pure functions to helper modules
2. Extracting sub-components to separate files
3. Moving types to a types file within the same directory

Current state: 0 files over 300 lines across 159 TypeScript/TSX files.
