## Comprehensive Implementation Plan for Missing PRD v2.0 Components

### Executive Summary
After reviewing the PRD v2.0 (OpenClaw-inspired Architecture) and auditing the existing codebase, I've identified critical missing components that need implementation to achieve full PRD compliance.

---

## Phase 1: Core Tool System (CRITICAL - Priority 1)

The PRD specifies 8+ tools in section 11.6, but only a `noop` tool exists. The tools directory is completely missing.

### Files to Create:

1. **`packages/core/src/tools/index.ts`** - Tool registry and exports
2. **`packages/core/src/tools/jd-analysis-tools.ts`** - `analyze_jd` tool implementation
3. **`packages/core/src/tools/resume-tools.ts`** - `tailor_resume`, `compile_pdf` tools
4. **`packages/core/src/tools/memory-tools.ts`** - `memory_search`, `memory_get` tools
5. **`packages/core/src/tools/bundle-tools.ts`** - `bundle_export` tool for ZIP packaging
6. **`packages/core/src/tools/portal-tools.ts`** - `portal_autofill` tool
7. **`packages/core/src/tools/exec-tools.ts`** - `exec` tool for system commands

### Implementation Details:
- Each tool must implement the `ToolDefinition` interface from `agent/types.ts`
- Tools must return `ToolResult` with proper status and execution time
- Tools requiring approval must set `requiresApproval: true`
- Tools must integrate with existing packages (jd, resume, tracker, portals)

---

## Phase 2: Session Persistence System (CRITICAL - Priority 1)

The PRD section 16 specifies JSONL transcript persistence, but `session-persistence.ts` is not implemented.

### Files to Create:

1. **`packages/core/src/gateway/session-persistence.ts`** - Full persistence implementation
   - JSONL transcript writing to `~/.applypilot/agents/<agentId>/sessions/<sessionId>.jsonl`
   - Session state snapshots to `.state` files
   - Session metadata index (`sessions.json`)
   - Daily reset policies (time-based, idle, token-based)
   - Session pruning based on retention days
   - Session inspection methods

### Files to Modify:

2. **`packages/core/src/gateway/session-manager.ts`** - Add persistence integration
   - Call persistence layer on session updates
   - Handle session restore on startup
   - Implement reset policies

---

## Phase 3: Bootstrap File Injection System (Priority 2)

PRD section 14 specifies automatic injection of AGENTS.md, SOUL.md, TOOLS.md, USER.md into context.

### Files to Create:

1. **`packages/core/src/bootstrap/index.ts`** - Bootstrap system exports
2. **`packages/core/src/bootstrap/file-loader.ts`** - File loading and injection logic
   - Load bootstrap files from workspace
   - Handle size limits and truncation
   - First-run BOOTSTRAP.md handling
   - File injection order enforcement

### Files to Modify:

3. **`packages/core/src/context/context-manager.ts`** - Add bootstrap injection
   - Inject bootstrap content into system prompt assembly
   - Handle dynamic variable replacement
   - Support per-session bootstrap overrides

---

## Phase 4: Memory Index Persistence (Priority 2)

PRD section 13.9 specifies vector and BM25 index storage to disk.

### Files to Create:

1. **`packages/core/src/memory/index-storage.ts`** - Index persistence implementation
   - Vector embeddings storage (`vectors.bin`)
   - BM25 index storage (`bm25.bin`)
   - Metadata and checksums tracking
   - Incremental updates with file watcher
   - Background indexing support

### Files to Modify:

2. **`packages/core/src/memory/memory-manager.ts`** - Add persistence integration
   - Load index on startup
   - Save index on changes
   - Handle incremental updates

---

## Phase 5: Plugin Manifest Support (Priority 2)

PRD section 11.6 mentions `applypilot.plugin.json` manifest files.

### Files to Create:

1. **`packages/core/src/plugin/manifest-schema.ts`** - Manifest validation schema

### Files to Modify:

2. **`packages/core/src/plugin/plugin-manager.ts`** - Add manifest parsing
   - Parse `applypilot.plugin.json` files
   - Validate manifest schema
   - Handle slot registrations
   - Support plugin configuration

---

## Phase 6: Agent Runtime Integration (Priority 1)

### Files to Modify:

1. **`packages/core/src/agent/agent-runtime.ts`** - Integrate all tools
   - Import and register all tools from `tools/` directory
   - Connect planner to tool execution
   - Implement proper tool result handling

2. **`packages/core/src/index.ts`** - Export new modules
   - Export tools module
   - Export bootstrap module

---

## Summary of Files

### New Files (17):
- `packages/core/src/tools/index.ts`
- `packages/core/src/tools/jd-analysis-tools.ts`
- `packages/core/src/tools/resume-tools.ts`
- `packages/core/src/tools/memory-tools.ts`
- `packages/core/src/tools/bundle-tools.ts`
- `packages/core/src/tools/portal-tools.ts`
- `packages/core/src/tools/exec-tools.ts`
- `packages/core/src/gateway/session-persistence.ts`
- `packages/core/src/bootstrap/index.ts`
- `packages/core/src/bootstrap/file-loader.ts`
- `packages/core/src/memory/index-storage.ts`
- `packages/core/src/plugin/manifest-schema.ts`

### Modified Files (6):
- `packages/core/src/agent/agent-runtime.ts`
- `packages/core/src/gateway/session-manager.ts`
- `packages/core/src/context/context-manager.ts`
- `packages/core/src/memory/memory-manager.ts`
- `packages/core/src/plugin/plugin-manager.ts`
- `packages/core/src/index.ts`

---

## Verification Steps:
1. All tools register correctly with AgentRuntime
2. Session persistence saves/loads transcripts properly
3. Bootstrap files inject into context correctly
4. Memory index persists across restarts
5. Plugin manifests parse and validate
6. All components follow PRD specifications

This implementation will bring the codebase to full PRD v2.0 compliance.