# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.1.0] - 2026-06-09

### Added
- Memory system: persistent SQLite/FTS5 memory with session observation, per-turn recall, and background consolidation
- Self-evolution: pattern detector, nudge engine, skill crafting with user review gate
- Electron desktop shell with embedded HTTP server and IPC bridge
- Event cards in chat UI: memory recall, skill review, evolution event notifications
- MCP server config (codegraph) and opencode integration

### Changed
- Server refactored into createJanusServer factory pattern for standalone/Electron dual use
- Agent loop now integrates memory (resident prompt injection + per-turn recall) and evolution (nudge-driven skill crafting)
- npm start now uses tsx to run TypeScript directly
- SSE stream events extended with memory_recall, skill_review, evolution_event

### Fixed
- SPA fallback Content-Type header corrected from 'Content' to 'Content-Type'
- ESM __dirname crash in persistent-memory.ts (fileURLToPath import)
- Circular self-import in server/prod.js
- Missing Electron IPC handlers (select-folder, get-version)
- DB file handle leak in /memory/status endpoint (finally close)
- Evolution system error logs now visible via console.error
- Agent loop MemoryContext properly passed to evolve tool

## [0.2.0] - 2026-06-08

### Added
- Web search tool with Tavily API + DuckDuckGo HTML fallback
- Web fetch tool with SSRF protection, content extraction, and redirect chain validation
- URL validator with DNS resolution, private IP detection, and protocol/domain blocklist
- Content extractor using article-extractor with HTML fallback
- Agent registry with configurable system prompts (work-mode.md)
- Tool UI cards in MessageList: search results with source links, fetch with title/expand
- Tool status indicators (running spinner, done checkmark, error badge)
- Shared ToolMeta type for rich tool rendering

### Fixed
- Repeated "Thinking..." skeleton after tool calls — assistant messages now created on-demand per round
- accumulatedContent cross-round corruption — removed global variable, append delta directly
- DNS TOCTOU vulnerability — lookup callback re-checks private IP at request time
- DuckDuckGo HTML parsing — replaced fragile regex with linkedom DOM parser
- Tavily error message leak — sanitized to avoid exposing API details
- ToolMeta duplicate definition — unified import from shared/types
- Hardcoded color in toolStatusOk — now uses CSS variable with fallback
