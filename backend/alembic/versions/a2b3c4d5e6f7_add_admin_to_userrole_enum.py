"""add admin to userrole enum

Revision ID: a2b3c4d5e6f7
Revises: e3f4a5b6c7d8
Create Date: 2026-04-23 00:00:00.000000

Downgrade strategy:
  PostgreSQL does not support ALTER TYPE ... DROP VALUE, so the enum value
  'admin' cannot be removed from the type itself during downgrade.
  Instead, the downgrade reassigns all admin users to the 'teacher' role
  so that no rows reference the 'admin' value anymore. The value remains
  present in the enum type but becomes unused — this is safe.

  If you later need to physically remove 'admin' from the type, you must
  recreate the enum manually (requires an application maintenance window).
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "e3f4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ADD VALUE is transactional in PostgreSQL 12+ (no explicit COMMIT needed).
    # IF NOT EXISTS makes the statement idempotent — safe to run multiple times.
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'admin'")


def downgrade() -> None:
    # Reassign all admin users to 'teacher' so no rows reference 'admin'.
    # The enum value itself cannot be dropped; it remains in the type but unused.
    op.execute("UPDATE users SET role = 'teacher' WHERE role = 'admin'")
