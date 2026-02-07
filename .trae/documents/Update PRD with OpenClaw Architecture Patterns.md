## Comprehensive Plan: ApplyBot PRD Update with OpenClaw Patterns

I've thoroughly reviewed the OpenClaw documentation. Here's my plan to update the PRD:

### 1. **Gateway Architecture Section** (NEW)
**From OpenClaw**: WebSocket control plane with typed API
- Add Gateway as central control plane
- WebSocket protocol for real-time communication
- Session-based architecture
- Device pairing and authentication
- Request/Response/Event wire protocol
- Remote access patterns (Tailscale/SSH tunnel)

### 2. **Agent Loop & Tool System** (NEW)
**From OpenClaw**: Agentic loop with tool orchestration
- Entry points (RPC, CLI)
- Agent loop lifecycle: intake → context assembly → inference → tool execution → streaming
- Tool contracts with input/output schemas
- Hook system: before_tool_call, after_tool_call, agent_start, agent_end
- Queue modes: steer, followup, collect
- Session serialization and concurrency control

### 3. **Session Management** (ENHANCE)
**From OpenClaw**: Session-per-conversation with lifecycle
- Session keys: `job:<jobId>:<stage>`
- Session lifecycle: new → analyzing → tailoring → compiled → applied → closed
- Session pruning (in-memory tool result trimming)
- Compaction (summarization when context window fills)
- Daily/idle reset policies
- Session origin metadata

### 4. **Memory System** (NEW)
**From OpenClaw**: Markdown-based memory with vector search
- `memory/YYYY-MM-DD.md` - Daily logs (append-only)
- `MEMORY.md` - Curated long-term memory
- Vector search with hybrid (BM25 + vector)
- Automatic memory flush before compaction
- Session memory search (optional)
- SQLite vector acceleration (sqlite-vec)

### 5. **Bootstrap Files Pattern** (NEW)
**From OpenClaw**: Workspace context injection
- `AGENTS.md` - Operating instructions + memory
- `SOUL.md` - Persona, boundaries, tone
- `TOOLS.md` - Tool usage conventions
- `IDENTITY.md` - Agent name/vibe/emoji
- `USER.md` - User profile + preferred address
- `BOOTSTRAP.md` - First-run ritual
- File size limits and truncation

### 6. **Configuration Layering** (ENHANCE)
**From OpenClaw**: Layered config with precedence
1. Environment variables (highest)
2. Local config (./.applypilot/config.local.json)
3. Project config (./.applypilot/config.json)
4. User config (~/.config/applypilot/config.json)
5. System config (/etc/applypilot/config.json)
6. Defaults (lowest)

### 7. **Plugin Architecture** (NEW)
**From OpenClaw**: Extensible plugin system
- Plugin manifest format (openclaw.plugin.json)
- Plugin discovery precedence
- Plugin slots (exclusive categories)
- Plugin hooks (lifecycle events)
- Skills system (AgentSkills-compatible)
- Tool registration
- CLI command registration
- Gateway RPC methods

### 8. **Wizard Onboarding** (NEW)
**From OpenClaw**: CLI wizard for setup
- `applypilot onboard` command
- QuickStart vs Advanced modes
- Model/auth configuration
- Workspace initialization
- Health check verification
- Daemon installation (launchd/systemd)

### 9. **Security Model** (ENHANCE)
**From OpenClaw**: Pairing and trust
- Device pairing for new connections
- Local auto-approval (loopback)
- Token-based auth for remote
- DM scope policies (main, per-peer, per-channel-peer)
- Review gate (stop before submit)
- Exec approvals for elevated commands

### 10. **Streaming & Real-time** (NEW)
**From OpenClaw**: Event streaming architecture
- WebSocket events for job progress
- Block streaming (completed blocks)
- Token streaming (Telegram draft)
- Tool execution events
- Lifecycle events (start, end, error)
- Chunking algorithm (paragraph → newline → sentence)

### 11. **System Prompt Assembly** (NEW)
**From OpenClaw**: Dynamic prompt building
- Tool list + descriptions
- Skills list (metadata only)
- Workspace location
- Time/timezone
- Runtime metadata
- Injected bootstrap files
- Prompt modes (full, minimal, none)

### 12. **Context & Compaction** (NEW)
**From OpenClaw**: Context window management
- Context breakdown reporting
- Auto-compaction when window fills
- Manual compaction (/compact)
- Compaction vs pruning distinction
- Reserve tokens floor

### Implementation Steps:

**Phase 1: Core Architecture**
1. Add Gateway Architecture section
2. Add Agent Loop & Tool System section
3. Add Session Management section
4. Update Data Model with session keys

**Phase 2: Memory & Context**
5. Add Memory System section
6. Add Bootstrap Files section
7. Add Context & Compaction section
8. Add System Prompt Assembly section

**Phase 3: Extensibility**
9. Add Plugin Architecture section
10. Add Skills System section
11. Add Configuration Layering section

**Phase 4: UX & Security**
12. Add Wizard Onboarding section
13. Enhance Security Model section
14. Add Streaming & Real-time section
15. Update Milestones with new patterns

### Key Files to Update:
- `Doc/Prd.md` - Main PRD document

### New Concepts from OpenClaw:
- Gateway WebSocket API with typed protocol
- Session keys and lifecycle management
- Tool contracts with hook points
- Memory system (Markdown + vector search)
- Bootstrap files for context injection
- Configuration layers with precedence
- Plugin architecture with slots
- Skills system (AgentSkills-compatible)
- Wizard onboarding flow
- Security model (pairing, tokens, DM scope)
- Event streaming and block chunking
- System prompt assembly
- Context compaction and pruning