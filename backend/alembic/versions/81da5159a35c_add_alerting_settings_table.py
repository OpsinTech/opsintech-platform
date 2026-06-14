"""add_alerting_settings_table

Revision ID: 81da5159a35c
Revises: bb06333b4752
Create Date: 2026-05-28 09:44:35.710679

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '81da5159a35c'
down_revision: Union[str, Sequence[str], None] = 'bb06333b4752'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('alerting_settings',
    sa.Column('id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('tenant_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('raw_alert_retention_days', sa.Integer(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_alerting_settings_tenant_id'), 'alerting_settings', ['tenant_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_alerting_settings_tenant_id'), table_name='alerting_settings')
    op.drop_table('alerting_settings')
