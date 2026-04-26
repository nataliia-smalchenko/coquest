"""rename session columns to run columns

Revision ID: 4f98f87402ed
Revises: 83b5d679090d
Create Date: 2026-04-25 16:18:49.263629

Renames:
  game_runs.session_code  → join_code
  run_players.session_id  → run_id
  run_progress.session_id → run_id
  run_teams.session_id    → run_id
  run_chats.session_id    → run_id

Also migrates all index names from the old ix_game_sessions_* / ix_session_*
naming convention to ix_game_runs_* / ix_run_* with the new column names.
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "4f98f87402ed"
down_revision: Union[str, Sequence[str], None] = "83b5d679090d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- Drop stale indexes (old ix_game_sessions_* / ix_session_* naming) ----
    op.drop_index("ix_game_sessions_quest_id", table_name="game_runs")
    op.drop_index("ix_game_sessions_session_code", table_name="game_runs")
    op.drop_index("ix_game_sessions_teacher_id", table_name="game_runs")
    op.drop_index("ix_session_chat_player_id", table_name="run_chats")
    op.drop_index("ix_session_chat_session_id", table_name="run_chats")
    op.drop_index("ix_session_players_guest_token", table_name="run_players")
    op.drop_index("ix_session_players_session_id", table_name="run_players")
    op.drop_index("ix_session_players_team_id", table_name="run_players")
    op.drop_index("ix_session_players_user_id", table_name="run_players")
    op.drop_index("ix_session_progress_player_id", table_name="run_progress")
    op.drop_index("ix_session_progress_resource_id", table_name="run_progress")
    op.drop_index("ix_session_progress_session_id", table_name="run_progress")
    op.drop_index("ix_session_progress_team_id", table_name="run_progress")
    op.drop_index("ix_session_teams_session_id", table_name="run_teams")

    # ---- Rename columns ----
    op.alter_column("game_runs", "session_code", new_column_name="join_code")
    op.alter_column("run_players", "session_id", new_column_name="run_id")
    op.alter_column("run_progress", "session_id", new_column_name="run_id")
    op.alter_column("run_teams", "session_id", new_column_name="run_id")
    op.alter_column("run_chats", "session_id", new_column_name="run_id")

    # ---- Recreate indexes with new names and column references ----
    op.create_index("ix_game_runs_quest_id", "game_runs", ["quest_id"], unique=False)
    op.create_index("ix_game_runs_join_code", "game_runs", ["join_code"], unique=True)
    op.create_index(
        "ix_game_runs_teacher_id", "game_runs", ["teacher_id"], unique=False
    )
    op.create_index(
        "ix_quest_resources_resource_id",
        "quest_resources",
        ["resource_id"],
        unique=False,
    )
    op.create_index("ix_run_chats_player_id", "run_chats", ["player_id"], unique=False)
    op.create_index("ix_run_chats_run_id", "run_chats", ["run_id"], unique=False)
    op.create_index(
        "ix_run_players_guest_token", "run_players", ["guest_token"], unique=True
    )
    op.create_index("ix_run_players_run_id", "run_players", ["run_id"], unique=False)
    op.create_index("ix_run_players_team_id", "run_players", ["team_id"], unique=False)
    op.create_index("ix_run_players_user_id", "run_players", ["user_id"], unique=False)
    op.create_index(
        "ix_run_progress_map_object_id", "run_progress", ["map_object_id"], unique=False
    )
    op.create_index(
        "ix_run_progress_player_id", "run_progress", ["player_id"], unique=False
    )
    op.create_index(
        "ix_run_progress_resource_id", "run_progress", ["resource_id"], unique=False
    )
    op.create_index("ix_run_progress_run_id", "run_progress", ["run_id"], unique=False)
    op.create_index(
        "ix_run_progress_team_id", "run_progress", ["team_id"], unique=False
    )
    op.create_index(
        "ix_run_teams_hint_player_id", "run_teams", ["hint_player_id"], unique=False
    )
    op.create_index("ix_run_teams_run_id", "run_teams", ["run_id"], unique=False)


def downgrade() -> None:
    # ---- Drop new indexes ----
    op.drop_index("ix_run_teams_run_id", table_name="run_teams")
    op.drop_index("ix_run_teams_hint_player_id", table_name="run_teams")
    op.drop_index("ix_run_progress_run_id", table_name="run_progress")
    op.drop_index("ix_run_progress_team_id", table_name="run_progress")
    op.drop_index("ix_run_progress_resource_id", table_name="run_progress")
    op.drop_index("ix_run_progress_player_id", table_name="run_progress")
    op.drop_index("ix_run_progress_map_object_id", table_name="run_progress")
    op.drop_index("ix_run_players_run_id", table_name="run_players")
    op.drop_index("ix_run_players_user_id", table_name="run_players")
    op.drop_index("ix_run_players_team_id", table_name="run_players")
    op.drop_index("ix_run_players_guest_token", table_name="run_players")
    op.drop_index("ix_run_chats_run_id", table_name="run_chats")
    op.drop_index("ix_run_chats_player_id", table_name="run_chats")
    op.drop_index("ix_quest_resources_resource_id", table_name="quest_resources")
    op.drop_index("ix_game_runs_join_code", table_name="game_runs")
    op.drop_index("ix_game_runs_teacher_id", table_name="game_runs")
    op.drop_index("ix_game_runs_quest_id", table_name="game_runs")

    # ---- Rename columns back ----
    op.alter_column("game_runs", "join_code", new_column_name="session_code")
    op.alter_column("run_players", "run_id", new_column_name="session_id")
    op.alter_column("run_progress", "run_id", new_column_name="session_id")
    op.alter_column("run_teams", "run_id", new_column_name="session_id")
    op.alter_column("run_chats", "run_id", new_column_name="session_id")

    # ---- Restore old indexes ----
    op.create_index(
        "ix_game_sessions_quest_id", "game_runs", ["quest_id"], unique=False
    )
    op.create_index(
        "ix_game_sessions_session_code", "game_runs", ["session_code"], unique=True
    )
    op.create_index(
        "ix_game_sessions_teacher_id", "game_runs", ["teacher_id"], unique=False
    )
    op.create_index(
        "ix_session_chat_player_id", "run_chats", ["player_id"], unique=False
    )
    op.create_index(
        "ix_session_chat_session_id", "run_chats", ["session_id"], unique=False
    )
    op.create_index(
        "ix_session_players_guest_token", "run_players", ["guest_token"], unique=True
    )
    op.create_index(
        "ix_session_players_session_id", "run_players", ["session_id"], unique=False
    )
    op.create_index(
        "ix_session_players_team_id", "run_players", ["team_id"], unique=False
    )
    op.create_index(
        "ix_session_players_user_id", "run_players", ["user_id"], unique=False
    )
    op.create_index(
        "ix_session_progress_player_id", "run_progress", ["player_id"], unique=False
    )
    op.create_index(
        "ix_session_progress_resource_id", "run_progress", ["resource_id"], unique=False
    )
    op.create_index(
        "ix_session_progress_session_id", "run_progress", ["session_id"], unique=False
    )
    op.create_index(
        "ix_session_progress_team_id", "run_progress", ["team_id"], unique=False
    )
    op.create_index(
        "ix_session_teams_session_id", "run_teams", ["session_id"], unique=False
    )
