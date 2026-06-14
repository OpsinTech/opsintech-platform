"""add model_type to tenant_model_configs

Revision ID: 3e7f8a9b0c1d
Revises: 2d6f7a8b9c0e
Create Date: 2026-06-06 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3e7f8a9b0c1d'
down_revision: Union[str, Sequence[str], None] = '2d6f7a8b9c0e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('tenant_model_configs', sa.Column('model_type', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('tenant_model_configs', 'model_type')
