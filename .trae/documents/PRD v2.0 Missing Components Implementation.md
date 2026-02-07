## Summary of Missing Components

Based on my review of the updated PRD v2.0 (OpenClaw-inspired Architecture) and codebase audit, I've identified the following critical missing components:

### Critical Missing Components:

1. **Planner Component** (HIGH PRIORITY)
   - Job state machine (new→analyzing→tailoring→ready→applied)
   - Step selection based on current state
   - Error recovery and retry logic
   - Location: `packages/core/src/agent/planner.ts`

2. **Tool System Implementation** (HIGH PRIORITY)
   The PRD specifies these tools in section 11.6, but only a `noop` tool exists:
   - `analyze_jd` - Analyze job description
   - `tailor_resume` - Tailor resume for job
   - `compile_pdf` - Compile LaTeX to PDF
   - `bundle_export` - Export application bundle as ZIP
   - `portal_autofill` - Autofill job portals
   - `memory_search` - Search memory system
   - `memory_get` - Get memory entries
   - `exec` - Execute system commands
   - Location: `packages/core/src/tools/` directory (missing source files)

3. **Session Persistence** (MEDIUM PRIORITY)
   - JSONL transcript persistence to disk
   - Session state snapshots
   - Session reset policies (daily, idle, token-based)
   - Session pruning based on retention days
   - Location: `packages/core/src/gateway/session-persistence.ts`

4. **applypilot.plugin.json Manifest Support** (MEDIUM PRIORITY)
   - Plugin manifest file parsing
   - Schema validation
   - Slot registration
   - Location: Update `packages/core/src/plugin/plugin-manager.ts`

5. **Memory Index Persistence** (MEDIUM PRIORITY)
   - Vector index storage to SQLite
   - BM25 index persistence
   - Incremental updates with file watcher
   - Location: `packages/core/src/memory/index-storage.ts`

6. **Bootstrap File Injection System** (MEDIUM PRIORITY)
   - Automatic injection of AGENTS.md, SOUL.md, TOOLS.md, USER.md into context
   - First-run BOOTSTRAP.md handling
   - File size limits and truncation
   - Location: `packages/core/src/bootstrap/` directory

### Implementation Plan:

**Phase 1: Core Tools (Priority 1)**
1. Create `packages/core/src/tools/index.ts` - Tool registry
2. Create `packages/core/src/tools/jd-analysis-tools.ts` - analyze_jd tool
3. Create `packages/core/src/tools/resume-tools.ts` - tailor_resume, compile_pdf tools
4. Create `packages/core/src/tools/memory-tools.ts` - memory_search, memory_get tools
5. Create `packages/core/src/tools/bundle-tools.ts` - bundle_export tool
6. Create `packages/core/src/tools/portal-tools.ts` - portal_autofill tool
7. Create `packages/core/src/tools/exec-tools.ts` - exec tool

**Phase 2: Planner Component (Priority 1)**
1. Create `packages/core/src/agent/planner.ts` - Job state machine
2. Create `packages/core/src/agent/job-state-machine.ts` - State transitions
3. Update `packages/core/src/agent/agent-runtime.ts` - Integrate planner

**Phase 3: Session Persistence (Priority 2)**
1. Create `packages/core/src/gateway/session-persistence.ts`
2. Update `packages/core/src/gateway/session-manager.ts` - Add persistence

**Phase 4: Plugin Manifest (Priority 2)**
1. Update `packages/core/src/plugin/plugin-manager.ts` - Add manifest parsing
2. Create `packages/core/src/plugin/manifest-schema.ts`

**Phase 5: Memory Index Storage (Priority 3)**
1. Create `packages/core/src/memory/index-storage.ts`
2. Update `packages/core/src/memory/memory-manager.ts` - Add persistence

**Phase 6: Bootstrap System (Priority 3)**
1. Create `packages/core/src/bootstrap/index.ts`
2. Create `packages/core/src/bootstrap/file-loader.ts`
3. Update `packages/core/src/context/context-manager.ts` - Inject bootstrap files

### Files to Create:
- `packages/core/src/tools/index.ts`
- `packages/core/src/tools/jd-analysis-tools.ts`
- `packages/core/src/tools/resume-tools.ts`
- `packages/core/src/tools/memory-tools.ts`
- `packages/core/src/tools/bundle-tools.ts`
- `packages/core/src/tools/portal-tools.ts`
- `packages/core/src/tools/exec-tools.ts`
- `packages/core/src/agent/planner.ts`
- `packages/core/src/agent/job-state-machine.ts`
- `packages/core/src/gateway/session-persistence.ts`
- `packages/core/src/plugin/manifest-schema.ts`
- `packages/core/src/memory/index-storage.ts`
- `packages/core/src/bootstrap/index.ts`
- `packages/core/src/bootstrap/file-loader.ts`

### Files to Modify:
- `packages/core/src/agent/agent-runtime.ts` - Integrate planner and tools
- `packages/core/src/gateway/session-manager.ts` - Add persistence
- `packages/core/src/plugin/plugin-manager.ts` - Add manifest support
- `packages/core/src/memory/memory-manager.ts` - Add index persistence
- `packages/core/src/context/context-manager.ts` - Add bootstrap injection
- `packages/core/src/index.ts` - Export new modules

Please confirm this plan to proceed with implementation.