# OpsinTech Platform

[中文](./README_zh.md) | English

[![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white)](./backend/pyproject.toml)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](./Makefile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Built on DeerFlow](https://img.shields.io/badge/Built_on-DeerFlow-8A2BE2)](https://github.com/bytedance/deer-flow)

OpsinTech is an **AI-Native Operations Platform for production environments**. v1.0 is built on [DeerFlow](https://github.com/bytedance/deer-flow)'s Agent runtime (ByteDance, GitHub Trending #1), with multi-tenancy, RBAC, audit logging, visual admin dashboards, and database-driven configuration layered on top.

> **Our mission: turn AI Agents from impressive demos into governed, enterprise-ready platforms.**

## Table of Contents

- [Platform Features](#platform-features)
- [Why OpsinTech Exists](#why-opsintech-exists)
- [v1.0 — What We Built](#v10--what-we-built)
- [Our Vision](#our-vision)
- [Roadmap](#roadmap)
- [Quick Start](#quick-start)
- [Supported Models](#supported-models)
- [Internationalization](#internationalization)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

## Platform Features

OpsinTech transforms AI Agents into a governed production platform with the following capabilities:

### 🏠 Multi-Tenancy Workspace
A unified workspace with three-tier resource isolation (`user → tenant → global`). Each user gets a personal tenant on registration, and tenant admins manage members, models, tools, and skills independently.

**Modules:**
- **Overview** — Dashboard with key metrics and quick actions
- **Agent Gallery** — Browse and select AI agents for different tasks
- **Chat Workspace** — Conversational AI interface with artifact management
- **Terminal Agent** — Governed terminal with AI-assisted command execution, asset management, and approval workflows
- **Skill Editor** — Create, edit, and test AI Skills with sandbox testing and AI-assisted instruction generation
- **Incident Management** — Alert ingestion, signal analysis, and incident lifecycle tracking

### 🤖 Agent Capabilities

| Capability | Description |
|---|---|
| **Chat Agent** | Conversational AI with task decomposition, sub-agent parallelism, and artifact generation |
| **Terminal Agent** | AI-assisted terminal with security governance, command approval, and multi-host asset management |
| **Skill System** | Reusable AI Skill templates with sandbox testing environment |
| **MCP Servers** | Configurable MCP servers per tenant (stdio/SSE/HTTP transports) |
| **Sandbox Execution** | Isolated code execution (local / Docker / Kubernetes modes) |

### 🔐 Security & Governance

| Feature | Description |
|---|---|
| **RBAC** | Three-tier roles: `platform_admin` / `tenant_admin` / `tenant_member` |
| **Audit Trail** | Full operation audit logging with per-tenant isolation |
| **Terminal Security** | Command approval workflows, credential management, execution audit |
| **User Management** | Status management (active / suspended), mandatory password rotation |

### 🌐 Platform Administration

| Dashboard | Scope |
|---|---|
| **Platform Admin** | Users, tenants, global audit, model templates, announcements |
| **Tenant Admin** | Members, models, tools, skills, MCP servers |

### 🎨 User Experience

- **4-Language i18n**: English, 中文, 日本語, 한국어
- **Model Provider Templates**: 20+ pre-configured providers with auto-filled settings
- **Docker One-Click Deploy**: `make up` to get everything running
- **Hot-Reload Dev Mode**: `make dev` for local development

---

## Why OpsinTech Exists

### DeerFlow: A Proven Agent Runtime

DeerFlow proved that AI Agents can go beyond chat — they can plan, decompose tasks, execute code in isolated sandboxes, and produce real files and deliverables. Sub-agent parallelism, persistent memory, sandbox isolation — these capabilities earned it 37K+ GitHub stars, and deservedly so.

### From Agent Runtime to Production Platform

DeerFlow excels as an Agent runtime and developer toolkit. OpsinTech builds on top of it to address what teams need when moving from evaluation to production:

| Scenario | DeerFlow | OpsinTech Enhancement |
|---|---|---|
| **Team Collaboration** | Single-user mode | Multi-tenancy with `user → tenant → global` isolation |
| **Access Control** | No role-based permissions | RBAC with `platform_admin` / `tenant_admin` / `tenant_member` |
| **Model Configuration** | Hand-edited YAML files | 20+ provider templates in admin UI, database-backed, per-tenant assignment |
| **Administration** | Command-line scripts only | Visual admin dashboards for both platform and tenant levels |
| **Audit & Compliance** | No operation traceability | Full audit trail for all operations, per-tenant isolation |
| **Skills & MCP** | Functional runtime, manual setup | Per-tenant management via admin UI, lifecycle tracking |
| **Security Governance** | Basic sandbox isolation | User status management, mandatory password rotation, operation audit |
| **Onboarding** | Configuration-heavy, steep learning curve | Docker one-command deploy, admin UI-driven setup |

### Our Approach

We're not starting from scratch. DeerFlow's Agent runtime is one of the most mature in open source, and for v1.0 we chose to inherit it — then layer on what teams need to use it in production.

**Short-term (v1.x)**: Keep DeerFlow's runtime, add the governance layer — multi-tenancy, RBAC, audit, admin dashboards, database-backed config, model provider templates.

**Long-term (v2.x+)**: Gradually replace DeerFlow internal dependencies with our own architecture, incorporating real operations scenarios — alert ingestion, incident management, workflow orchestration, governed terminals — to form a true AI-Native Operations Platform.

## v1.0 — What We Built

### Multi-Tenancy & RBAC

- **Three-tier resource isolation**: `user → tenant → global`, strict data separation
- **Two admin dashboards**: Platform admin (users, tenants, audit, model templates) + Tenant admin (members, models, tools, skills)
- **Auto-created personal tenant** on registration, zero manual setup
- Roles: `platform_admin` / `tenant_admin` / `tenant_member`

### Model Management, Done Right

- **20+ provider templates** in the admin UI — dropdown to select, auto-fills provider class, base URL, and capability flags. No LangChain class paths to memorize
- Models stored in database, assigned per-tenant, with active / deprecated / retired lifecycle
- Providers: OpenAI · Anthropic · DeepSeek · Azure OpenAI · Gemini · Ollama · OpenRouter · Groq · Together AI · SiliconFlow · DashScope · Zhipu · Moonshot · MiniMax · Baichuan · 01.AI · Volcengine Ark · Novita AI

### Terminal Agent

- **Governed Terminal Execution**: AI-assisted command execution with security policies
- **Multi-Host Asset Management**: Register and manage multiple target hosts
- **Command Approval Workflow**: Security review and approval before execution
- **Audit Trail**: Every command and its output is logged and auditable
- **Skill Integration**: Save terminal sessions as reusable Skills

### Skill System

- **Skill Editor**: Full-featured editor with Markdown instruction editing
- **AI-Assisted Generation**: Describe what you want, AI generates structured instructions
- **Sandbox Testing**: Test Skills in a safe mock environment before production use
- **Per-Tenant Management**: Skills scoped to personal, tenant, or global levels

### Incident Management

- **Alert Ingestion**: Webhook / Alertmanager integration
- **Signal Analysis**: Raw alerts processed into structured signals
- **Incident Lifecycle**: Track incidents from creation to resolution
- **AI Analysis**: Automated incident context assembly and root cause analysis

### Audit & Security

- Full audit trail for all operations, per-tenant isolation
- User status management (active / suspended)
- Mandatory password change on first login

### Internationalization

- UI supports 4 languages: English, 中文, 日本語, 한국어
- Auto-detects browser language preference with manual switcher

### Deployment & Operations

- **Docker one-command deploy**: `docker compose up -d`
- Artifact management: browse, preview, download all agent-generated files
- Platform announcement system with tenant/role targeting

## Our Vision

OpsinTech is not "DeerFlow with a dashboard." We're building a **secure, governed, AI-Native Operations Platform for production environments**.

On this platform, Agents don't just chat and generate code — they operate within boundaries: permission controls, audit records, execution approvals. Starting from Agent conversations, progressively extending into alerting, incidents, workflows, and terminal execution, ultimately forming a complete chain:

> **Discover → Understand → Decide → Execute → Audit**

This space is almost entirely vacant in open source. That's why we need community voices.

**Who we're looking for**: If you work in operations, security, compliance, or platform engineering, and you're excited by AI Agents but can't use them in production because of missing governance and security — you're exactly who we're building for. Your pain points and suggestions are OpsinTech's roadmap.

## Roadmap

```
✅ v1.0 (Current) — Governable AI Agent Platform
  ├─ Multi-tenancy + RBAC + Audit
  ├─ 20+ model provider templates, database-backed
  ├─ Visual admin dashboards (platform + tenant)
  ├─ Terminal Agent with security governance
  ├─ Skill System with sandbox testing
  └─ Docker one-command deploy

🔜 v1.1 — Smart Alerting
  ├─ Webhook / Alertmanager ingestion
  ├─ Raw Alert → Signal → Incident pipeline
  ├─ AI-powered summaries and context assembly
  └─ Incident-to-workspace context linking

🔜 v1.2 — Workflows + Terminal
  ├─ Event-driven workflow engine
  ├─ SOP templates (service restart, log collection, health checks)
  ├─ Governed terminal execution + audit trail
  └─ Full closed loop: Alert → Incident → Workflow → Terminal → Audit

📋 v2.0 — Digital Operators & Ecosystem
  ├─ Custom Agents: SOUL.md + tool_groups whitelist + Skill/Workflow binding
  ├─ Auto-route alerts to agent operators
  ├─ Skill marketplace: community contributions + official scenarios
  ├─ AI Analysis Workbench: data analysis, reports, PPT generation
  └─ Gradual replacement of DeerFlow internals with our own architecture
```

## Quick Start

1. **Clone and configure**

   ```bash
   git clone https://github.com/opsintech/opsintech-platform.git
   cd opsintech-platform
   make config
   ```

   Generates `config.yaml` with platform-level settings (database, sandbox, tool groups). **No model configuration needed.**

2. **Start and log in**

   ```bash
   make up
   ```

   Open http://localhost:2026. On first visit, you'll be redirected to the Setup Wizard to set your admin email and password.

   > You can also use `docker compose up -d`, but `make up` handles config initialization and secret generation automatically.

3. **Add models via admin UI**

   Log in as platform admin, go to **Settings → Models**, pick from 20+ provider templates, enter your API key.

   > Models are stored in the database. Do **not** configure models in `config.yaml` for production.

### Running Options

**Docker production**:
```bash
make up              # Build images and start all services (recommended for first deploy)
make up-nobuild      # Start services without rebuilding images
make down            # Stop and remove containers
make rebuild-images  # Remove all OpsinTech images and rebuild from scratch
```

**Local development**:
```bash
make check           # Verify prerequisites (Node.js 22+, pnpm, uv, nginx)
make install         # Install dependencies
make dev             # Start dev servers (with hot-reload)
make stop            # Stop all services
```

**Docker development**:
```bash
make docker-init     # Pull sandbox image
make docker-start    # Start Docker dev services
make docker-stop     # Stop Docker dev services
make docker-logs     # View all logs
```

Access: http://localhost:2026

### China Users: Preparing Images

In China, pulling base images during Docker builds may fail due to network issues. Pre-pull before building:

```bash
# Required images
docker pull python:3.12-slim
docker pull node:22-alpine
docker pull nginx:alpine
docker pull docker:cli

# Build-stage dependency
docker pull ghcr.io/astral-sh/uv:0.9.26

# Optional images
docker pull postgres:16-alpine          # PostgreSQL mode
docker pull enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest  # Sandbox
```

For mirror accelerator setup, see the [Quick Start Guide](QUICKSTART.md#china-users-preparing-images-for-local-builds).

### Advanced

#### Sandbox Mode

Three execution modes: Local / Docker containers / Docker + Kubernetes. See [Sandbox Guide](backend/docs/CONFIGURATION.md#sandbox).

#### MCP Server

Configurable MCP servers (managed per-tenant via admin UI). Supports stdio/SSE/HTTP transports with OAuth token flows.

## Supported Models

| Category | Providers |
|---|---|
| **Global Leaders** | OpenAI · Anthropic · DeepSeek · Azure OpenAI · Gemini |
| **Aggregators** | OpenRouter · Groq · Together AI |
| **Self-Hosted** | Ollama |
| **China-Based** | DashScope · Zhipu · Moonshot · MiniMax · Baichuan · 01.AI · Volcengine Ark · SiliconFlow |
| **Other** | Novita AI · Any OpenAI-compatible provider |


## Documentation

- [5-Minute Quick Start](QUICKSTART.md)
- [Configuration Guide](backend/docs/CONFIGURATION.md)
- [Architecture Overview](backend/docs/ARCHITECTURE.md)
- [API Reference](backend/docs/API.md)
- [Contributing Guide](CONTRIBUTING.md)

## Contributing

We welcome contributions — code, documentation, scenario suggestions, or real-world pain points. Open an Issue or PR.

## License

MIT License. See [LICENSE](./LICENSE).

## Acknowledgments

### DeerFlow

v1.0 is built on [DeerFlow](https://github.com/bytedance/deer-flow) (by ByteDance). DeerFlow's Agent runtime — LangGraph orchestration, sub-agent parallelism, sandboxed execution, persistent memory — is one of the best Agent infrastructures in open source. Deep gratitude to the DeerFlow team and community.

**Our relationship with DeerFlow**: In v1.x, we inherit DeerFlow's Agent runtime and add governance. As we evolve, we'll gradually replace internal dependencies and form our own architecture. OpsinTech's long-term identity is not a DeerFlow fork — it's an independent, operations-focused AI-Native platform.

### Open-Source Community

- [LangChain](https://github.com/langchain-ai/langchain)
- [LangGraph](https://github.com/langchain-ai/langgraph)
- [Next.js](https://nextjs.org/)
