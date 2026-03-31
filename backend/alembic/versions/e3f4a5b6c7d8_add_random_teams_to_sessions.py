"""Add random_teams to game_sessions

Revision ID: e3f4a5b6c7d8
Revises: 2d72960bbb32
Create Date: 2026-03-31 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e3f4a5b6c7d8"
down_revision: Union[str, Sequence[str], None] = "97f09084d82c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add random_teams column to game_sessions."""
    op.add_column(
        "game_sessions",
        sa.Column(
            "random_teams",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    """Remove random_teams column from game_sessions."""
    op.drop_column("game_sessions", "random_teams")
