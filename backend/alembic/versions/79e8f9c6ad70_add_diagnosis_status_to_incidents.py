"""add_diagnosis_status_to_incidents

Revision ID: 79e8f9c6ad70
Revises: ac185ba1d188
Create Date: 2026-06-02 12:05:24.986841

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '79e8f9c6ad70'
down_revision: Union[str, Sequence[str], None] = 'ac185ba1d188'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('incidents', sa.Column('diagnosis_status', sa.String(), nullable=True))
    op.create_index(op.f('ix_incidents_diagnosis_status'), 'incidents', ['diagnosis_status'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_incidents_diagnosis_status'), table_name='incidents')
    op.drop_column('incidents', 'diagnosis_status')
