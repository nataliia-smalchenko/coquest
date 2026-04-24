"""
Structured logging configuration using structlog.

Call configure_logging() once at application startup (in lifespan).
Then obtain a logger anywhere with:

    import structlog
    log = structlog.get_logger(__name__)
"""

import logging
import sys

import structlog


def configure_logging(json_logs: bool = True, log_level: str = "INFO") -> None:
    """Set up structlog with shared processors for both stdlib and structlog loggers."""

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,       # thread-local/async context
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if json_logs:
        # Production: emit newline-delimited JSON for log aggregators (e.g. Loki, CloudWatch)
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        # Development: human-readable coloured output
        renderer = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            # Prepare the event_dict for the stdlib formatter
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        # Processors applied *after* the stdlib record is received
        processor=renderer,
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)

    # Silence noisy third-party loggers
    for noisy in ("uvicorn.access", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
