# 2026-03-31 OpsinTech 仓库与分支管理规范

## 1. 文档目标

本文档用于定义 DeerFlow 二次开发进入 OpsinTech 产品化阶段后的仓库管理方式、分支开发方式与操作步骤。

目标是解决以下问题：

1. 当前代码库直接 clone 自上游 DeerFlow，是否应该转为 OpsinTech 自有仓库。
2. 后续模块开发是否应该按分支推进。
3. 如何以最小成本建立稳定的研发协作与发布节奏。

---

## 2. 结论

**建议立即建立 OpsinTech 自有仓库，并切换为“主分支稳定 + 功能分支开发 + 审查后合并”的标准模式。**

原因如下：

1. 当前项目已经不是临时二开，而是在发展为独立产品。
2. 后续会持续引入租户化、智能告警、工作台、工作流、终端等模块。
3. 如果继续长期直接在 clone 下改动，后续会越来越难区分：
   - 哪些是 DeerFlow 原始逻辑
   - 哪些是 OpsinTech 的产品能力
   - 哪些是平台底层改造
   - 哪些是新模块开发
4. 提前切到自有仓库和分支流程，成本最低。

---

## 3. 推荐仓库策略

## 3.1 仓库归属

建议在 GitHub 组织 `opsintech` 下创建自有仓库。

建议仓库命名可选：

1. `opsintech-platform`
2. `opsintech-aiops`
3. `opsintech-core`
4. `opsintech-ops-platform`

如果当前产品方向明确偏智能运维平台，推荐：

**`opsintech-platform`**

---

## 4. 推荐分支模型

当前阶段不建议一开始做太重的 Git Flow。

推荐先采用最轻量、最实用的模型：

### 4.1 主分支

#### `main`

职责：

1. 保持相对稳定
2. 随时可部署
3. 所有正式模块开发合并后的主干

### 4.2 功能分支

#### `feature/*`

用途：

1. 每个模块或子模块独立开发

命名建议：

1. `feature/tenantization-foundation`
2. `feature/alerting-mvp`
3. `feature/workspace-v2`
4. `feature/workflow-engine`
5. `feature/terminal-governance`

### 4.3 修复分支

#### `fix/*`

用途：

1. 修线上或主干 bug

命名建议：

1. `fix/auth-login`
2. `fix/admin-rbac`
3. `fix/tenant-header`

### 4.4 文档分支

可选：

#### `docs/*`

如果后续文档改动很多，也可以单独使用。

---

## 5. 当前阶段推荐研发流程

建议采用以下流程：

1. `main` 上保持稳定
2. 从 `main` 切出 `feature/*`
3. 在功能分支中完成开发与自测
4. 提交 PR 或至少做代码审查
5. 合并回 `main`

不建议：

1. 长期直接在 `main` 上开发
2. 多个功能混在一个分支里
3. 边写边往主干直接推

---

## 6. 提交规范建议

当前阶段建议采用简单规范即可。

推荐前缀：

1. `feat:`
2. `fix:`
3. `docs:`
4. `refactor:`
5. `test:`
6. `chore:`

示例：

1. `chore: initialize OpsinTech platform from DeerFlow base`
2. `feat: add tenant context foundation`
3. `feat: implement incident ingestion api`
4. `fix: repair tenant membership validation`
5. `docs: add tenantization formal design`

---

## 7. 当前阶段推荐模块拆分

建议后续按模块独立开分支：

1. 用户体系与 tenant 化
   - `feature/tenantization-foundation`
2. 智能告警
   - `feature/alerting-mvp`
3. 智能工作台
   - `feature/workspace-incident`
   - `feature/analysis-workspace`
4. 智能工作流
   - `feature/workflow-engine`
5. 智能终端
   - `feature/terminal-governance`
6. 官网/营销站
   - `feature/marketing-site`

---

## 8. 是否保留上游 DeerFlow 关系

建议保留，但不要让它继续作为主开发仓库。

推荐 Git 远程配置方式：

1. `origin`
   - 指向 OpsinTech 自有仓库
2. `upstream`
   - 指向原 DeerFlow 仓库

这样好处是：

1. 你的日常开发都围绕自己的仓库展开
2. 如果以后需要参考或同步上游改动，仍有入口

---

## 9. 从当前仓库迁移到 OpsinTech 的操作步骤

下面按最实用方式写。

### Step 1：在 GitHub 组织中创建新仓库

在 `opsintech` 组织下新建一个空仓库。

例如：

1. 仓库名：`opsintech-platform`

创建时建议：

1. 不要勾选 README
2. 不要勾选 `.gitignore`
3. 不要勾选 license

保持空仓库即可。

---

### Step 2：检查当前仓库状态

在本地仓库根目录执行：

```bash
git status
git remote -v
```

目的：

1. 确认当前是否有未提交改动
2. 确认当前远程地址

如果当前还有大量未提交改动，建议先提交一版基线。

---

### Step 3：提交一版基线代码

建议先做一版初始化提交：

```bash
git add .
git commit -m "chore: initialize OpsinTech platform from DeerFlow base"
```

如果当前已经有本地提交，可以跳过这一步。

---

### Step 4：重命名或添加远程仓库

#### 方式 A：保留上游 DeerFlow 为 `upstream`

如果当前 `origin` 指向 DeerFlow，建议这样处理：

```bash
git remote rename origin upstream
git remote add origin git@github.com:opsintech/opsintech-platform.git
```

然后检查：

```bash
git remote -v
```

理想结果：

1. `origin` -> 你的仓库
2. `upstream` -> DeerFlow 原仓库

#### 方式 B：如果你不打算保留上游

```bash
git remote remove origin
git remote add origin git@github.com:opsintech/opsintech-platform.git
```

但我更推荐方式 A。

---

### Step 5：推送主分支到自有仓库

如果当前本地主分支名是 `main`：

```bash
git push -u origin main
```

如果当前本地还是 `master`，建议先统一成 `main`：

```bash
git branch -M main
git push -u origin main
```

---

### Step 6：从 `main` 切出第一个正式功能分支

我建议你的第一条正式分支就是：

```bash
git checkout -b feature/tenantization-foundation
git push -u origin feature/tenantization-foundation
```

因为用户体系和 tenant 化是接下来所有模块的底座。

---

## 10. 后续每个模块的标准开发步骤

以后每做一个模块，统一按这套步骤：

### 10.1 同步主分支

```bash
git checkout main
git pull origin main
```

### 10.2 切新分支

```bash
git checkout -b feature/alerting-mvp
```

### 10.3 开发并提交

```bash
git add .
git commit -m "feat: add incident ingestion and event model"
```

### 10.4 推送分支

```bash
git push -u origin feature/alerting-mvp
```

### 10.5 合并回主分支

如果走 GitHub PR：

1. 提交 PR
2. 审查后合并

如果暂时你一个人开发，也建议至少本地这样做：

```bash
git checkout main
git pull origin main
git merge --no-ff feature/alerting-mvp
git push origin main
```

然后可选删除分支：

```bash
git branch -d feature/alerting-mvp
git push origin --delete feature/alerting-mvp
```

---

## 11. 推荐的第一批分支顺序

建议按这个顺序推进：

1. `feature/tenantization-foundation`
2. `feature/alerting-mvp`
3. `feature/workspace-incident`
4. `feature/workflow-engine`
5. `feature/terminal-governance`

---

## 12. 推荐的发布节奏

当前阶段建议：

1. 每完成一个相对完整模块就合入 `main`
2. `main` 保持可运行
3. 不要积压超长生命周期分支

原因：

1. 你当前还处于架构持续演进阶段
2. 分支拉太长，后续冲突和漂移会明显增大

---

## 13. 当前阶段最小团队规范

即使暂时只有你一个人，也建议遵守：

1. 不直接在 `main` 上写功能
2. 一个功能一个分支
3. 重要改动先写设计文档
4. 合并前至少做一次自测
5. 尽量保证 `main` 随时可运行

---

## 14. 最终建议

对于当前 DeerFlow -> OpsinTech 的演进阶段，最合适的仓库策略就是：

1. 立即建立 `opsintech` 自有仓库
2. 把当前代码作为产品基线推入
3. `origin` 指向自有仓库，`upstream` 保留 DeerFlow
4. 以后所有模块都走 `feature/*` 分支
5. 审查后再合入 `main`

这套方式足够简单，也足够支撑你后续把项目从二开探索推进到真正产品化。

