"""Create cases from server-verified findings; save decisions against revisions."""
from typing import Literal
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from app.api.events import validate_workspace
from app.schemas import AssessRequest
from app.services.case_service import CaseConflict, CaseService, get_case_service
from app.services.graph import GraphSourceError, _build_graph, validate_transactions

router = APIRouter(prefix="/api/cases")

def workspace(x_workspace_id: str | None = Header(default=None), workspace_id: str = Query(default="default")) -> str:
    value = validate_workspace(x_workspace_id or workspace_id)
    if value == "*":
        raise HTTPException(422, "Cases require one workspace, not a wildcard.")
    return value

class OpenCaseRequest(AssessRequest):
    source_account: str
    collector_account: str
    intermediary_accounts: list[str]

class CaseStatusUpdateRequest(BaseModel):
    status: Literal["new", "investigating", "flagged", "closed"]
    expected_revision: int = Field(ge=1)
    author: str = Field(default="analyst", min_length=1, max_length=100)
    note: str | None = Field(default=None, max_length=10000)

@router.get("")
def list_cases(ws: str = Depends(workspace), service: CaseService = Depends(get_case_service)):
    return service.list_cases(ws)

@router.post("")
def open_case(payload: OpenCaseRequest, ws: str = Depends(workspace), service: CaseService = Depends(get_case_service)):
    try:
        transactions = validate_transactions([t.model_dump() for t in payload.transactions])
        graph = _build_graph(transactions)
    except GraphSourceError as exc:
        raise HTTPException(422, str(exc)) from exc
    finding = next((f for f in graph.findings if f.source_account == payload.source_account
                    and f.collector_account == payload.collector_account
                    and sorted(f.intermediary_accounts) == sorted(payload.intermediary_accounts)), None)
    if finding is None:
        raise HTTPException(422, "The submitted transactions do not support this finding.")
    return service.open_case(graph.model_dump(), transactions, finding.model_dump(), ws)

@router.get("/{case_id}")
def get_case(case_id: str, ws: str = Depends(workspace), service: CaseService = Depends(get_case_service)):
    case = service.get_case(case_id, ws)
    if case is None:
        raise HTTPException(404, "Case not found in this workspace.")
    return case

@router.post("/{case_id}/status")
def update_case_status(case_id: str, payload: CaseStatusUpdateRequest, ws: str = Depends(workspace), service: CaseService = Depends(get_case_service)):
    try:
        return service.update_case_status(case_id, payload.status, payload.expected_revision, payload.author, payload.note, ws)
    except KeyError as exc:
        raise HTTPException(404, "Case not found in this workspace.") from exc
    except CaseConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

