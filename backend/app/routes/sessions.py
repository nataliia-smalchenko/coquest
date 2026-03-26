import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.session_player import SessionPlayer
from app.models.user import User
from app.schemas.resource import ResourceDetailResponse
from app.schemas.session import (
    GameInfoResponse,
    GameSessionDetailResponse,
    GameSessionResponse,
    JoinSessionRequest,
    ReviewAnswerRequest,
    SessionCreate,
    SessionListItem,
    SessionPlayerResponse,
    SessionProgressResponse,
    SubmitAnswerRequest,
    TeacherMonitorResponse,
    UpdateGuestNameRequest,
)
from app.services.session_service import SessionService
from app.utils.dependencies import get_current_teacher
from app.utils.security import verify_token

router = APIRouter(prefix="/api/sessions", tags=["Sessions"])

_optional_bearer = HTTPBearer(auto_error=False)


async def _get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_optional_bearer),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        return None
    payload = verify_token(credentials.credentials)
    if not payload:
        return None
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def _get_player_by_token(
    x_guest_token: Optional[str] = Header(None),
    guest_token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> SessionPlayer:
    token = x_guest_token or guest_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Guest token required"
        )
    result = await db.execute(
        select(SessionPlayer).where(SessionPlayer.guest_token == token)
    )
    player = result.scalar_one_or_none()
    if not player:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid guest token"
        )
    return player


@router.get("/", response_model=List[SessionListItem])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await SessionService.list_sessions(db, teacher.id)


@router.post("/", response_model=GameSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    data: SessionCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await SessionService.create_session(db, teacher.id, data)


@router.get("/code/{session_code}", response_model=GameSessionResponse)
async def get_session_by_code(
    session_code: str,
    db: AsyncSession = Depends(get_db),
):
    return await SessionService.get_session_by_code(db, session_code)


@router.post("/join", response_model=SessionPlayerResponse)
async def join_session(
    data: JoinSessionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(_get_optional_user),
):
    user_id = current_user.id if current_user else None
    return await SessionService.join_session(db, data, user_id)


@router.post("/{session_id}/start", response_model=GameSessionResponse)
async def start_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await SessionService.start_session(db, session_id, teacher.id)


@router.post("/{session_id}/stop", response_model=GameSessionResponse)
async def stop_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await SessionService.stop_session(db, session_id, teacher.id)


@router.get("/{session_id}/monitor", response_model=TeacherMonitorResponse)
async def get_teacher_monitor(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await SessionService.get_teacher_monitor(db, session_id, teacher.id)


@router.post("/progress/{progress_id}/answer", response_model=SessionProgressResponse)
async def submit_answer(
    progress_id: uuid.UUID,
    data: SubmitAnswerRequest,
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    return await SessionService.submit_answer(db, progress_id, player, data)


@router.post("/progress/{progress_id}/viewed", response_model=SessionProgressResponse)
async def mark_text_viewed(
    progress_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    return await SessionService.mark_text_viewed(db, progress_id, player)


@router.post("/progress/{progress_id}/review", response_model=SessionProgressResponse)
async def review_answer(
    progress_id: uuid.UUID,
    data: ReviewAnswerRequest,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await SessionService.review_answer(db, progress_id, teacher.id, data)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    await SessionService.delete_session(db, session_id, teacher.id)


@router.patch(
    "/{session_id}/players/{player_id}/guest-name",
    response_model=SessionPlayerResponse,
)
async def update_player_guest_name(
    session_id: uuid.UUID,
    player_id: uuid.UUID,
    data: UpdateGuestNameRequest,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await SessionService.update_player_guest_name(
        db, session_id, player_id, teacher.id, data.guest_name
    )


@router.delete(
    "/{session_id}/players/{player_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_player(
    session_id: uuid.UUID,
    player_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    await SessionService.delete_player(db, session_id, player_id, teacher.id)


@router.get("/{session_id}/game-info", response_model=GameInfoResponse)
async def get_game_info(
    session_id: uuid.UUID,
    lang: str = Query("uk"),
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    return await SessionService.get_game_info(db, session_id, player, lang)


@router.get("/{session_id}/my-progress", response_model=List[SessionProgressResponse])
async def get_my_progress(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    return await SessionService.get_my_progress(db, session_id, player)


@router.get("/progress/{progress_id}/resource", response_model=ResourceDetailResponse)
async def get_progress_resource(
    progress_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    return await SessionService.get_progress_resource(db, progress_id, player)


@router.get("/{session_id}/results", response_model=GameSessionDetailResponse)
async def get_session_results(
    session_id: uuid.UUID,
    guest_token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await SessionService.get_session_results(db, session_id, guest_token)
