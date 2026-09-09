import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.aml import router as aml_router
from app.api.graph import router as graph_router
from app.api.health import router as health_router
from app.api.xgb_score import router as xgb_score_router
from app.config import get_settings

settings = get_settings()
logging.basicConfig(level=settings.log_level)

app = FastAPI(title="MuleGraph Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # POST /api/xgb-score needs POST here too: a browser preflights any POST
    # carrying a JSON body, and Starlette's CORSMiddleware rejects the
    # preflight itself (400, Access-Control-Allow-Methods omitting POST)
    # when the method isn't listed -- curl doesn't preflight, so this was
    # invisible to curl-only verification. See
    # backend/docs/integration-contract.md.
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(graph_router)
app.include_router(xgb_score_router)
app.include_router(aml_router)
