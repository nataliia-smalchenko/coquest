import asyncio
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from app.main import app
from app.database import Base, get_db
from app.config import settings
from app.models.user import User, AuthProvider
from app.models.map import Map, MapTranslation, MapObject
from app.utils.security import create_access_token, get_password_hash

from sqlalchemy.pool import NullPool

# Test database engine
# This will use the DATABASE_URL from pytest.ini which should point to a test DB
test_engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    poolclass=NullPool,
)

TestingSessionLocal = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
)


# Set up event loop for async tests
@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# Initialize test database tables
@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_db():
    async with test_engine.begin() as conn:
        # Drop all tables and recreate them for the test session
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


# DB Session fixture with transactions (rollback after each test)
@pytest_asyncio.fixture()
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with test_engine.connect() as connection:
        transaction = await connection.begin()
        async with TestingSessionLocal(bind=connection) as session:
            yield session
            await transaction.rollback()


# Async client fixture
@pytest_asyncio.fixture()
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    # Override the dependency
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    # Note: If you want to mock Redis or other services, do it here or in app.lifespan

    from httpx import ASGITransport

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# Shared helpers
async def _create_verified_user(
    db_session: AsyncSession,
    *,
    email: str,
    role: str,
    full_name: str = "Test User",
) -> User:
    """Insert a verified user directly into the DB (no email sending)."""
    user = User(
        email=email,
        password_hash=get_password_hash("TestPass123"),
        full_name=full_name,
        role=role,
        auth_provider=AuthProvider.EMAIL,
        is_email_verified=True,
        preferred_language="uk",
    )
    db_session.add(user)
    await db_session.flush()  # get the UUID without committing
    await db_session.refresh(user)
    return user


def _token_for(user: User) -> str:
    """Return a valid access token for *user*."""
    return create_access_token(
        {"sub": str(user.id), "email": user.email, "role": user.role}
    )


@pytest_asyncio.fixture()
async def teacher(db_session: AsyncSession) -> User:
    """A verified teacher user."""
    return await _create_verified_user(
        db_session,
        email=f"teacher_{uuid.uuid4().hex[:8]}@test.com",
        role="teacher",
        full_name="Test Teacher",
    )


@pytest_asyncio.fixture()
async def student(db_session: AsyncSession) -> User:
    """A verified student user."""
    return await _create_verified_user(
        db_session,
        email=f"student_{uuid.uuid4().hex[:8]}@test.com",
        role="student",
        full_name="Test Student",
    )


@pytest.fixture()
def teacher_token(teacher: User) -> str:
    return _token_for(teacher)


@pytest.fixture()
def student_token(student: User) -> str:
    return _token_for(student)


@pytest.fixture()
def teacher_headers(teacher_token: str) -> dict:
    return {"Authorization": f"Bearer {teacher_token}"}


@pytest.fixture()
def student_headers(student_token: str) -> dict:
    return {"Authorization": f"Bearer {student_token}"}


@pytest_asyncio.fixture()
async def db_map(db_session: AsyncSession) -> Map:
    """A map pre-populated in the db for testing quests/maps endpoints."""
    # Check if we already created it (since DB might not reset perfectly between scopes)
    m = Map(
        slug="test-island",
        original_width=1920,
        original_height=1080,
    )
    db_session.add(m)
    await db_session.flush()

    tr = MapTranslation(
        map_id=m.id,
        language="uk",
        name="Тестовий острів",
    )
    obj = MapObject(
        map_id=m.id,
        slug="point_1",
        x=100,
        y=100,
        width=50,
        height=50,
        is_interactive=True,
    )
    db_session.add_all([tr, obj])
    await db_session.commit()
    await db_session.refresh(m)
    return m
