"""cleanup_legacy_structured_fields

Revision ID: d4f5e6a7b8c9
Revises: b1c2d3e4f5a6
Create Date: 2026-04-28 18:00:00.000000

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d4f5e6a7b8c9"
down_revision: str | Sequence[str] | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _is_sqlite(bind) -> bool:
    return bind.dialect.name == "sqlite"


def upgrade() -> None:
    bind = op.get_bind()
    if not _is_sqlite(bind):
        return

    bind.execute(
        sa.text(
            "UPDATE user_configs "
            "SET app_config = json_remove(app_config, '$.models') "
            "WHERE json_type(app_config, '$.models') IS NOT NULL"
        )
    )
    for key in ("$.mcpServers", "$.mcp_servers", "$.skills"):
        bind.execute(
            sa.text(
                "UPDATE user_configs "
                "SET extensions_config = json_remove(extensions_config, :key) "
                "WHERE json_type(extensions_config, :key) IS NOT NULL"
            ),
            {"key": key},
        )


def downgrade() -> None:
    pass
