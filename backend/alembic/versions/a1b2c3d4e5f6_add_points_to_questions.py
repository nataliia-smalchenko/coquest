"""Add points to questions

Revision ID: a1b2c3d4e5f6
Revises: 2d72960bbb32
Create Date: 2026-03-28 23:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "5c1e8b9f0d3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "questions",
        sa.Column(
            "points",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )


def downgrade() -> None:
    op.drop_column("questions", "points")
