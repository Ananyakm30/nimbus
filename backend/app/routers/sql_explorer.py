from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError

from ..deps import Ctx, get_ctx
from ..sql_analytics import queries as Q
from ..sql_analytics.scope import run

router = APIRouter(prefix="/api/sql", tags=["sql"])


def _describe(ctx: Ctx, q: Q.QueryDef, preview: bool, rows_limit: int) -> dict:
    where, params = ctx.scope.where()
    sql = q.build(where)
    bound = {k: v for k, v in params.items() if f":{k}" in sql}
    item = {"id": q.id, "title": q.title, "endpoint": q.endpoint, "explanation": q.explanation,
            "features": q.features, "sql": sql, "parameters": bound}
    if preview:
        try:
            rows = run(ctx.db, sql, bound)
            item.update(columns=list(rows[0].keys()) if rows else [], rows=rows[:rows_limit], row_count=len(rows))
        except SQLAlchemyError as exc:
            ctx.db.rollback()
            item.update(error=str(exc.__cause__ or exc)[:300], columns=[], rows=[], row_count=0)
    return item


@router.get("/queries")
def list_queries(ctx: Ctx = Depends(get_ctx), preview: bool = False,
                 preview_rows: Annotated[int, Query(ge=1, le=50)] = 8):
    """Every analytical query behind the dashboard. Pass preview=true to execute them all (slow on large data)."""
    items = [_describe(ctx, q, preview, preview_rows) for q in Q.REGISTRY]
    return {"meta": ctx.meta, "items": items, "total": len(items)}


@router.get("/queries/{query_id}")
def get_query(query_id: str, ctx: Ctx = Depends(get_ctx), preview_rows: Annotated[int, Query(ge=1, le=50)] = 8):
    """One query with explanation and a live result preview for the current filters."""
    q = Q.BY_ID.get(query_id)
    if q is None:
        raise HTTPException(404, f"Unknown query '{query_id}'")
    return _describe(ctx, q, True, preview_rows)
