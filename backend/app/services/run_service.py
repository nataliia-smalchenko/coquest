"""Facade: re-exports all sub-service methods under RunService for backward compatibility.

Direct model access and DB queries live in:
  - run_core.py         (RunCoreService)        – CRUD, lifecycle, player management
  - run_distribution.py (RunDistributionService) – resource distribution algorithms
  - run_results.py      (RunResultsService)      – player results, teacher monitor
"""

# Re-export module-level helpers used by team_service and progress_service via
# lazy imports (e.g. `from app.services.run_service import _player_response`).
from app.services.run_core import (  # noqa: F401
    AVATAR_COLORS,
    RunCoreService,
    _load_own_session,
    _load_session,
    _maybe_expire_session,
    _now,
    _player_response,
    _session_response,
)
from app.services.run_distribution import RunDistributionService
from app.services.run_results import RunResultsService


class RunService:
    """Facade that delegates every call to the appropriate specialised service."""

    # --- Core: CRUD & lifecycle ---
    get_player_by_token = RunCoreService.get_player_by_token
    list_sessions = RunCoreService.list_sessions
    create_session = RunCoreService.create_session
    get_session_by_code = RunCoreService.get_session_by_code
    join_session = RunCoreService.join_session
    rejoin_session = RunCoreService.rejoin_session
    start_session = RunCoreService.start_session
    player_start_session = RunCoreService.player_start_session
    player_timeout = RunCoreService.player_timeout
    stop_session = RunCoreService.stop_session
    delete_session = RunCoreService.delete_session
    update_session_settings = RunCoreService.update_session_settings
    restart_session = RunCoreService.restart_session
    get_game_info = RunCoreService.get_game_info
    update_player_guest_name = RunCoreService.update_player_guest_name
    delete_player = RunCoreService.delete_player
    get_session_with_players = RunCoreService.get_session_with_players
    get_quest_settings = RunCoreService.get_quest_settings
    get_session_timing = RunCoreService.get_session_timing
    get_team_players = RunCoreService.get_team_players
    get_next_progress_for_map_object = RunCoreService.get_next_progress_for_map_object

    # --- Distribution ---
    _distribute_resources = RunDistributionService._distribute_resources
    _distribute_resources_for_player = RunDistributionService._distribute_resources_for_player
    _distribute_resources_for_team = RunDistributionService._distribute_resources_for_team

    # --- Results ---
    get_session_results = RunResultsService.get_session_results
    get_teacher_monitor = RunResultsService.get_teacher_monitor
