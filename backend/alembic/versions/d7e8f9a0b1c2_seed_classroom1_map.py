"""seed_classroom1_map

Revision ID: d7e8f9a0b1c2
Revises: f5dcb9e585dc
Create Date: 2026-03-23 00:01:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, Sequence[str], None] = "f5dcb9e585dc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _hint(object_slug: str, language: str, text: str) -> str:
    return f"""
        INSERT INTO map_object_hints (id, object_id, language, hint_text)
        SELECT gen_random_uuid(), mo.id, '{language}', $hint${text}$hint$
        FROM map_objects mo
        JOIN maps m ON mo.map_id = m.id
        WHERE m.slug = 'classroom1' AND mo.slug = '{object_slug}'
    """


def upgrade() -> None:
    """Seed classroom1 map data."""

    # ── Map ──────────────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO maps (id, slug, original_width, original_height, landscape_only_mobile, created_at)
        VALUES (gen_random_uuid(), 'classroom1', 2714, 1659, true, now())
    """)

    # ── Translations ──
    op.execute("""
        INSERT INTO map_translations (id, map_id, language, name, description)
        SELECT gen_random_uuid(), m.id, 'uk', 'Клас', 'Звичайний шкільний клас'
        FROM maps m WHERE m.slug = 'classroom1'
    """)
    op.execute("""
        INSERT INTO map_translations (id, map_id, language, name, description)
        SELECT gen_random_uuid(), m.id, 'en', 'Classroom', 'A typical school classroom'
        FROM maps m WHERE m.slug = 'classroom1'
    """)

    # ── Map objects ──
    objects = [
        # slug           x     y     width  height  z_index  interactive  order
        ("background", 0, 0, 2714, 1659, 0, False, 0),
        ("door", 124, 264, 287, 901, 1, True, 1),
        ("blackboard", 799, 112, 1106, 611, 1, True, 2),
        ("info_board", 2313, 113, 319, 353, 1, True, 3),
        ("lockers", 2216, 511, 498, 637, 1, True, 4),
        ("shelf", 1723, 395, 481, 529, 1, True, 5),
        ("desk", 631, 654, 645, 343, 1, True, 6),
        ("teacher", 1239, 330, 343, 774, 1, True, 7),
        ("student1", 280, 869, 639, 662, 1, True, 8),
        ("student2", 1034, 897, 582, 633, 1, True, 9),
        ("student3", 1780, 867, 639, 664, 1, True, 10),
    ]

    for slug, x, y, w, h, z, interactive, order in objects:
        op.execute(f"""
            INSERT INTO map_objects
                (id, map_id, slug, x, y, width, height, z_index, is_interactive, order_index)
            SELECT gen_random_uuid(), m.id,
                '{slug}', {x}, {y}, {w}, {h}, {z},
                {"true" if interactive else "false"}, {order}
            FROM maps m WHERE m.slug = 'classroom1'
        """)

    # ── Hints --

    # blackboard
    for text in ("Підійди до дошки", "Подивися на дошку", "На дошці щось написано"):
        op.execute(_hint("blackboard", "uk", text))
    for text in (
        "Go to the board",
        "Look at the board",
        "Something is written on the board",
    ):
        op.execute(_hint("blackboard", "en", text))

    # door
    for text in ("Підійди до дверей", "Двері щось приховують", "Перевір біля дверей"):
        op.execute(_hint("door", "uk", text))
    for text in ("Go to the door", "The door hides something", "Check near the door"):
        op.execute(_hint("door", "en", text))

    # info_board
    for text in (
        "Подивися на стенд",
        "На стенді є оголошення",
        "Перевір інформаційний стенд",
    ):
        op.execute(_hint("info_board", "uk", text))
    for text in (
        "Look at the info board",
        "There are announcements",
        "Check the info board",
    ):
        op.execute(_hint("info_board", "en", text))

    # lockers
    for text in ("Відкрий шафку", "Перевір шафки", "Там щось може бути"):
        op.execute(_hint("lockers", "uk", text))
    for text in ("Open the locker", "Check the lockers", "Something might be there"):
        op.execute(_hint("lockers", "en", text))

    # shelf
    for text in ("Подивися на полицю", "На полиці є книги", "Перевір полицю"):
        op.execute(_hint("shelf", "uk", text))
    for text in (
        "Look at the shelf",
        "There are books on the shelf",
        "Check the shelf",
    ):
        op.execute(_hint("shelf", "en", text))

    # desk
    for text in (
        "Підійди до столу біля дошки",
        "На столі щось лежить",
        "Перевір стіл учителя",
    ):
        op.execute(_hint("desk", "uk", text))
    for text in (
        "Go to the desk near the board",
        "Something is on the desk",
        "Check the teacher's desk",
    ):
        op.execute(_hint("desk", "en", text))

    # teacher
    for text in ("Запитай у вчителя", "Вчитель щось знає", "Підійди до вчителя"):
        op.execute(_hint("teacher", "uk", text))
    for text in ("Ask the teacher", "The teacher knows something", "Go to the teacher"):
        op.execute(_hint("teacher", "en", text))

    # student1
    for text in (
        "Запитай у хлопчика ліворуч",
        "Хлопчик зліва щось знає",
        "Підійди до учня ліворуч",
    ):
        op.execute(_hint("student1", "uk", text))
    for text in (
        "Ask the boy on the left",
        "The boy on the left knows something",
        "Go to the student on the left",
    ):
        op.execute(_hint("student1", "en", text))

    # student2
    for text in (
        "Запитай у дівчинки з хвостиком",
        "Дівчинка в центрі щось знає",
        "Підійди до учениці по центру",
    ):
        op.execute(_hint("student2", "uk", text))
    for text in (
        "Ask the girl with the ponytail",
        "The girl in the center knows something",
        "Go to the student in the center",
    ):
        op.execute(_hint("student2", "en", text))

    # student3
    for text in (
        "Запитай у дівчинки праворуч",
        "Дівчинка з шапкою щось знає",
        "Підійди до учениці праворуч",
    ):
        op.execute(_hint("student3", "uk", text))
    for text in (
        "Ask the girl on the right",
        "The girl with the hat knows something",
        "Go to the student on the right",
    ):
        op.execute(_hint("student3", "en", text))


def downgrade() -> None:
    """Remove classroom1 seed data."""
    op.execute("DELETE FROM maps WHERE slug = 'classroom1'")
