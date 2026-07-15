/**
 * Workspace type access control configuration.
 *
 * Maps URL path prefixes to the workspace types that are allowed to access them.
 * If a path is not listed here, it is accessible by ALL workspace types.
 *
 * Shared between nav menu filtering and route guards.
 *
 * Type values:
 *   "ops"     — 运维空间（全功能：告警、事件、终端、IM 渠道）
 *   "product" — 产品空间（智能工作台、技能、知识库，无告警/运维）
 *   "rd"      — 研发空间（智能工作台、技能、终端，无告警/运维）
 */
export const ROUTE_TYPE_REQUIREMENTS: Record<string, string[]> = {
  // 告警与事件管理 — 仅运维
  "/workspace/incidents": ["ops"],
  "/tenant-admin/alerts": ["ops"],

  // IM 渠道管理 — 仅运维（告警通知渠道）
  "/tenant-admin/im": ["ops"],

  // 审计日志 — 仅运维
  "/tenant-admin/audit": ["ops"],
};

/**
 * Checks if a tenant type is allowed to access a given route prefix.
 * Built-in 'ops' routes are accessible by any custom workspace types (i.e. not 'product' or 'rd').
 */
export function hasRouteAccess(routePath: string, tenantType: string): boolean {
  // Completely disabled route restrictions per user request: all workspace types have access to all routes
  return true;
}
