# OpsinTech Platform

[English](./README.md) | 中文

[![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white)](./backend/pyproject.toml)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](./Makefile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Built on DeerFlow](https://img.shields.io/badge/Built_on-DeerFlow-8A2BE2)](https://github.com/bytedance/deer-flow)

OpsinTech 是一个 **面向生产环境的 AI-Native 运维平台**，当前 v1.0 基于 [DeerFlow](https://github.com/bytedance/deer-flow)（字节跳动开源，GitHub Trending #1）的 Agent 运行时构建，在其之上增加了多租户、RBAC 权限、审计日志、可视化管理后台和数据库驱动的配置管理。

> **我们的使命：让 AI Agent 从炫酷 Demo 走向企业可治理的生产平台。**

## 目录

- [平台功能概览](#平台功能概览)
- [为什么有 OpsinTech](#为什么有-opsintech)
- [v1.0 — 我们做了什么](#v10--我们做了什么)
- [我们致力于什么](#我们致力于什么)
- [产品路线图](#产品路线图)
- [快速开始](#快速开始)
- [支持的模型](#支持的模型)
- [国际化](#国际化)
- [文档](#文档)
- [参与贡献](#参与贡献)
- [许可证](#许可证)
- [致谢](#致谢)

## 平台功能概览

OpsinTech 将 AI Agent 转变为可治理的生产平台，具备以下能力：

### 🏠 多租户工作台
统一工作空间，实现三层资源隔离（`user → tenant → global`）。注册即自动创建个人租户，租户管理员可独立管理成员、模型、工具和 Skill。

**功能模块：**
- **总览面板** — 关键指标仪表盘与快捷操作入口
- **Agent 市场** — 浏览和选择不同任务的 AI Agent
- **对话工作台** — 对话式 AI 交互，支持产物管理
- **智能终端** — 受控终端，AI 辅助命令执行，资产管理，审批工作流
- **Skill 编辑器** — 创建、编辑、测试 AI Skill，支持沙盒演练和 AI 辅助指令生成
- **事件管理** — 告警接入、信号分析、事件生命周期追踪

### 🤖 Agent 能力

| 能力 | 说明 |
|---|---|
| **对话 Agent** | 对话式 AI，支持任务拆解、Sub-Agent 并行、产物生成 |
| **智能终端 Agent** | AI 辅助终端，安全治理、命令审批、多主机资产管理 |
| **Skill 系统** | 可复用的 AI Skill 模板，配备沙盒测试环境 |
| **MCP Server** | 按租户配置 MCP Server（stdio/SSE/HTTP 传输） |
| **沙盒执行** | 隔离代码执行环境（本地 / Docker / Kubernetes 模式） |

### 🔐 安全与治理

| 功能 | 说明 |
|---|---|
| **RBAC 权限** | 三级角色：`platform_admin` / `tenant_admin` / `tenant_member` |
| **审计日志** | 全操作审计记录，按租户隔离 |
| **终端安全** | 命令审批工作流、凭证管理、执行审计 |
| **用户管理** | 状态管理（active / suspended）、强制密码修改 |

### 🌐 平台管理

| 管理面板 | 管理范围 |
|---|---|
| **平台管理后台** | 用户、租户、全局审计、模型模板、公告 |
| **租户管理后台** | 成员、模型、工具、Skill、MCP Server |

### 🎨 用户体验

- **4 语言国际化**：English、中文、日本語、한국어
- **模型厂商模板**：20+ 预配置厂商，下拉选择自动填充
- **Docker 一键部署**：`make up` 即可启动全部服务
- **热重载开发模式**：`make dev` 本地开发

---

## 为什么有 OpsinTech

### DeerFlow：经过验证的 Agent 运行时

DeerFlow 证明了 AI Agent 不只停留在聊天框里——它能规划、能拆解任务、能在隔离沙箱里执行代码、能产出真正的文件和工作成果。Sub-Agent 并行编排、持久化 Memory、Sandbox 隔离，这些技术能力让它在一众 Agent 项目中脱颖而出，37K+ GitHub stars 实至名归。

### 从 Agent 运行时到生产平台

DeerFlow 作为 Agent 运行时和开发者工具表现出色。OpsinTech 在此基础上构建，解决团队从评估阶段走向生产环境时所需的能力：

| 场景 | DeerFlow | OpsinTech 增强 |
|---|---|---|
| **团队协作** | 单用户模式 | 多租户，`user → tenant → global` 三层隔离 |
| **权限控制** | 无角色权限体系 | RBAC：`platform_admin` / `tenant_admin` / `tenant_member` |
| **模型配置** | 手写 YAML 文件 | 管理后台 20+ 厂商模板，数据库存储，按租户分配 |
| **平台管理** | 仅命令行脚本 | 可视化管理后台（平台管理 + 租户管理） |
| **审计合规** | 无操作可追溯性 | 全操作审计日志，按租户隔离 |
| **Skill 与 MCP** | 运行时可用，手动配置 | 管理后台按租户管理，生命周期追踪 |
| **安全治理** | 基础沙箱隔离 | 用户状态管理、强制密码修改、操作审计 |
| **上手体验** | 配置繁琐，学习曲线陡 | Docker 一键部署，管理后台驱动配置 |

### 我们的做法

我们不是另起炉灶。DeerFlow 的 Agent 运行时是目前开源领域最成熟的之一，我们在 v1.0 阶段选择继承它——然后在上面叠加团队生产使用所需的能力。

**短期（v1.x）**：基于 DeerFlow 的运行时，补上治理层——多租户、RBAC、审计、管理后台、数据库配置、模型接入产品化。

**长期（v2.x+）**：逐步将 DeerFlow 的内部依赖替换为我们自己的架构，融入更多真实运维场景——告警接入、事件管理、工作流编排、受控终端——形成一个真正的 AI-Native 运维平台。

## v1.0 — 我们做了什么

### 多租户与角色权限

- **三层资源隔离**：`user → tenant → global`，数据严格隔离，跨租户零泄漏
- **两层管理面板**：平台管理员管理全局（用户、租户、审计、模型模板），租户管理员管理本租户（成员、模型、工具、Skill）
- **注册即自动创建个人租户**，零手动配置
- 角色：`platform_admin` / `tenant_admin` / `tenant_member`

### 模型管理产品化

- **20+ 厂商模板**：在管理后台下拉选择厂商，自动填充 provider 类、base_url、能力标签，不再需要手填 LangChain 类路径
- 模型配置存储在数据库，按租户分配，支持 active / deprecated / retired 生命周期管理
- 厂商覆盖：OpenAI · Anthropic · DeepSeek · Azure OpenAI · Gemini · Ollama · OpenRouter · Groq · Together AI · SiliconFlow · DashScope（百炼）· 智谱 · Moonshot · MiniMax · 百川 · 零一万物 · 火山方舟 · Novita AI

### 智能终端 Agent

- **受控终端执行**：AI 辅助命令执行，配合安全策略管控
- **多主机资产管理**：注册和管理多个目标主机
- **命令审批工作流**：执行前安全审查和人工审批
- **审计留痕**：每条命令及其输出完整记录，可追溯
- **Skill 集成**：将终端会话保存为可复用的 Skill

### Skill 系统

- **Skill 编辑器**：功能完整的编辑器，支持 Markdown 指令编辑
- **AI 辅助生成**：描述你的需求，AI 自动生成结构化执行指令
- **沙盒测试**：在生产使用前，在安全的模拟环境中测试 Skill
- **按租户管理**：Skill 作用域支持个人、租户、全局三个级别

### 事件管理

- **告警接入**：Webhook / Alertmanager 集成
- **信号分析**：原始告警处理为结构化信号
- **事件生命周期**：追踪事件从创建到解决的全过程
- **AI 分析**：自动化事件上下文拼装和根因分析

### 审计与安全合规

- 全操作审计日志，按租户隔离
- 用户状态管理（active / suspended）
- 首次登录强制修改密码

### 国际化

- UI 支持 4 种语言：English、中文、日本語、한국어
- 自动检测浏览器语言偏好，同时提供手动切换入口

### 部署与运维

- **Docker 一键部署**：`docker compose up -d`
- 产物管理：浏览、预览、下载所有 Agent 生成文件
- 平台公告系统：按租户/角色定向推送运营通知

## 我们致力于什么

OpsinTech 的目标不是做一个「有后台的 DeerFlow」。我们要做的是一个 **面向生产环境的安全、可治理的 AI-Native 运维平台**。

在这个平台上，Agent 不只是能聊天和生成代码——它会被放在一个受管控的环境里：有权限边界、有审计记录、有执行审批。从 Agent 对话开始，逐步延伸到告警、事件、工作流、终端执行，最终形成一条完整的链路：

> **发现 → 理解 → 决策 → 执行 → 审计**

这个市场在开源领域几乎是空白。这也是为什么我们需要社区的声音。

**我们在找什么样的人**：如果你在运维、安全、合规、平台工程领域，被 AI Agent 的能力吸引，但又因为缺少治理和安全保障而不敢在生产环境使用——你就是我们要找的人。你的痛点和建议，就是 OpsinTech 的路线图。

## 产品路线图

```
✅ v1.0 (当前) — 可治理的 AI Agent 平台
  ├─ 多租户 + RBAC + 审计
  ├─ 20+ 模型厂商模板，数据库存储
  ├─ 可视化管理后台（平台管理 + 租户管理）
  ├─ 智能终端 Agent，安全治理
  ├─ Skill 系统，沙盒测试
  └─ Docker 一键部署

🔜 v1.1 — 智能告警
  ├─ Webhook / Alertmanager 告警接入
  ├─ Raw Alert → Signal → Incident 处理管线
  ├─ AI 摘要与上下文拼装
  └─ 事件到工作台的上下文跳转

🔜 v1.2 — 工作流 + 终端
  ├─ 事件驱动工作流引擎
  ├─ SOP 模板（服务重启、日志收集、健康检查）
  ├─ 受控终端执行 + 审计留痕
  └─ 完整闭环：告警 → 事件 → 工作流 → 终端 → 审计

📋 v2.0 — 数字人与生态
  ├─ Custom Agent（数字人）：SOUL.md + tool_groups 白名单 + Skill/Workflow 绑定
  ├─ 告警自动路由到数字人处理
  ├─ Skill 市场：社区贡献 & 官方场景 Skill
  ├─ 智能分析台：数据分析、周报、PPT 生成
  └─ 逐步替换 DeerFlow 内部依赖，形成自有架构
```

## 快速开始

### 配置

1. **克隆仓库**

   ```bash
   git clone https://github.com/opsintech/opsintech-platform.git
   cd opsintech-platform
   ```

2. **生成本地配置文件**

   ```bash
   make config
   ```

   生成 `config.yaml`（平台级配置：数据库、sandbox、工具组等），**不需要手动配置模型**。

3. **启动并登录**

   ```bash
   make up
   ```

   打开 http://localhost:2026。首次访问会自动跳转到初始化向导，设置管理员邮箱和密码后即可登录。

   > 也可以使用 `docker compose up -d`，但 `make up` 会自动处理配置文件初始化和密钥生成。

4. **在管理后台添加模型**

   以平台管理员身份登录，进入 **设置 → 模型管理**，从 20+ 厂商模板中选择，填入 API Key。

   > 模型配置存储在数据库中，生产环境**不要**在 `config.yaml` 中配置模型。

### 运行方式

**Docker 生产部署**：
```bash
make up              # 构建镜像并启动全部服务（首次部署推荐）
make up-nobuild      # 使用已有镜像启动（不重新构建）
make down            # 停止并移除容器
make rebuild-images  # 删除所有 OpsinTech 镜像并重新构建
```

**本地开发**：
```bash
make check           # 校验依赖环境（Node.js 22+、pnpm、uv、nginx）
make install         # 安装依赖
make dev             # 启动开发服务器（支持热重载）
make stop            # 停止所有服务
```

**Docker 开发环境**：
```bash
make docker-init     # 拉取沙箱镜像
make docker-start    # 启动 Docker 开发服务
make docker-stop     # 停止 Docker 开发服务
make docker-logs     # 查看全部日志
```

访问地址：http://localhost:2026

### 国内用户：本地构建镜像准备

在国内网络环境下，构建 Docker 镜像时需从海外拉取基础镜像，建议提前准备：

```bash
# 必需镜像
docker pull python:3.12-slim
docker pull node:22-alpine
docker pull nginx:alpine
docker pull docker:cli

# 构建阶段依赖
docker pull ghcr.io/astral-sh/uv:0.9.26

# 可选镜像
docker pull postgres:16-alpine          # PostgreSQL 模式
docker pull enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest  # 沙箱
```

如果拉取速度较慢，可配置 Docker 镜像加速器，详见 [快速开始指南](QUICKSTART_zh.md#国内用户本地构建镜像准备)。

### 进阶配置

#### Sandbox 模式

支持三种执行模式：本地执行 / Docker 隔离容器 / Docker + Kubernetes。

见 [Sandbox 配置指南](backend/docs/CONFIGURATION.md#sandbox)。

#### MCP Server

支持可配置的 MCP Server（按租户管理后台配置），支持 stdio/SSE/HTTP 传输和 OAuth token 流程。

## 支持的模型

| 类别 | 厂商 |
|---|---|
| **国际主流** | OpenAI · Anthropic · DeepSeek · Azure OpenAI · Gemini |
| **聚合平台** | OpenRouter · Groq · Together AI |
| **本地/自部署** | Ollama |
| **国内平台** | DashScope（百炼）· 智谱 · Moonshot · MiniMax · 百川 · 零一万物 · 火山方舟 · SiliconFlow |
| **其他** | Novita AI · 任何 OpenAI 兼容厂商 |


## 文档

- [5 分钟快速开始](QUICKSTART_zh.md)
- [配置指南](backend/docs/CONFIGURATION.md)
- [架构概览](backend/docs/ARCHITECTURE.md)
- [API 参考](backend/docs/API.md)
- [贡献指南](CONTRIBUTING.md)

## 参与贡献

我们非常欢迎社区贡献——无论是代码、文档、场景建议，还是你在实际使用中遇到的问题。欢迎通过 Issue 或 PR 参与。

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。

## 致谢

### DeerFlow

本项目 v1.0 基于 [DeerFlow](https://github.com/bytedance/deer-flow)（by ByteDance）构建。DeerFlow 的 Agent 运行时——LangGraph 编排、Sub-Agent 并行、Sandbox 执行、持久化 Memory——是当前开源领域最出色的 Agent 基础设施之一。感谢 DeerFlow 团队和社区。

**我们与 DeerFlow 的关系**：v1.0 阶段，我们继承 DeerFlow 的 Agent 运行时并补上治理层。随着版本演进，我们将逐步替换内部依赖，形成自己的架构体系。OpsinTech 的长期定位不是 DeerFlow 的 fork，而是一个独立的、面向生产运维场景的 AI-Native 平台。

### 开源社区

- [LangChain](https://github.com/langchain-ai/langchain)
- [LangGraph](https://github.com/langchain-ai/langgraph)
- [Next.js](https://nextjs.org/)
