
from typing import Any

import numpy as np
from sklearn.ensemble import IsolationForest


FEATURES = [
    "temperature",
    "vibration",
    "pressure",
    "flow_rate",
]


def detect_anomalies(
    readings: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not readings:
        return []

    valid_readings = []

    for reading in readings:
        try:
            values = [float(reading[key]) for key in FEATURES]

            if not all(np.isfinite(value) for value in values):
                continue

            valid_readings.append((reading, values))

        except (KeyError, TypeError, ValueError):
            continue

    if len(valid_readings) < 10:
        return [
            {
                **reading,
                "is_anomaly": False,
                "anomaly_score": None,
                "message": "At least 10 valid readings are needed.",
            }
            for reading, _ in valid_readings
        ]

    data = np.asarray(
        [values for _, values in valid_readings],
        dtype=float,
    )

    model = IsolationForest(
        n_estimators=100,
        contamination=0.05,
        random_state=42,
    )

    predictions = model.fit_predict(data)
    scores = model.decision_function(data)

    results = []

    for (reading, _), prediction, score in zip(
        valid_readings,
        predictions,
        scores,
    ):
        is_anomaly = int(prediction) == -1

        results.append(
            {
                **reading,
                "is_anomaly": is_anomaly,
                "anomaly_score": round(float(score), 4),
                "message": (
                    "Unusual pump reading detected."
                    if is_anomaly
                    else "Reading appears normal."
                ),
            }
        )

    return results


def calculate_pump_risk(
    readings: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Estimate pump risk using the latest sensor reading
    and the proportion of unusual readings.

    These are preliminary software rules, not validated
    industrial safety limits.
    """

    if not readings:
        return {
            "risk_level": "Unknown",
            "risk_score": None,
            "reasons": ["No valid sensor readings available."],
        }

    latest = readings[-1]

    try:
        temperature = float(latest["temperature"])
        vibration = float(latest["vibration"])
        pressure = float(latest["pressure"])
        flow_rate = float(latest["flow_rate"])

        values = [temperature, vibration, pressure, flow_rate]

        if not all(np.isfinite(value) for value in values):
            raise ValueError("Non-finite sensor value")

    except (KeyError, TypeError, ValueError):
        return {
            "risk_level": "Unknown",
            "risk_score": None,
            "reasons": ["Latest sensor reading is invalid."],
        }

    reasons = []
    risk_score = 0

    # Preliminary example thresholds.
    if temperature >= 80:
        risk_score += 40
        reasons.append("High temperature: 80 or above.")
    elif temperature >= 70:
        risk_score += 20
        reasons.append("Elevated temperature: 70 or above.")

    if vibration >= 4:
        risk_score += 30
        reasons.append("High vibration: 4 or above.")
    elif vibration >= 3:
        risk_score += 15
        reasons.append("Elevated vibration: 3 or above.")

    if pressure < 2:
        risk_score += 20
        reasons.append("Low pressure: below 2.")

    if flow_rate < 80:
        risk_score += 20
        reasons.append("Low flow rate: below 80.")

    valid_results = detect_anomalies(readings)

    if valid_results:
        anomaly_count = sum(
            1 for item in valid_results if item["is_anomaly"]
        )
        anomaly_percentage = (
            anomaly_count / len(valid_results)
        ) * 100

        if anomaly_percentage >= 10:
            risk_score += 20
            reasons.append("Many unusual readings in the analysis window.")
        elif anomaly_percentage >= 5:
            risk_score += 10
            reasons.append("Some unusual readings in the analysis window.")

    risk_score = min(risk_score, 100)

    if risk_score >= 60:
        risk_level = "High"
    elif risk_score >= 30:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    if not reasons:
        reasons.append("No configured risk thresholds were exceeded.")

    return {
        "risk_level": risk_level,
        "risk_score": risk_score,
        "reasons": reasons,
    }
    
def calculate_pump_risk(readings):
    """
    Preliminary rule-based pump risk assessment.
    Thresholds are examples and must be validated against
    manufacturer specifications before real-world use.
    """
    import math

    if not readings:
        return {
            "risk_level": "Unknown",
            "risk_score": 0,
            "reasons": ["No telemetry readings available."],
            "inspection_suggestions": [
                "Check whether the pump is sending sensor data."
            ],
            "sensor_summary": {},
        }

    valid_readings = []

    sensor_fields = [
        "temperature",
        "vibration",
        "pressure",
        "flow_rate",
    ]

    for reading in readings:
        cleaned = {}

        try:
            for field in sensor_fields:
                value = float(reading.get(field))
                if not math.isfinite(value):
                    raise ValueError("Non-finite sensor value")
                cleaned[field] = value

            valid_readings.append(cleaned)

        except (TypeError, ValueError):
            continue

    if not valid_readings:
        return {
            "risk_level": "Unknown",
            "risk_score": 0,
            "reasons": ["No valid sensor readings available."],
            "inspection_suggestions": [
                "Check sensor values and telemetry data quality."
            ],
            "sensor_summary": {},
        }

    latest = valid_readings[-1]

    score = 0
    reasons = []
    suggestions = []

    # Example temperature rules — validate before real-world use.
    if latest["temperature"] >= 80:
        score += 40
        reasons.append("High temperature: 80°C or above.")
        suggestions.append(
            "Inspect cooling, lubrication, and temperature sensors."
        )
    elif latest["temperature"] >= 70:
        score += 20
        reasons.append("Elevated temperature: 70°C or above.")
        suggestions.append(
            "Review the temperature trend and operating conditions."
        )

    # Example vibration rules — validate before real-world use.
    if latest["vibration"] >= 4:
        score += 30
        reasons.append("High vibration: 4 or above.")
        suggestions.append(
            "Inspect mounting, alignment, and possible mechanical wear."
        )
    elif latest["vibration"] >= 3:
        score += 15
        reasons.append("Elevated vibration: 3 or above.")
        suggestions.append(
            "Monitor vibration and inspect for unusual mechanical movement."
        )

    # Example pressure and flow rules.
    if latest["pressure"] < 2:
        score += 20
        reasons.append("Low pressure: below 2.")
        suggestions.append(
            "Check pressure sensors, restrictions, and the water supply."
        )

    if latest["flow_rate"] < 80:
        score += 20
        reasons.append("Low flow rate: below 80 L/min.")
        suggestions.append(
            "Check for blockages, leakage, or reduced water supply."
        )

    # Run the existing ML anomaly detector on valid readings.
    try:
        anomaly_results = detect_anomalies(valid_readings)
        anomaly_count = sum(
            1 for item in anomaly_results
            if item.get("is_anomaly")
        )
        anomaly_percentage = (
            anomaly_count / len(valid_readings)
        ) * 100

        if anomaly_percentage >= 10:
            score += 20
            reasons.append(
                "At least 10% of readings were flagged as unusual."
            )
            suggestions.append(
                "Review flagged readings and check sensor reliability."
            )
        elif anomaly_percentage >= 5:
            score += 10
            reasons.append(
                "Some unusual readings were found in the analysis window."
            )
            suggestions.append(
                "Investigate unusual readings and compare them with recent trends."
            )

    except Exception:
        anomaly_count = None
        anomaly_percentage = None
        reasons.append("ML anomaly analysis was unavailable.")

    score = min(score, 100)

    if score >= 60:
        risk_level = "High"
    elif score >= 30:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    if not reasons:
        reasons.append(
            "No configured risk rules were triggered by the latest reading."
        )
        suggestions.append(
            "Continue routine monitoring and follow the maintenance schedule."
        )

    return {
        "risk_level": risk_level,
        "risk_score": score,
        "reasons": reasons,
        "inspection_suggestions": list(dict.fromkeys(suggestions)),
        "readings_used": len(valid_readings),
        "latest_reading": latest,
        "anomaly_count": anomaly_count,
        "anomaly_percentage": (
            round(anomaly_percentage, 2)
            if anomaly_percentage is not None
            else None
        ),
        "sensor_summary": {
            field: {
                "minimum": round(
                    min(item[field] for item in valid_readings), 2
                ),
                "maximum": round(
                    max(item[field] for item in valid_readings), 2
                ),
                "average": round(
                    sum(item[field] for item in valid_readings)
                    / len(valid_readings), 2
                ),
            }
            for field in sensor_fields
        },
        "assessment_note": (
            "Preliminary rule-based estimate, not a validated "
            "failure prediction. Verify thresholds against "
            "manufacturer specifications."
        ),
    }
