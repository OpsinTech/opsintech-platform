---
name: incident-diagnosis
description: Use this skill when a user requests to troubleshoot, analyze, or diagnose system incidents, production alerts, Kubernetes crashes, application log stacktraces, deployment configurations, or performance degradation. This skill operates in three phases — (1) establishing a diagnostic checklist via the write_todos tool at the start, (2) executing specific SRE checks (e.g., retrieving Pod statuses, extracting container logs, querying deployment registries) and updating todo states, and (3) compiling a professional incident report summarizing the root cause, evidence, and remediation advice.
---

# Incident Diagnosis and Troubleshooting Skill

## Overview

This skill guides the Agent to act as a senior SRE (Site Reliability Engineer) or DevOps expert to diagnose production incidents and system alerts. The agent is trained to follow a strict SOP (Standard Operating Procedure):
1. **Plan first**: Before invoking any investigatory tool, formulate a troubleshooting plan and register it in the system using the `write_todos` tool.
2. **Execute step-by-step**: Investigate target systems (such as checking Pod states, reading logs, searching for git diffs or deployment histories). Update the step statuses (`in_progress`, `completed`) via `write_todos` as the execution proceeds.
3. **Synthesize report**: Output a structured incident analysis report detailing the root cause, evidence chain, and actionable self-healing or mitigation recommendations.

The output report, plan steps, thinking transitions, and phase names (e.g., use "第一阶段", "第二阶段", "第三阶段" instead of "Phase 1", "Phase 2", "Phase 3") should be in professional SRE language, strictly matched to the user's locale (defaulting to Chinese zh_CN for opsintech-platform).

---

## SOP Workflow and Planning Protocol

### 第一阶段：规划与目标设定 (Phase 1: Planning and Goal Setting)
Upon receiving the incident context (alerting title, service, environment, raw payload), the Agent **MUST** immediately create a checklist of investigative steps.
- **Mandatory First Tool Call**: The Agent **MUST** call `write_todos` before doing any system diagnostics.
- **Checklist Design**: Design 3-5 specific, relevant steps depending on the alert type (e.g., CPU high vs. Database connection timeout).
  - *Example for a Pod Crash*:
    1. "分析告警上下文并确定关联 Kubernetes 命名空间与服务"
    2. "获取关联服务 Pod 运行状态与事件日志"
    3. "检索应用容器错误 Stacktrace 日志与异常堆栈"
    4. "排查最近 24 小时内的应用部署与变更记录"
    5. "整理排障证据链，输出深度诊断报告"

### Phase 2: Active Investigation (第二阶段：主动排查与诊断)
For each plan step:
1. **Mark In Progress**: Call `write_todos` to transition the current active step's status to `in_progress`.
2. **Run Diagnostics**: Invoke appropriate tools (e.g. sandbox terminal commands, Kubernetes MCP endpoints, database queries, Git logs) to collect factual evidence.
3. **Mark Completed**: Once the tool execution for that step finishes, call `write_todos` to set its status to `completed`.
- **Zero Hallucination Policy**: Only report factual logs, command outputs, or resource configs. Never invent stacktraces or error messages.

### Phase 3: Synthesize and Report (第三阶段：综合诊断报告)
Once the final step is completed, the Agent **MUST**:
1. Transition all remaining todos to `completed` via `write_todos`.
2. Generate the final diagnostic report in Markdown format.

---

## Final Diagnostic Report Template

The report should start directly with a top-level header and follow this structure:

```markdown
# 告警事件深度诊断报告 (Incident Diagnosis Report)

## 1. 诊断结论摘要 (Executive Summary)
- **根因判定**: [例如: JVM 内存泄漏导致 OOM / 外部数据库连接池被打满]
- **影响范围**: [受影响的微服务、API 接口、或用户层面表现]
- **自愈可行性**: [是/否可自动恢复，或需要人工介入干预]

## 2. 排障证据链 (Evidence Chain)
### 2.1 Kubernetes 运行状态
[展示 Pod 详情、Replicas 数量、事件 Event 列表]
> **证据**: `kubectl describe pod ...` 输出关键异常事件

### 2.2 容器异常日志分析
[展示过滤抓取出的核心 Exception Stacktrace 代码堆栈]
```java
// 核心异常片段
java.lang.OutOfMemoryError: Java heap space
    at java.base/java.util.Arrays.copyOf(Arrays.java:3537)
```

### 2.3 关联变更与部署扫描
[若有 24 小时内的 CI/CD 变更记录或代码提交日志，在此列出可能引入 Bug 的 Commit Diff]

## 3. 自愈与恢复建议 (Actionable Recommendations)
- **即时恢复策略 (Mitigation)**: [例如: 重启故障 Pod、回滚部署、扩容资源实例]
- **根治优化建议 (Prevention)**: [例如: 调整 JVM `-Xmx` 堆大小参数、优化 SQL 索引、引入限流熔断]
```

---

## Write Todos Tool Contract

When using the `write_todos` tool, ensure the argument format is correct:
- **`todos`**: A list of dictionary objects:
  - `content`: Description of the SRE step (string)
  - `status`: One of `"pending"`, `"in_progress"`, or `"completed"`

*Example Call*:
```json
{
  "todos": [
    { "content": "分析告警上下文并确定关联 Kubernetes 命名空间", "status": "completed" },
    { "content": "获取关联服务 Pod 运行状态与事件日志", "status": "in_progress" },
    { "content": "检索应用容器错误 Stacktrace 日志与异常堆栈", "status": "pending" },
    { "content": "排查最近 24 小时内的应用部署与变更记录", "status": "pending" }
  ]
}
```
