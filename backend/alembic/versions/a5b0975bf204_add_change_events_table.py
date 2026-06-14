"""add_change_events_table

Revision ID: a5b0975bf204
Revises: 81da5159a35c
Create Date: 2026-05-28 11:30:54.108303

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = 'a5b0975bf204'
down_revision: Union[str, Sequence[str], None] = '81da5159a35c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('change_events',
    sa.Column('id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('tenant_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('source_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('service', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('environment', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('change_type', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('summary', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('detail_json', sa.JSON(), nullable=False),
    sa.Column('changed_by', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('changed_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_change_events_change_type'), 'change_events', ['change_type'], unique=False)
    op.create_index(op.f('ix_change_events_changed_at'), 'change_events', ['changed_at'], unique=False)
    op.create_index(op.f('ix_change_events_environment'), 'change_events', ['environment'], unique=False)
    op.create_index(op.f('ix_change_events_service'), 'change_events', ['service'], unique=False)
    op.create_index(op.f('ix_change_events_source_id'), 'change_events', ['source_id'], unique=False)
    op.create_index(op.f('ix_change_events_tenant_id'), 'change_events', ['tenant_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_change_events_tenant_id'), table_name='change_events')
    op.drop_index(op.f('ix_change_events_source_id'), table_name='change_events')
    op.drop_index(op.f('ix_change_events_service'), table_name='change_events')
    op.drop_index(op.f('ix_change_events_environment'), table_name='change_events')
    op.drop_index(op.f('ix_change_events_changed_at'), table_name='change_events')
    op.drop_index(op.f('ix_change_events_change_type'), table_name='change_events')
    op.drop_table('change_events')
