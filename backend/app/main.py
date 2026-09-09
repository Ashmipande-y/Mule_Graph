import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.aml import router as aml_router
from app.api.assess import router as assess_router
from app.api.cases import router as cases_router
from app.api.events import router as events_router
from app.api.graph import router as graph_router
from app.api.health import router as health_router
from app.api.metrics import router as metrics_router
from app.api.xgb_score import router as xgb_score_router
from app.config import get_settings
from app.services.metrics import get_metrics_collector

settings = get_settings()
logging.basicConfig(level=settings.log_level)

app = FastAPI(title="MuleGraph Backend")

# Record request latencies and error rates
@app.middleware("http")
async def operational_metrics_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start) * 1000
    # Route matching happens inside call_next(); request.scope is shared
    # with the Request object, so the matched route (if any) is available
    # here. Use its path template ("/api/cases/{case_id}/status") rather
    # than the literal request path, or every distinct case/account id ever
    # requested would create its own permanent metrics-dict entry.
    route = request.scope.get("route")
    path_key = route.path if route is not None else request.url.path
    get_metrics_collector().record_request(path_key, duration_ms, response.status_code)
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(graph_router)
app.include_router(assess_router)
app.include_router(xgb_score_router)
app.include_router(aml_router)
app.include_router(events_router)
app.include_router(cases_router)
app.include_router(metrics_router)
