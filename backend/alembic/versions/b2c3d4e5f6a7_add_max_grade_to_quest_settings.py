"""add max_grade to quest_settings

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-29

"""

from alembic import op
import sqlalchemy as sa

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "quest_settings",
        sa.Column("max_grade", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("quest_settings", "max_grade")
