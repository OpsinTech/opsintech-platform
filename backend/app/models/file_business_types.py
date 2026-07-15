"""File Center business type constants.

Defines the valid values for FileObject.business_type,
used to categorize AI-generated artifacts in the File Center.
"""

# Code analysis pipeline artifacts
BUSINESS_TYPE_REPO_MAP = "repo_map"
BUSINESS_TYPE_DEPENDENCY_GRAPH = "dependency_graph"
BUSINESS_TYPE_DOMAIN_SCHEMA = "domain_schema"
BUSINESS_TYPE_UX_SITEMAP = "ux_sitemap"
BUSINESS_TYPE_COMPONENT_INVENTORY = "component_inventory"
BUSINESS_TYPE_DESIGN_TOKENS = "design_tokens"
BUSINESS_TYPE_BUSINESS_RULES = "business_rules"
BUSINESS_TYPE_RBAC_MATRIX = "rbac_matrix"

# All code analysis business types
CODE_ANALYSIS_BUSINESS_TYPES: set[str] = {
    BUSINESS_TYPE_REPO_MAP,
    BUSINESS_TYPE_DEPENDENCY_GRAPH,
    BUSINESS_TYPE_DOMAIN_SCHEMA,
    BUSINESS_TYPE_UX_SITEMAP,
    BUSINESS_TYPE_COMPONENT_INVENTORY,
    BUSINESS_TYPE_DESIGN_TOKENS,
    BUSINESS_TYPE_BUSINESS_RULES,
    BUSINESS_TYPE_RBAC_MATRIX,
}

# Human-readable labels for display
BUSINESS_TYPE_LABELS: dict[str, str] = {
    BUSINESS_TYPE_REPO_MAP: "Repo Map (代码骨架地图)",
    BUSINESS_TYPE_DEPENDENCY_GRAPH: "Dependency Graph (依赖图谱)",
    BUSINESS_TYPE_DOMAIN_SCHEMA: "Domain Schema (业务域模型)",
    BUSINESS_TYPE_UX_SITEMAP: "UX Sitemap (交互站点地图)",
    BUSINESS_TYPE_COMPONENT_INVENTORY: "Component Inventory (组件清单)",
    BUSINESS_TYPE_DESIGN_TOKENS: "Design Tokens (设计变量)",
    BUSINESS_TYPE_BUSINESS_RULES: "Business Rules (业务规则)",
    BUSINESS_TYPE_RBAC_MATRIX: "RBAC Matrix (权限矩阵)",
}
