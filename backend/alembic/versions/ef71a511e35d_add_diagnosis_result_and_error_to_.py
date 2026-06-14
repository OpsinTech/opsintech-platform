"""add_diagnosis_result_and_error_to_incidents

Revision ID: ef71a511e35d
Revises: 79e8f9c6ad70
Create Date: 2026-06-03 10:11:04.565978

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ef71a511e35d'
down_revision: Union[str, Sequence[str], None] = '79e8f9c6ad70'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('incidents', sa.Column('diagnosis_result', sa.Text(), nullable=True))
    op.add_column('incidents', sa.Column('diagnosis_error', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('incidents', 'diagnosis_error')
    op.drop_column('incidents', 'diagnosis_result')
