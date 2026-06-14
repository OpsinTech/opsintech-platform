"""add max_input_tokens to tenant_model_configs

Revision ID: 2d6f7a8b9c0e
Revises: 1c580d08896f
Create Date: 2026-06-06 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2d6f7a8b9c0e'
down_revision: Union[str, Sequence[str], None] = '1c580d08896f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('tenant_model_configs', sa.Column('max_input_tokens', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('tenant_model_configs', 'max_input_tokens')
