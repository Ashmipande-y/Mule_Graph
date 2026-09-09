import logging

from fastapi import APIRouter, HTTPException

from app.adapters.xgb_baseline import XgbUnavailableError, score_row
from app.schemas import XgbScoreRequest, XgbScoreResponse

logger = logging.getLogger("app.api.xgb_score")

router = APIRouter()


@router.post("/api/xgb-score", response_model=XgbScoreResponse)
def post_xgb_score(request: XgbScoreRequest) -> XgbScoreResponse:
    """Score one card-present transaction row with the standalone XGBoost
    baseline. NOT mule-network risk -- see XgbScoreRequest's docstring and
    backend/docs/integration-contract.md. Never called by /api/graph.
    """
    try:
        result = score_row(request.time, request.amount, request.v)
    except XgbUnavailableError as exc:
        logger.error("xgboost baseline unavailable: %s", exc)
        raise HTTPException(status_code=503, detail="the xgboost baseline model is not available on this server") from exc
    return XgbScoreResponse(**result)
