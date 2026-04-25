"""rename_session_tables_to_run

Phase 5 of the Session→Run refactoring.
Renames the five session-related tables to their new "run" names using
op.rename_table() — which is safe and preserves all data, indexes, and FK
references (PostgreSQL updates FK targets automatically on table rename).

IMPORTANT: Do NOT use --autogenerate for the table renames themselves — Alembic
would generate drop_table + create_table which would destroy all data.

After applying this migration, run a second autogenerate migration to pick up
any renamed FK-constraint names or index names that Alembic still considers
out-of-sync.

Revision ID: 83b5d679090d
Revises: a2b3c4d5e6f7
Create Date: 2026-04-24 11:19:52.064140

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "83b5d679090d"
down_revision: Union[str, Sequence[str], None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename the five session tables to run equivalents.
    # Order matters: children before parent where FK constraints use ALTER,
    # but plain rename_table is safe in any order for PostgreSQL.

    # 1. game_sessions → game_runs
    op.rename_table("game_sessions", "game_runs")

    # 2. session_players → run_players
    op.rename_table("session_players", "run_players")

    # 3. session_teams → run_teams
    op.rename_table("session_teams", "run_teams")

    # 4. session_progress → run_progress
    op.rename_table("session_progress", "run_progress")

    # 5. session_chat → run_chats
    op.rename_table("session_chat", "run_chats")

    # Rename the deferred FK constraint on hint_player_id in run_teams
    op.execute(
        "ALTER TABLE run_teams "
        "RENAME CONSTRAINT fk_session_teams_hint_player_id "
        "TO fk_run_teams_hint_player_id"
    )


def downgrade() -> None:
    # Undo the FK constraint rename first
    op.execute(
        "ALTER TABLE run_teams "
        "RENAME CONSTRAINT fk_run_teams_hint_player_id "
        "TO fk_session_teams_hint_player_id"
    )

    # Rename tables back in reverse order
    op.rename_table("run_chats", "session_chat")
    op.rename_table("run_progress", "session_progress")
    op.rename_table("run_teams", "session_teams")
    op.rename_table("run_players", "session_players")
    op.rename_table("game_runs", "game_sessions")
