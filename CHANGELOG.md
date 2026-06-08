# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
