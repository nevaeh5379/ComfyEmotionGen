"""
엔드포인트:
    GET  /health            - 헬스체크
    POST /render            - 템플릿 → 프롬프트 리스트
    POST /workflow/inject   - 워크플로우 JSON 에 프롬프트 주입
"""

from typing import Any, Dict, List, Union

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from prompt_dsl import DSLSyntaxError, parse, render, inject_into_workflow


app = FastAPI(
    title="Prompt DSL Server",
    version="0.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RenderRequest(BaseModel):
    template: str = Field(..., description="DSL 템플릿 소스")


class RenderItem(BaseModel):
    filename: str
    prompt: str
    meta: Dict[str, str]


class RenderResponse(BaseModel):
    count: int
    items: List[RenderItem]


class InjectRequest(BaseModel):
    workflow: Dict[str, Any]
    prompt: Union[str, Dict[str, str]] = Field(
        ..., description="문자열 또는 {placeholder: value} 매핑"
    )
    placeholder: str = "{{input}}"


@app.exception_handler(DSLSyntaxError)
async def _dsl_error_handler(_request, exc: DSLSyntaxError):
    return JSONResponse(
        status_code=400,
        content={"error": "DSLSyntaxError", "message": str(exc)},
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/render", response_model=RenderResponse)
def render_endpoint(req: RenderRequest):
    prog = parse(req.template)
    items = render(prog)
    return {"count": len(items), "items": items}


@app.post("/workflow/inject")
def inject_endpoint(req: InjectRequest):
    injected = inject_into_workflow(req.workflow, req.prompt, req.placeholder)
    return {"workflow": injected}
