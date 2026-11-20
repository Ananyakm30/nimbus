import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError

from .config import PROJECT_DIR, settings
from .database import init_db
from .routers import air_quality, dashboard, data, data_quality, sql_explorer

logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("aqi")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    log.info("Database ready")
    yield


app = FastAPI(title="Bengaluru Air Quality Intelligence API", version="1.0.0", lifespan=lifespan,
              description="SQL-backed analytics over cleaned Bengaluru air-quality records.")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_methods=["*"], allow_headers=["*"])

for r in (dashboard.router, air_quality.router, data_quality.router, data.router, sql_explorer.router):
    app.include_router(r)


@app.exception_handler(SQLAlchemyError)
async def db_error(_: Request, exc: SQLAlchemyError):
    log.exception("Database error")
    return JSONResponse({"detail": "A database error occurred. Check the server logs."}, status_code=500)


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}


# Optional: serve the production frontend build from the same process.
_dist = PROJECT_DIR / "frontend" / "dist"
if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = _dist / path
        return FileResponse(f if path and f.is_file() else _dist / "index.html")
