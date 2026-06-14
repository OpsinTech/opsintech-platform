import logging

from langchain.tools import BaseTool

from deerflow.community.duckduckgo.tools import web_fetch_tool, web_search_tool
from deerflow.community.image_search.tools import image_search_tool
from deerflow.config import get_app_config
from deerflow.sandbox.tools import bash_tool, ls_tool, read_file_tool, str_replace_tool, write_file_tool
from deerflow.tools.builtins import ask_clarification_tool, present_file_tool, task_tool, view_image_tool
from deerflow.tools.builtins.tool_search import reset_deferred_registry

logger = logging.getLogger(__name__)

BUILTIN_TOOLS = [
    present_file_tool,
    ask_clarification_tool,
    ls_tool,
    read_file_tool,
    write_file_tool,
    str_replace_tool,
    bash_tool,
]

DEFAULT_COMMUNITY_TOOLS = [
    web_search_tool,
    web_fetch_tool,
    image_search_tool,
]

SUBAGENT_TOOLS = [
    task_tool,
]


def get_available_tools(
    groups: list[str] | None = None,
    include_mcp: bool = True,
    model_name: str | None = None,
    subagent_enabled: bool = False,
) -> list[BaseTool]:
    """Get all available tools.

    Loads builtin sandbox tools, default community tools (DuckDuckGo),
    conditionally-enabled subagent/vision tools, and MCP tools.

    Args:
        groups: Ignored — kept for API compatibility.
        include_mcp: Whether to include tools from MCP servers (default: True).
        model_name: Optional model name to determine if vision tools should be included.
        subagent_enabled: Whether to include subagent tools (task).

    Returns:
        List of available tools.
    """
    config = get_app_config()

    # Default community tools (DuckDuckGo — free, no API key needed).
    # Users who want premium providers register MCP tools through the admin UI.
    loaded_tools: list[BaseTool] = list(DEFAULT_COMMUNITY_TOOLS)

    # Conditionally add tools based on config
    builtin_tools = BUILTIN_TOOLS.copy()

    # Add subagent tools only if enabled via runtime parameter
    if subagent_enabled:
        builtin_tools.extend(SUBAGENT_TOOLS)
        logger.info("Including subagent tools (task)")

    # If no model_name specified, use the first model (default)
    if model_name is None and config.models:
        model_name = config.models[0].name

    # Add view_image_tool only if the model supports vision
    model_config = config.get_model_config(model_name) if model_name else None
    if model_config is not None and model_config.supports_vision:
        builtin_tools.append(view_image_tool)
        logger.info(f"Including view_image_tool for model '{model_name}' (supports_vision=True)")

    # Get cached MCP tools if enabled
    # NOTE: MCP servers are now managed by tenant administrators in the database,
    # not loaded from extensions_config.json file.
    mcp_tools = []
    # Reset deferred registry upfront to prevent stale state from previous calls
    reset_deferred_registry()
    if include_mcp:
        try:
            from deerflow.mcp.cache import get_cached_mcp_tools

            mcp_tools = get_cached_mcp_tools()
            if mcp_tools:
                logger.info(f"Using {len(mcp_tools)} cached MCP tool(s)")

                # When tool_search is enabled, register MCP tools in the
                # deferred registry and add tool_search to builtin tools.
                if config.tool_search.enabled:
                    from deerflow.tools.builtins.tool_search import DeferredToolRegistry, set_deferred_registry
                    from deerflow.tools.builtins.tool_search import tool_search as tool_search_tool

                    registry = DeferredToolRegistry()
                    for t in mcp_tools:
                        registry.register(t)
                    set_deferred_registry(registry)
                    builtin_tools.append(tool_search_tool)
                    logger.info(f"Tool search active: {len(mcp_tools)} tools deferred")
        except ImportError:
            logger.warning("MCP module not available. Install 'langchain-mcp-adapters' package to enable MCP tools.")
        except Exception as e:
            logger.error(f"Failed to get cached MCP tools: {e}")

    logger.info(f"Total tools loaded: {len(loaded_tools)}, built-in tools: {len(builtin_tools)}, MCP tools: {len(mcp_tools)}")
    return loaded_tools + builtin_tools + mcp_tools
