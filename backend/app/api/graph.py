import logging

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.schemas import GraphResponse
from app.services.graph import GraphSourceError, load_graph

logger = logging.getLogger("app.api.graph")

router = APIRouter()


@router.get("/api/graph", response_model=GraphResponse)
def get_graph() -> GraphResponse:
    settings = get_settings()
    try:
        return load_graph(settings.demo_transactions_path)
    except GraphSourceError as exc:
        logger.error("graph source data error: %s", exc)
        raise HTTPException(status_code=500, detail="transaction source data is unavailable or malformed") from exc
