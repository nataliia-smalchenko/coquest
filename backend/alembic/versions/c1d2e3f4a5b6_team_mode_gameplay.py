"""team_mode_gameplay

Revision ID: c1d2e3f4a5b6
Revises: b2c3d4e5f6a7
Create Date: 2026-03-29

Add step_order to session_progress (for sequential team progression)
and hint_player_id to session_teams (tracks who currently holds the hint).
"""

from alembic import op
import sqlalchemy as sa

revision = "c1d2e3f4a5b6"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "session_progress",
        sa.Column("step_order", sa.Integer(), nullable=True),
    )
    op.add_column(
        "session_teams",
        sa.Column("hint_player_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_session_teams_hint_player_id",
        "session_teams",
        "session_players",
        ["hint_player_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_session_teams_hint_player_id", "session_teams", type_="foreignkey"
    )
    op.drop_column("session_teams", "hint_player_id")
    op.drop_column("session_progress", "step_order")
