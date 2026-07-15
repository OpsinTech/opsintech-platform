"""Add File Center models (file_folders, file_objects)

Revision ID: f1a2b3c4d5e6
Revises: a7b8c9d0e1f2
Create Date: 2026-06-29 13:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # --- file_folders ---
    op.create_table('file_folders',
        sa.Column('id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('tenant_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('owner_user_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('visibility', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('parent_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('display_name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('path_cache', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('created_by', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'owner_user_id', 'parent_id', 'display_name', name='uq_file_folders_tenant_user_parent_name'),
        sa.ForeignKeyConstraint(['parent_id'], ['file_folders.id'], ),
    )
    op.create_index(op.f('ix_file_folders_created_by'), 'file_folders', ['created_by'], unique=False)
    op.create_index(op.f('ix_file_folders_owner_user_id'), 'file_folders', ['owner_user_id'], unique=False)
    op.create_index(op.f('ix_file_folders_parent_id'), 'file_folders', ['parent_id'], unique=False)
    op.create_index(op.f('ix_file_folders_tenant_id'), 'file_folders', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_file_folders_visibility'), 'file_folders', ['visibility'], unique=False)

    # --- file_objects ---
    op.create_table('file_objects',
        sa.Column('id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('tenant_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('owner_user_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('visibility', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('parent_folder_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('display_name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('original_filename', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('mime_type', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('extension', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('checksum', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('storage_backend', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('object_key', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('source_type', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('business_type', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('business_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('created_by', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('created_by_role', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('object_key', name='uq_file_objects_object_key'),
        sa.ForeignKeyConstraint(['parent_folder_id'], ['file_folders.id'], ),
    )
    op.create_index(op.f('ix_file_objects_business_id'), 'file_objects', ['business_id'], unique=False)
    op.create_index(op.f('ix_file_objects_business_type'), 'file_objects', ['business_type'], unique=False)
    op.create_index(op.f('ix_file_objects_created_by'), 'file_objects', ['created_by'], unique=False)
    op.create_index(op.f('ix_file_objects_owner_user_id'), 'file_objects', ['owner_user_id'], unique=False)
    op.create_index(op.f('ix_file_objects_parent_folder_id'), 'file_objects', ['parent_folder_id'], unique=False)
    op.create_index(op.f('ix_file_objects_source_type'), 'file_objects', ['source_type'], unique=False)
    op.create_index(op.f('ix_file_objects_storage_backend'), 'file_objects', ['storage_backend'], unique=False)
    op.create_index(op.f('ix_file_objects_tenant_id'), 'file_objects', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_file_objects_visibility'), 'file_objects', ['visibility'], unique=False)
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index(op.f('ix_file_objects_visibility'), table_name='file_objects')
    op.drop_index(op.f('ix_file_objects_tenant_id'), table_name='file_objects')
    op.drop_index(op.f('ix_file_objects_storage_backend'), table_name='file_objects')
    op.drop_index(op.f('ix_file_objects_source_type'), table_name='file_objects')
    op.drop_index(op.f('ix_file_objects_parent_folder_id'), table_name='file_objects')
    op.drop_index(op.f('ix_file_objects_owner_user_id'), table_name='file_objects')
    op.drop_index(op.f('ix_file_objects_created_by'), table_name='file_objects')
    op.drop_index(op.f('ix_file_objects_business_type'), table_name='file_objects')
    op.drop_index(op.f('ix_file_objects_business_id'), table_name='file_objects')
    op.drop_table('file_objects')
    op.drop_index(op.f('ix_file_folders_visibility'), table_name='file_folders')
    op.drop_index(op.f('ix_file_folders_tenant_id'), table_name='file_folders')
    op.drop_index(op.f('ix_file_folders_parent_id'), table_name='file_folders')
    op.drop_index(op.f('ix_file_folders_owner_user_id'), table_name='file_folders')
    op.drop_index(op.f('ix_file_folders_created_by'), table_name='file_folders')
    op.drop_table('file_folders')
    # ### end Alembic commands ###
