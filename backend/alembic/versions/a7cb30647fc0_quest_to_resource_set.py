"""quest to resource set

Revision ID: a7cb30647fc0
Revises: 65dfe39b94ad
Create Date: 2026-04-26

Renames quest tables to resource_set tables, moves map_id from resource_sets
to game_runs, adds run_type/test_mode/current_step_order to game_runs.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "a7cb30647fc0"
down_revision = "65dfe39b94ad"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add new columns to game_runs
    op.add_column(
        "game_runs",
        sa.Column("run_type", sa.String(), nullable=False, server_default="quest"),
    )
    op.add_column(
        "game_runs",
        sa.Column("test_mode", sa.String(), nullable=True),
    )
    op.add_column(
        "game_runs",
        sa.Column(
            "map_id",
            sa.Uuid(),
            sa.ForeignKey("maps.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "game_runs",
        sa.Column("current_step_order", sa.Integer(), nullable=True),
    )
    op.create_index("ix_game_runs_map_id", "game_runs", ["map_id"])

    # 2. Backfill map_id from quests to game_runs (before any renames)
    op.execute(
        """
        UPDATE game_runs
        SET map_id = quests.map_id
        FROM quests
        WHERE game_runs.quest_id = quests.id
          AND quests.map_id IS NOT NULL
        """
    )

    # 3. Drop map_id from quests BEFORE rename
    #    Try both possible FK names (original or after a partial upgrade/downgrade)
    bind = op.get_bind()
    insp = inspect(bind)
    fk_names = {fk["name"] for fk in insp.get_foreign_keys("quests")}
    for name in ("resource_sets_map_id_fkey", "quests_map_id_fkey"):
        if name in fk_names:
            op.drop_constraint(name, "quests", type_="foreignkey")
            break

    idx_names = {idx["name"] for idx in insp.get_indexes("quests")}
    if "ix_quests_map_id" in idx_names:
        op.drop_index("ix_quests_map_id", table_name="quests")

    col_names = {c["name"] for c in insp.get_columns("quests")}
    if "map_id" in col_names:
        op.drop_column("quests", "map_id")

    # 4. Rename unique constraint on translations BEFORE rename
    op.drop_constraint(
        "uq_quest_translations_quest_language",
        "quest_translations",
        type_="unique",
    )

    # 5. Rename tables: quests -> resource_sets
    op.rename_table("quests", "resource_sets")
    op.rename_table("quest_translations", "resource_set_translations")
    op.rename_table("quest_settings", "resource_set_settings")
    op.rename_table("quest_resources", "resource_set_resources")

    # 6. Rename columns in child tables: quest_id -> resource_set_id
    op.alter_column(
        "resource_set_translations", "quest_id", new_column_name="resource_set_id"
    )
    op.alter_column(
        "resource_set_settings", "quest_id", new_column_name="resource_set_id"
    )
    op.alter_column(
        "resource_set_resources", "quest_id", new_column_name="resource_set_id"
    )
    op.alter_column("game_runs", "quest_id", new_column_name="resource_set_id")

    # 7. Recreate unique constraint with new name
    op.create_unique_constraint(
        "uq_resource_set_translations_resource_set_language",
        "resource_set_translations",
        ["resource_set_id", "language"],
    )


def downgrade() -> None:
    # Reverse the unique constraint rename
    op.drop_constraint(
        "uq_resource_set_translations_resource_set_language",
        "resource_set_translations",
        type_="unique",
    )

    # Rename columns back
    op.alter_column("game_runs", "resource_set_id", new_column_name="quest_id")
    op.alter_column(
        "resource_set_resources", "resource_set_id", new_column_name="quest_id"
    )
    op.alter_column(
        "resource_set_settings", "resource_set_id", new_column_name="quest_id"
    )
    op.alter_column(
        "resource_set_translations", "resource_set_id", new_column_name="quest_id"
    )

    # Rename tables back
    op.rename_table("resource_set_resources", "quest_resources")
    op.rename_table("resource_set_settings", "quest_settings")
    op.rename_table("resource_set_translations", "quest_translations")
    op.rename_table("resource_sets", "quests")

    # Recreate unique constraint with old name
    op.create_unique_constraint(
        "uq_quest_translations_quest_language",
        "quest_translations",
        ["quest_id", "language"],
    )

    # Add map_id back to quests
    op.add_column(
        "quests",
        sa.Column("map_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "quests_map_id_fkey",
        "quests",
        "maps",
        ["map_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_quests_map_id", "quests", ["map_id"])

    # Backfill map_id from game_runs back to quests
    op.execute(
        """
        UPDATE quests
        SET map_id = game_runs.map_id
        FROM game_runs
        WHERE game_runs.quest_id = quests.id
          AND game_runs.map_id IS NOT NULL
        """
    )

    # Drop new columns from game_runs
    op.drop_index("ix_game_runs_map_id", table_name="game_runs")
    op.drop_column("game_runs", "current_step_order")
    op.drop_column("game_runs", "map_id")
    op.drop_column("game_runs", "test_mode")
    op.drop_column("game_runs", "run_type")
