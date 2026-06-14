"""add_custom_agents_table

Revision ID: ac185ba1d188
Revises: 9b5ac3b96908
Create Date: 2026-06-01 11:03:16.893379

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'ac185ba1d188'
down_revision: Union[str, Sequence[str], None] = '9b5ac3b96908'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('custom_agents',
    sa.Column('id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('tenant_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('user_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('model', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('tool_groups', sa.JSON(), nullable=False),
    sa.Column('system_prompt', sa.Text(), nullable=False),
    sa.Column('skills', sa.JSON(), nullable=False),
    sa.Column('enabled', sa.Boolean(), nullable=False),
    sa.Column('tags', sa.JSON(), nullable=False),
    sa.Column('metadata', sa.JSON(), server_default='{}', nullable=False),
    sa.Column('created_by', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'user_id', 'name', name='uq_custom_agents_tenant_user_name')
    )
    op.create_index(op.f('ix_custom_agents_name'), 'custom_agents', ['name'], unique=False)
    op.create_index(op.f('ix_custom_agents_tenant_id'), 'custom_agents', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_custom_agents_user_id'), 'custom_agents', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_custom_agents_user_id'), table_name='custom_agents')
    op.drop_index(op.f('ix_custom_agents_tenant_id'), table_name='custom_agents')
    op.drop_index(op.f('ix_custom_agents_name'), table_name='custom_agents')
    op.drop_table('custom_agents')
