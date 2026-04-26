"""Facade: re-exports all sub-service methods under RunService for backward compatibility.

Direct model access and DB queries live in:
  - run_core.py         (RunCoreService)        – CRUD, lifecycle, player management
  - run_distribution.py (RunDistributionService) – resource distribution algorithms
  - run_results.py      (RunResultsService)      – player results, teacher monitor
  - progress_service.py (ProgressService)        – answer submission, text viewing, review
"""

# Re-export module-level helpers used by team_service and progress_service via
# lazy imports (e.g. `from app.services.run_service import _player_response`).
from app.services.run_core import (  # noqa: F401
    AVATAR_COLORS,
    RunCoreService,
    _load_own_run,
    _load_run,
    _maybe_expire_run,
    _now,
    _player_response,
    _run_response,
)
from app.services.run_distribution import RunDistributionService
from app.services.progress_service import ProgressService
from app.services.run_results import RunResultsService


class RunService:
    """Facade that delegates every call to the appropriate specialised service."""

    # --- Core: CRUD & lifecycle ---
    get_player_by_token = RunCoreService.get_player_by_token
    list_runs = RunCoreService.list_runs
    create_run = RunCoreService.create_run
    get_run_by_code = RunCoreService.get_run_by_code
    join_run = RunCoreService.join_run
    rejoin_run = RunCoreService.rejoin_run
    start_run = RunCoreService.start_run
    player_start_run = RunCoreService.player_start_run
    player_timeout = RunCoreService.player_timeout
    stop_run = RunCoreService.stop_run
    delete_run = RunCoreService.delete_run
    update_run_settings = RunCoreService.update_run_settings
    restart_run = RunCoreService.restart_run
    get_game_info = RunCoreService.get_game_info
    update_player_guest_name = RunCoreService.update_player_guest_name
    delete_player = RunCoreService.delete_player
    get_run_with_players = RunCoreService.get_run_with_players
    get_quest_settings = RunCoreService.get_quest_settings
    get_run_timing = RunCoreService.get_run_timing
    get_team_players = RunCoreService.get_team_players
    get_next_progress_for_map_object = RunCoreService.get_next_progress_for_map_object

    # --- Distribution ---
    _distribute_resources = RunDistributionService._distribute_resources
    _distribute_resources_for_player = (
        RunDistributionService._distribute_resources_for_player
    )
    _distribute_resources_for_team = (
        RunDistributionService._distribute_resources_for_team
    )

    # --- Results ---
    get_run_results = RunResultsService.get_run_results
    get_teacher_monitor = RunResultsService.get_teacher_monitor

    # --- Progress & answers ---
    submit_answer = ProgressService.submit_answer
    mark_text_viewed = ProgressService.mark_text_viewed
    review_answer = ProgressService.review_answer
