
import math
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import Alert, MaintenanceRecord, Pump, Telemetry
from services.ai_service import calculate_pump_risk, detect_anomalies


# ==================================================
# PATHS
# ==================================================

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"
FRONTEND_ASSETS = FRONTEND_DIST / "assets"


# ==================================================
# DATABASE STARTUP
# ==================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


# ==================================================
# FASTAPI APPLICATION
# ==================================================

app = FastAPI(
    title="AquaIntel",
    description=(
        "AI-Based Water Pump Monitoring "
        "and Predictive Maintenance System"
    ),
    version="1.1.0",
    lifespan=lifespan,
)


if FRONTEND_ASSETS.is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=str(FRONTEND_ASSETS)),
        name="frontend-assets",
    )


# ==================================================
# REQUEST AND RESPONSE SCHEMAS
# ==================================================

class PumpCreate(BaseModel):
    pump_code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=100)
    location: str = Field(min_length=2, max_length=150)


class PumpResponse(BaseModel):
    id: int
    pump_code: str
    name: str
    location: str
    status: str

    model_config = {"from_attributes": True}



class TelemetryCreate(BaseModel):
    pump_id: int = Field(gt=0)
    temperature: float = Field(ge=-20, le=150)
    vibration: float = Field(ge=0)
    pressure: float = Field(ge=0)
    flow_rate: float = Field(ge=0)



class TelemetryResponse(BaseModel):
    id: int
    pump_id: int
    temperature: float
    vibration: float
    pressure: float
    flow_rate: float
    recorded_at: datetime

    model_config = {"from_attributes": True}


class AlertResponse(BaseModel):
    id: int
    pump_id: int
    alert_type: str
    severity: str
    message: str
    value: float
    threshold: float
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MaintenanceCreate(BaseModel):
    pump_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    maintenance_type: str = Field(min_length=1, max_length=50)
    status: str = "Scheduled"
    scheduled_at: datetime | None = None
    performed_by: str | None = None


class MaintenanceResponse(BaseModel):
    id: int
    pump_id: int
    title: str
    description: str | None = None
    maintenance_type: str
    status: str
    scheduled_at: datetime | None = None
    completed_at: datetime | None = None
    performed_by: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ==================================================
# FRONTEND
# ==================================================

@app.get("/", include_in_schema=False)
def home():
    index_file = FRONTEND_DIST / "index.html"

    if not index_file.is_file():
        raise HTTPException(
            status_code=503,
            detail=(
                "Frontend build not found. "
                "Run npm.cmd run build inside the frontend folder."
            ),
        )

    return FileResponse(index_file)


# ==================================================
# HEALTH CHECK
# ==================================================

@app.get("/health", tags=["System"])
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(select(1))
    except Exception:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "application": "AquaIntel",
                "database": "disconnected",
            },
        )

    return {
        "status": "healthy",
        "application": "AquaIntel",
        "database": "connected",
        "frontend_built": (FRONTEND_DIST / "index.html").is_file(),
    }


# ==================================================
# PUMP APIs
# ==================================================

@app.post(
    "/api/v1/pumps/",
    response_model=PumpResponse,
    status_code=201,
    tags=["Pumps"],
)
def create_pump(
    pump_data: PumpCreate,
    db: Session = Depends(get_db),
):
    pump_code = pump_data.pump_code.strip()
    name = pump_data.name.strip()
    location = pump_data.location.strip()

    if not pump_code or not name or not location:
        raise HTTPException(
            status_code=422,
            detail="Pump code, name, and location cannot be empty",
        )

    existing = db.scalar(
        select(Pump).where(Pump.pump_code == pump_code)
    )

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Pump code already exists",
        )

    pump = Pump(
        pump_code=pump_code,
        name=name,
        location=location,
    )

    try:
        db.add(pump)
        db.commit()
        db.refresh(pump)
        return pump
    except Exception:
        db.rollback()
        raise


@app.get(
    "/api/v1/pumps/",
    response_model=list[PumpResponse],
    tags=["Pumps"],
)
def list_pumps(db: Session = Depends(get_db)):
    return db.scalars(
        select(Pump).order_by(Pump.id)
    ).all()


@app.get(
    "/api/v1/pumps/{pump_id}",
    response_model=PumpResponse,
    tags=["Pumps"],
)
def get_pump(
    pump_id: int,
    db: Session = Depends(get_db),
):
    pump = db.get(Pump, pump_id)

    if pump is None:
        raise HTTPException(
            status_code=404,
            detail="Pump not found",
        )

    return pump


# ==================================================
# TELEMETRY APIs
# ==================================================

@app.post(
    "/api/v1/telemetry/",
    response_model=TelemetryResponse,
    status_code=201,
    tags=["Telemetry"],
)
def create_telemetry(
    data: TelemetryCreate,
    db: Session = Depends(get_db),
):
    values = [
        data.temperature,
        data.vibration,
        data.pressure,
        data.flow_rate,
    ]

    if not all(math.isfinite(value) for value in values):
        raise HTTPException(
            status_code=422,
            detail="Sensor readings must be finite numbers",
        )

    pump = db.get(Pump, data.pump_id)

    if pump is None:
        raise HTTPException(
            status_code=404,
            detail="Pump not found",
        )

    reading = Telemetry(
        pump_id=data.pump_id,
        temperature=data.temperature,
        vibration=data.vibration,
        pressure=data.pressure,
        flow_rate=data.flow_rate,
        recorded_at=datetime.now(timezone.utc),
    )

    # Demonstration thresholds only. Validate against actual
    # equipment specifications before real-world use.
    checks = [
        (
            "High Temperature",
            data.temperature,
            70.0,
            data.temperature > 70.0,
        ),
        (
            "High Vibration",
            data.vibration,
            5.0,
            data.vibration > 5.0,
        ),
        (
            "Low Pressure",
            data.pressure,
            2.0,
            data.pressure < 2.0,
        ),
    ]

    try:
        db.add(reading)
        db.flush()

        # Only one loop: update the newest matching open alert,
        # or create an alert if none exists.
        for alert_type, value, threshold, triggered in checks:
            if not triggered:
                continue

            existing_alert = db.scalar(
                select(Alert)
                .where(
                    Alert.pump_id == data.pump_id,
                    Alert.alert_type == alert_type,
                    Alert.status == "Open",
                )
                .order_by(Alert.id.desc())
                .limit(1)
            )

            if existing_alert is None:
                db.add(
                    Alert(
                        pump_id=data.pump_id,
                        alert_type=alert_type,
                        severity="High",
                        message=(
                            f"{alert_type} detected for pump "
                            f"{pump.pump_code}; latest reading: {value}"
                        ),
                        value=value,
                        threshold=threshold,
                        status="Open",
                    )
                )
            else:
                existing_alert.value = value
                existing_alert.threshold = threshold
                existing_alert.message = (
                    f"{alert_type} detected for pump "
                    f"{pump.pump_code}; latest reading: {value}"
                )

        db.commit()
        db.refresh(reading)
        return reading

    except Exception:
        db.rollback()
        raise


@app.get(
    "/api/v1/telemetry/",
    response_model=list[TelemetryResponse],
    tags=["Telemetry"],
)
def list_telemetry(
    pump_id: int | None = Query(default=None, gt=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    statement = select(Telemetry).order_by(
        Telemetry.recorded_at.desc(),
        Telemetry.id.desc(),
    )

    if pump_id is not None:
        statement = statement.where(
            Telemetry.pump_id == pump_id
        )

    return db.scalars(statement.limit(limit)).all()


# ==================================================
# ALERT APIs
# ==================================================

@app.get(
    "/api/v1/alerts/",
    response_model=list[AlertResponse],
    tags=["Alerts"],
)
def list_alerts(
    pump_id: int | None = Query(default=None, gt=0),
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    statement = select(Alert).order_by(
        Alert.created_at.desc(),
        Alert.id.desc(),
    )

    if pump_id is not None:
        statement = statement.where(
            Alert.pump_id == pump_id
        )

    if status is not None:
        normalized_status = status.strip().lower()

        if normalized_status not in {"open", "acknowledged"}:
            raise HTTPException(
                status_code=422,
                detail="Status must be Open or Acknowledged",
            )

        expected_status = (
            "Open"
            if normalized_status == "open"
            else "Acknowledged"
        )

        statement = statement.where(
            Alert.status == expected_status
        )

    return db.scalars(statement.limit(limit)).all()


@app.patch(
    "/api/v1/alerts/{alert_id}/acknowledge",
    response_model=AlertResponse,
    tags=["Alerts"],
)
def acknowledge_alert(
    alert_id: int,
    db: Session = Depends(get_db),
):
    alert = db.get(Alert, alert_id)

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Alert not found",
        )

    alert.status = "Acknowledged"

    try:
        db.commit()
        db.refresh(alert)
        return alert
    except Exception:
        db.rollback()
        raise


# ==================================================
# KPI APIs
# ==================================================

@app.get(
    "/api/v1/kpis/summary",
    tags=["KPIs"],
)
def get_kpi_summary(db: Session = Depends(get_db)):
    total_pumps = db.scalar(
        select(func.count()).select_from(Pump)
    ) or 0

    active_pumps = db.scalar(
        select(func.count()).select_from(Pump).where(
            func.lower(Pump.status) == "active"
        )
    ) or 0

    total_readings = db.scalar(
        select(func.count()).select_from(Telemetry)
    ) or 0

    total_alerts = db.scalar(
        select(func.count()).select_from(Alert)
    ) or 0

    open_alerts = db.scalar(
        select(func.count()).select_from(Alert).where(
            Alert.status == "Open"
        )
    ) or 0

    acknowledged_alerts = db.scalar(
        select(func.count()).select_from(Alert).where(
            Alert.status == "Acknowledged"
        )
    ) or 0

    scheduled_maintenance = db.scalar(
        select(func.count()).select_from(MaintenanceRecord).where(
            MaintenanceRecord.status == "Scheduled"
        )
    ) or 0

    completed_maintenance = db.scalar(
        select(func.count()).select_from(MaintenanceRecord).where(
            MaintenanceRecord.status == "Completed"
        )
    ) or 0

    averages = db.execute(
        select(
            func.avg(Telemetry.temperature),
            func.avg(Telemetry.vibration),
            func.avg(Telemetry.pressure),
            func.avg(Telemetry.flow_rate),
        )
    ).one()

    def rounded(value):
        return round(float(value), 2) if value is not None else None

    return {
        "total_pumps": int(total_pumps),
        "active_pumps": int(active_pumps),
        "inactive_pumps": max(
            int(total_pumps) - int(active_pumps), 0
        ),
        "total_telemetry_readings": int(total_readings),
        "total_alerts": int(total_alerts),
        "open_alerts": int(open_alerts),
        "acknowledged_alerts": int(acknowledged_alerts),
        "scheduled_maintenance": int(scheduled_maintenance),
        "completed_maintenance": int(completed_maintenance),
        "average_temperature": rounded(averages[0]),
        "average_vibration": rounded(averages[1]),
        "average_pressure": rounded(averages[2]),
        "average_flow_rate": rounded(averages[3]),
    }


    return {
        "total_pumps": int(total_pumps),
        "active_pumps": int(active_pumps),
        "inactive_pumps": max(
            int(total_pumps) - int(active_pumps), 0
        ),
        "total_telemetry_readings": int(total_readings),
        "total_alerts": int(total_alerts),
        "open_alerts": int(open_alerts),
        "acknowledged_alerts": int(acknowledged_alerts),
        "scheduled_maintenance": int(scheduled_maintenance),
        "completed_maintenance": int(completed_maintenance),
        "average_temperature": rounded(averages[0]),
        "average_vibration": rounded(averages[1]),
        "average_pressure": rounded(averages[2]),
        "average_flow_rate": rounded(averages[3]),
    }


# ==================================================
# AI ANOMALY DETECTION API
# ==================================================

@app.get(
    "/api/v1/ai/anomalies",
    tags=["AI Analytics"],
)
def get_ai_anomalies(
    pump_id: int | None = Query(default=None, gt=0),
    limit: int = Query(default=100, ge=10, le=500),
    db: Session = Depends(get_db),
):
    statement = select(Telemetry).order_by(
        Telemetry.recorded_at.desc(),
        Telemetry.id.desc(),
    )

    if pump_id is not None:
        statement = statement.where(
            Telemetry.pump_id == pump_id
        )

    readings = db.scalars(statement.limit(limit)).all()
    readings.reverse()

    input_data = [
        {
            "id": reading.id,
            "pump_id": reading.pump_id,
            "temperature": reading.temperature,
            "vibration": reading.vibration,
            "pressure": reading.pressure,
            "flow_rate": reading.flow_rate,
            "recorded_at": reading.recorded_at.isoformat(),
        }
        for reading in readings
    ]

    results = detect_anomalies(input_data)

    return {
        "pump_id": pump_id,
        "readings_analyzed": len(results),
        "anomaly_count": sum(
            1 for result in results if result["is_anomaly"]
        ),
        "anomalies": [
            result for result in results
            if result["is_anomaly"]
        ],
        "results": results,
    }
@app.get("/api/v1/ai/pump-risk", tags=["AI Analytics"])
def get_pump_risk(
    pump_id: int = Query(default=1, gt=0),
    limit: int = Query(default=100, ge=10, le=500),
    db: Session = Depends(get_db),
):
    statement = (
        select(Telemetry)
        .where(Telemetry.pump_id == pump_id)
        .order_by(Telemetry.recorded_at.desc(), Telemetry.id.desc())
        .limit(limit)
    )

    readings = db.scalars(statement).all()
    readings.reverse()

    input_data = [
        {
            "id": reading.id,
            "pump_id": reading.pump_id,
            "temperature": reading.temperature,
            "vibration": reading.vibration,
            "pressure": reading.pressure,
            "flow_rate": reading.flow_rate,
            "recorded_at": reading.recorded_at.isoformat(),
        }
        for reading in readings
    ]

    risk = calculate_pump_risk(input_data)

    return {
        "pump_id": pump_id,
        "readings_analyzed": len(input_data),
        **risk,
    }



# ==================================================
# MAINTENANCE MANAGEMENT APIs
# ==================================================

@app.post(
    "/api/v1/maintenance/",
    response_model=MaintenanceResponse,
    status_code=201,
    tags=["Maintenance"],
)
def create_maintenance(
    payload: MaintenanceCreate,
    db: Session = Depends(get_db),
):
    pump = db.get(Pump, payload.pump_id)

    if pump is None:
        raise HTTPException(
            status_code=404,
            detail="Pump not found",
        )

    title = payload.title.strip()
    maintenance_type = payload.maintenance_type.strip()

    if not title or not maintenance_type:
        raise HTTPException(
            status_code=422,
            detail="Title and maintenance type cannot be empty",
        )

    record = MaintenanceRecord(
        pump_id=payload.pump_id,
        title=title,
        description=payload.description,
        maintenance_type=maintenance_type,
        status="Scheduled",
        scheduled_at=payload.scheduled_at,
        performed_by=payload.performed_by,
    )

    try:
        db.add(record)
        db.commit()
        db.refresh(record)
        return record
    except Exception:
        db.rollback()
        raise


@app.get(
    "/api/v1/maintenance/",
    response_model=list[MaintenanceResponse],
    tags=["Maintenance"],
)
def list_maintenance(
    pump_id: int | None = Query(default=None, ge=1),
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = select(MaintenanceRecord)

    if pump_id is not None:
        query = query.where(
            MaintenanceRecord.pump_id == pump_id
        )

    if status:
        query = query.where(
            func.lower(MaintenanceRecord.status)
            == status.strip().lower()
        )

    query = query.order_by(
        MaintenanceRecord.created_at.desc()
    ).limit(limit)

    return db.scalars(query).all()


@app.patch(
    "/api/v1/maintenance/{record_id}/complete",
    response_model=MaintenanceResponse,
    tags=["Maintenance"],
)
def complete_maintenance(
    record_id: int,
    db: Session = Depends(get_db),
):
    record = db.get(MaintenanceRecord, record_id)

    if record is None:
        raise HTTPException(
            status_code=404,
            detail="Maintenance record not found",
        )

    if record.status == "Completed":
        return record

    record.status = "Completed"
    record.completed_at = datetime.now(timezone.utc)

    try:
        db.commit()
        db.refresh(record)
        return record
    except Exception:
        db.rollback()
        raise
