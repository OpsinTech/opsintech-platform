from typing import NotRequired, override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langgraph.config import get_config
from langgraph.runtime import Runtime

from deerflow.agents.thread_state import ThreadDataState
from deerflow.config.paths import Paths, get_paths
from deerflow.config.tenant_context import get_current_tenant_id, get_current_user_id


class ThreadDataMiddlewareState(AgentState):
    """Compatible with the `ThreadState` schema."""

    thread_data: NotRequired[ThreadDataState | None]


class ThreadDataMiddleware(AgentMiddleware[ThreadDataMiddlewareState]):
    """Create thread data directories for each thread execution.

    Creates the following directory structure:
    - {base_dir}/users/{user_id}/threads/{thread_id}/user-data/workspace
    - {base_dir}/users/{user_id}/threads/{thread_id}/user-data/uploads
    - {base_dir}/users/{user_id}/threads/{thread_id}/user-data/outputs

    Lifecycle Management:
    - With lazy_init=True (default): Only compute paths, directories created on-demand
    - With lazy_init=False: Eagerly create directories in before_agent()
    """

    state_schema = ThreadDataMiddlewareState

    def __init__(self, base_dir: str | None = None, lazy_init: bool = True):
        """Initialize the middleware.

        Args:
            base_dir: Base directory for thread data. Defaults to Paths resolution.
            lazy_init: If True, defer directory creation until needed.
                      If False, create directories eagerly in before_agent().
                      Default is True for optimal performance.
        """
        super().__init__()
        self._paths = Paths(base_dir) if base_dir else get_paths()
        self._lazy_init = lazy_init

    def _get_thread_paths(self, thread_id: str, user_id: str, tenant_id: str | None) -> dict[str, str]:
        """Get the paths for a thread's data directories.

        Args:
            thread_id: The thread ID.
            user_id: The user ID.

        Returns:
            Dictionary with workspace_path, uploads_path, and outputs_path.
        """
        return {
            "workspace_path": str(self._paths.sandbox_work_dir(user_id, thread_id, tenant_id=tenant_id)),
            "uploads_path": str(self._paths.sandbox_uploads_dir(user_id, thread_id, tenant_id=tenant_id)),
            "outputs_path": str(self._paths.sandbox_outputs_dir(user_id, thread_id, tenant_id=tenant_id)),
        }

    def _create_thread_directories(self, thread_id: str, user_id: str, tenant_id: str | None) -> dict[str, str]:
        """Create the thread data directories.

        Args:
            thread_id: The thread ID.
            user_id: The user ID.

        Returns:
            Dictionary with the created directory paths.
        """
        self._paths.ensure_thread_dirs(user_id, thread_id, tenant_id=tenant_id)
        return self._get_thread_paths(thread_id, user_id, tenant_id)

    @override
    def before_agent(self, state: ThreadDataMiddlewareState, runtime: Runtime) -> dict | None:
        context = runtime.context or {}
        thread_id = context.get("thread_id")
        user_id = context.get("user_id")
        tenant_id = context.get("tenant_id")
        
        try:
            config = get_config()
        except RuntimeError:
            config = {}
        if thread_id is None:
            thread_id = config.get("configurable", {}).get("thread_id")

        if user_id is None:
            user_id = config.get("configurable", {}).get("user_id")
        if tenant_id is None:
            tenant_id = config.get("configurable", {}).get("tenant_id")

        if user_id is None:
            user_id = get_current_user_id()
        if tenant_id is None:
            tenant_id = get_current_tenant_id()

        if thread_id is None:
            raise ValueError("Thread ID is required in runtime context or config.configurable")
        if user_id is None or user_id == "":
            raise ValueError("User ID is required in runtime context or config.configurable")

        # Bind tenant context to contextvars for execution of tools/skills/configs
        from deerflow.config.tenant_context import set_tenant_context
        set_tenant_context(user_id=user_id, tenant_id=tenant_id)

        if self._lazy_init:
            # Lazy initialization: only compute paths, don't create directories
            paths = self._get_thread_paths(thread_id, user_id, tenant_id)
        else:
            # Eager initialization: create directories immediately
            paths = self._create_thread_directories(thread_id, user_id, tenant_id)
            print(f"Created thread data directories for thread {thread_id}")

        return {
            "thread_data": {
                **paths,
            }
        }
