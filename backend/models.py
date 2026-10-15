
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import relationship

from database import Base


def utc_now():
    return datetime.now(timezone.utc)


class Pump(Base):
    __tablename__ = "pumps"

    id = Column(Integer, primary_key=True, index=True)
    pump_code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(150), nullable=False)
    location = Column(String(200), nullable=True)
    status = Column(String(30), default="active", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    telemetry_records = relationship(
        "Telemetry",
        back_populates="pump",
        cascade="all, delete-orphan",
    )
    alerts = relationship(
        "Alert",
        back_populates="pump",
        cascade="all, delete-orphan",
    )
    maintenance_records = relationship(
        "MaintenanceRecord",
        back_populates="pump",
        cascade="all, delete-orphan",
    )


class Telemetry(Base):
    __tablename__ = "telemetry"

    id = Column(Integer, primary_key=True, index=True)
    pump_id = Column(
        Integer,
        ForeignKey("pumps.id"),
        nullable=False,
        index=True,
    )
    temperature = Column(Float, nullable=False)
    vibration = Column(Float, nullable=False)
    pressure = Column(Float, nullable=False)
    flow_rate = Column(Float, nullable=False)
    recorded_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    pump = relationship("Pump", back_populates="telemetry_records")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    pump_id = Column(
        Integer,
        ForeignKey("pumps.id"),
        nullable=False,
        index=True,
    )
    alert_type = Column(String(100), nullable=False)
    severity = Column(String(30), default="High", nullable=False)
    message = Column(Text, nullable=False)
    value = Column(Float, nullable=True)
    threshold = Column(Float, nullable=True)
    status = Column(String(30), default="Open", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    pump = relationship("Pump", back_populates="alerts")


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id = Column(Integer, primary_key=True, index=True)
    pump_id = Column(
        Integer,
        ForeignKey("pumps.id"),
        nullable=False,
        index=True,
    )
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    maintenance_type = Column(String(50), nullable=False)
    status = Column(String(30), default="Scheduled", nullable=False)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    performed_by = Column(String(150), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    pump = relationship("Pump", back_populates="maintenance_records")
