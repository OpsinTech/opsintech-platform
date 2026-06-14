import os
import re
import shutil
from pathlib import Path

from deerflow.config.tenant_context import get_current_tenant_id

# Virtual path prefix seen by agents inside the sandbox
VIRTUAL_PATH_PREFIX = "/mnt/user-data"

_SAFE_THREAD_ID_RE = re.compile(r"^[A-Za-z0-9_\-]+$")


class Paths:
    """
    Centralized path configuration for DeerFlow application data.

    Directory layout (host side):
        {base_dir}/
        ├── memory.json
        ├── USER.md          <-- global user profile (injected into all agents)
        ├── agents/
        │   └── {agent_name}/
        │       ├── config.yaml
        │       ├── SOUL.md  <-- agent personality/identity (injected alongside lead prompt)
        │       └── memory.json
        └── users/
            └── {user_id}/
                └── threads/
                    └── {thread_id}/
                        └── user-data/         <-- mounted as /mnt/user-data/ inside sandbox
                            ├── workspace/     <-- /mnt/user-data/workspace/
                            ├── uploads/       <-- /mnt/user-data/uploads/
                            └── outputs/       <-- /mnt/user-data/outputs/

    BaseDir resolution (in priority order):
        1. Constructor argument `base_dir`
        2. OPSINTECH_HOME environment variable
        3. Local dev fallback: cwd/.opsintech  (when cwd is the backend/ dir)
        4. Default: $HOME/.opsintech
    """

    def __init__(self, base_dir: str | Path | None = None) -> None:
        self._base_dir = Path(base_dir).resolve() if base_dir is not None else None

    @staticmethod
    def _is_writable_target(path: Path) -> bool:
        """Return True when *path* can be created/written by current process."""
        probe = path
        while not probe.exists():
            parent = probe.parent
            if parent == probe:
                break
            probe = parent
        return probe.exists() and os.access(probe, os.W_OK)

    @staticmethod
    def _fallback_base_dir() -> Path:
        """Choose a safe writable fallback for runtime data."""
        home_candidate = Path.home() / ".opsintech"
        if Paths._is_writable_target(home_candidate):
            return home_candidate
        return Path("/tmp/.opsintech")

    @property
    def host_base_dir(self) -> Path:
        """Host-visible base dir for Docker volume mount sources.

        When running inside Docker with a mounted Docker socket (DooD), the Docker
        daemon runs on the host and resolves mount paths against the host filesystem.
        Set OPSINTECH_HOST_BASE_DIR to the host-side path that corresponds to this
        container's base_dir so that sandbox container volume mounts work correctly.

        Falls back to base_dir when the env var is not set (native/local execution).
        """
        if env := os.getenv("OPSINTECH_HOST_BASE_DIR"):
            return Path(env)
        return self.base_dir

    @property
    def base_dir(self) -> Path:
        """Root directory for all application data."""
        if self._base_dir is not None:
            return self._base_dir

        if env_home := os.getenv("OPSINTECH_HOME"):
            candidate = Path(env_home).resolve()
            if self._is_writable_target(candidate):
                return candidate
            return self._fallback_base_dir()

        cwd = Path.cwd()
        if cwd.name == "backend" or (cwd / "pyproject.toml").exists():
            candidate = cwd / ".opsintech"
            if self._is_writable_target(candidate):
                return candidate
            return self._fallback_base_dir()

        return self._fallback_base_dir()

    @property
    def memory_file(self) -> Path:
        """Path to the persisted memory file: `{base_dir}/memory.json`."""
        return self.base_dir / "memory.json"

    @staticmethod
    def _validate_user_id(user_id: str) -> str:
        if not user_id or "/" in user_id or "\\" in user_id or ".." in user_id:
            raise ValueError("Invalid user_id for path")
        return user_id

    @staticmethod
    def _validate_tenant_id(tenant_id: str) -> str:
        if not tenant_id or "/" in tenant_id or "\\" in tenant_id or ".." in tenant_id:
            raise ValueError("Invalid tenant_id for path")
        return tenant_id

    def _user_root(self, user_id: str, tenant_id: str | None = None) -> Path:
        safe_user_id = self._validate_user_id(user_id)
        resolved_tenant_id = tenant_id if tenant_id is not None else get_current_tenant_id()
        if resolved_tenant_id:
            safe_tenant_id = self._validate_tenant_id(resolved_tenant_id)
            return self.base_dir / "tenants" / safe_tenant_id / "users" / safe_user_id
        return self.base_dir / "users" / safe_user_id

    def user_md_file(self, user_id: str | None = None, tenant_id: str | None = None) -> Path:
        """Path to user profile file.

        If user_id is provided: `{base_dir}/users/{user_id}/USER.md`
        If user_id is None: `{base_dir}/USER.md` (legacy global path)
        """
        if user_id is None:
            return self.base_dir / "USER.md"
        return self._user_root(user_id, tenant_id=tenant_id) / "USER.md"

    def agents_dir(self, user_id: str | None = None, tenant_id: str | None = None) -> Path:
        """Root directory for custom agents (DEPRECATED — use DB-backed CustomAgent).

        If user_id is provided: `{base_dir}/users/{user_id}/agents/`
        If user_id is None: `{base_dir}/agents/` (legacy global path)

        This is kept for Phase A backward compatibility and backfill scripts.
        """
        import warnings

        warnings.warn(
            "agents_dir() is deprecated. Agents are now stored in the custom_agents DB table. "
            "Use load_agent_config() / list_custom_agents() from deerflow.config.agents_config instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        if user_id is None:
            return self.base_dir / "agents"
        return self._user_root(user_id, tenant_id=tenant_id) / "agents"

    def agent_dir(self, name: str, user_id: str | None = None, tenant_id: str | None = None) -> Path:
        """Directory for a specific agent (DEPRECATED — use DB-backed CustomAgent).

        If user_id is provided: `{base_dir}/users/{user_id}/agents/{name}/`
        If user_id is None: `{base_dir}/agents/{name}/` (legacy global path)

        This is kept for Phase A backward compatibility (filesystem fallback reads).
        """
        import warnings

        warnings.warn(
            "agent_dir() is deprecated. Agents are now stored in the custom_agents DB table. "
            "Use load_agent_config() from deerflow.config.agents_config instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        return self.agents_dir(user_id=user_id, tenant_id=tenant_id) / name.lower()

    def agent_memory_file(self, name: str, user_id: str | None = None, tenant_id: str | None = None) -> Path:
        """Per-agent memory file.

        If user_id is provided: `{base_dir}/users/{user_id}/agents/{name}/memory.json`
        If user_id is None: `{base_dir}/agents/{name}/memory.json` (legacy global path)
        """
        return self.agent_dir(name, user_id=user_id, tenant_id=tenant_id) / "memory.json"

    def user_memory_file(self, user_id: str, tenant_id: str | None = None) -> Path:
        """Path to per-user memory file.

        If tenant_id is provided (or present in tenant context):
            `{base_dir}/tenants/{tenant_id}/users/{user_id}/memory.json`
        Otherwise:
            `{base_dir}/users/{user_id}/memory.json` (legacy path)
        """
        return self._user_root(user_id, tenant_id=tenant_id) / "memory.json"

    def user_threads_dir(self, user_id: str, tenant_id: str | None = None) -> Path:
        """Directory containing all thread data for a user.

        If tenant_id is provided (or present in tenant context):
            `{base_dir}/tenants/{tenant_id}/users/{user_id}/threads/`
        Otherwise:
            `{base_dir}/users/{user_id}/threads/` (legacy path)
        """
        return self._user_root(user_id, tenant_id=tenant_id) / "threads"

    def thread_dir(self, user_id: str, thread_id: str, tenant_id: str | None = None) -> Path:
        """
        Host path for a thread's data:
            `{base_dir}/tenants/{tenant_id}/users/{user_id}/threads/{thread_id}/` or
            `{base_dir}/users/{user_id}/threads/{thread_id}/` (legacy)

        This directory contains a `user-data/` subdirectory that is mounted
        as `/mnt/user-data/` inside the sandbox.

        Raises:
            ValueError: If `thread_id` contains unsafe characters (path separators
                        or `..`) that could cause directory traversal.
        """
        if not _SAFE_THREAD_ID_RE.match(thread_id):
            raise ValueError(f"Invalid thread_id {thread_id!r}: only alphanumeric characters, hyphens, and underscores are allowed.")
        return self.user_threads_dir(user_id, tenant_id=tenant_id) / thread_id

    def sandbox_work_dir(self, user_id: str, thread_id: str, tenant_id: str | None = None) -> Path:
        """
        Host path for the agent's workspace directory.
        Host: `{base_dir}/users/{user_id}/threads/{thread_id}/user-data/workspace/`
        Sandbox: `/mnt/user-data/workspace/`
        """
        return self.thread_dir(user_id, thread_id, tenant_id=tenant_id) / "user-data" / "workspace"

    def sandbox_uploads_dir(self, user_id: str, thread_id: str, tenant_id: str | None = None) -> Path:
        """
        Host path for user-uploaded files.
        Host: `{base_dir}/users/{user_id}/threads/{thread_id}/user-data/uploads/`
        Sandbox: `/mnt/user-data/uploads/`
        """
        return self.thread_dir(user_id, thread_id, tenant_id=tenant_id) / "user-data" / "uploads"

    def sandbox_outputs_dir(self, user_id: str, thread_id: str, tenant_id: str | None = None) -> Path:
        """
        Host path for agent-generated artifacts.
        Host: `{base_dir}/users/{user_id}/threads/{thread_id}/user-data/outputs/`
        Sandbox: `/mnt/user-data/outputs/`
        """
        return self.thread_dir(user_id, thread_id, tenant_id=tenant_id) / "user-data" / "outputs"

    def sandbox_user_data_dir(self, user_id: str, thread_id: str, tenant_id: str | None = None) -> Path:
        """
        Host path for the user-data root.
        Host: `{base_dir}/users/{user_id}/threads/{thread_id}/user-data/`
        Sandbox: `/mnt/user-data/`
        """
        return self.thread_dir(user_id, thread_id, tenant_id=tenant_id) / "user-data"

    def ensure_thread_dirs(self, user_id: str, thread_id: str, tenant_id: str | None = None) -> None:
        """Create all standard sandbox directories for a thread.

        Directories are created with mode 0o777 so that sandbox containers
        (which may run as a different UID than the host backend process) can
        write to the volume-mounted paths without "Permission denied" errors.
        The explicit chmod() call is necessary because Path.mkdir(mode=...) is
        subject to the process umask and may not yield the intended permissions.
        """
        for d in [
            self.sandbox_work_dir(user_id, thread_id, tenant_id=tenant_id),
            self.sandbox_uploads_dir(user_id, thread_id, tenant_id=tenant_id),
            self.sandbox_outputs_dir(user_id, thread_id, tenant_id=tenant_id),
        ]:
            d.mkdir(parents=True, exist_ok=True)
            d.chmod(0o777)

    def delete_thread_dir(self, user_id: str, thread_id: str, tenant_id: str | None = None) -> None:
        """Delete all persisted data for a thread.

        The operation is idempotent: missing thread directories are ignored.
        """
        thread_dir = self.thread_dir(user_id, thread_id, tenant_id=tenant_id)
        if thread_dir.exists():
            shutil.rmtree(thread_dir)

    def resolve_virtual_path(
        self,
        user_id: str,
        thread_id: str,
        virtual_path: str,
        tenant_id: str | None = None,
    ) -> Path:
        """Resolve a sandbox virtual path to the actual host filesystem path.

        Args:
            user_id: The user ID.
            thread_id: The thread ID.
            virtual_path: Virtual path as seen inside the sandbox, e.g.
                          ``/mnt/user-data/outputs/report.pdf``.
                          Leading slashes are stripped before matching.

        Returns:
            The resolved absolute host filesystem path.

        Raises:
            ValueError: If the path does not start with the expected virtual
                        prefix or a path-traversal attempt is detected.
        """
        stripped = virtual_path.lstrip("/")
        prefix = VIRTUAL_PATH_PREFIX.lstrip("/")

        # Require an exact segment-boundary match to avoid prefix confusion
        # (e.g. reject paths like "mnt/user-dataX/...").
        if stripped != prefix and not stripped.startswith(prefix + "/"):
            raise ValueError(f"Path must start with /{prefix}")

        relative = stripped[len(prefix) :].lstrip("/")
        base = self.sandbox_user_data_dir(user_id, thread_id, tenant_id=tenant_id).resolve()
        actual = (base / relative).resolve()

        try:
            actual.relative_to(base)
        except ValueError:
            raise ValueError("Access denied: path traversal detected")

        return actual


# ── Singleton ────────────────────────────────────────────────────────────

_paths: Paths | None = None


def get_paths() -> Paths:
    """Return the global Paths singleton (lazy-initialized)."""
    global _paths
    if _paths is None:
        _paths = Paths()
    return _paths


def resolve_path(path: str) -> Path:
    """Resolve *path* to an absolute ``Path``.

    Relative paths are resolved relative to the application base directory.
    Absolute paths are returned as-is (after normalisation).
    """
    p = Path(path)
    if not p.is_absolute():
        p = get_paths().base_dir / path
    return p.resolve()
