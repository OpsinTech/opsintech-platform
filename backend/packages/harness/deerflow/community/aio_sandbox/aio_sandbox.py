import base64
import logging

from agent_sandbox import Sandbox as AioSandboxClient

from deerflow.sandbox.sandbox import Sandbox

logger = logging.getLogger(__name__)


class AioSandbox(Sandbox):
    """Sandbox implementation using the agent-infra/sandbox Docker container.

    This sandbox connects to a running AIO sandbox container via HTTP API.
    """

    def __init__(self, id: str, base_url: str, home_dir: str | None = None):
        """Initialize the AIO sandbox.

        Args:
            id: Unique identifier for this sandbox instance.
            base_url: URL of the sandbox API (e.g., http://localhost:8080).
            home_dir: Home directory inside the sandbox. If None, will be fetched from the sandbox.
        """
        super().__init__(id)
        self._base_url = base_url
        self._client = AioSandboxClient(base_url=base_url, timeout=600)
        self._home_dir = home_dir

    @property
    def base_url(self) -> str:
        return self._base_url

    @property
    def home_dir(self) -> str:
        """Get the home directory inside the sandbox."""
        if self._home_dir is None:
            context = self._client.sandbox.get_context()
            self._home_dir = context.home_dir
        return self._home_dir

    def execute_command(self, command: str, env: dict[str, str] | None = None) -> str:
        """Execute a shell command in the sandbox.

        Args:
            command: The command to execute.
            env: Optional environment variables to inject.

        Returns:
            The output of the command.
        """
        try:
            if env:
                import shlex
                prefix = " ".join(f"{k}={shlex.quote(v)}" for k, v in env.items()) + " "
                command = prefix + command
            result = self._client.shell.exec_command(command=command)
            output = result.data.output if result.data else ""
            return output if output else "(no output)"
        except Exception as e:
            logger.error(f"Failed to execute command in sandbox: {e}")
            return f"Error: {e}"

    def read_file(self, path: str, start_line: int | None = None, end_line: int | None = None) -> str:
        """Read the content of a file in the sandbox.

        Args:
            path: The absolute path of the file to read.
            start_line: Optional starting line number (1-indexed, inclusive).
            end_line: Optional ending line number (1-indexed, inclusive).

        Returns:
            The content of the file (or the specified line range).
        """
        try:
            if start_line is None and end_line is None:
                result = self._client.file.read_file(file=path)
                return result.data.content if result.data else ""

            start = start_line if start_line is not None else 1
            end = str(end_line) if end_line is not None else "$"
            cmd = f"sed -n '{start},{end}p' {path}"
            result = self._client.shell.exec_command(command=cmd)
            return result.data.output if result.data else ""
        except Exception as e:
            logger.error(f"Failed to read file in sandbox: {e}")
            return f"Error: {e}"

    def list_dir(self, path: str, max_depth: int = 2) -> list[str]:
        """List the contents of a directory in the sandbox.

        Args:
            path: The absolute path of the directory to list.
            max_depth: The maximum depth to traverse. Default is 2.

        Returns:
            The contents of the directory.
        """
        try:
            # Use shell command to list directory with depth limit
            # The -L flag limits the depth for the tree command
            result = self._client.shell.exec_command(command=f"find {path} -maxdepth {max_depth} -type f -o -type d 2>/dev/null | head -500")
            output = result.data.output if result.data else ""
            if output:
                return [line.strip() for line in output.strip().split("\n") if line.strip()]
            return []
        except Exception as e:
            logger.error(f"Failed to list directory in sandbox: {e}")
            return []

    def write_file(self, path: str, content: str, append: bool = False) -> None:
        """Write content to a file in the sandbox.

        Args:
            path: The absolute path of the file to write to.
            content: The text content to write to the file.
            append: Whether to append the content to the file.
        """
        try:
            if append:
                # Read existing content first and append
                existing = self.read_file(path)
                if not existing.startswith("Error:"):
                    content = existing + content
            self._client.file.write_file(file=path, content=content)
        except Exception as e:
            logger.error(f"Failed to write file in sandbox: {e}")
            raise

    def update_file(self, path: str, content: bytes) -> None:
        """Update a file with binary content in the sandbox.

        Args:
            path: The absolute path of the file to update.
            content: The binary content to write to the file.
        """
        try:
            base64_content = base64.b64encode(content).decode("utf-8")
            self._client.file.write_file(file=path, content=base64_content, encoding="base64")
        except Exception as e:
            logger.error(f"Failed to update file in sandbox: {e}")
            raise
