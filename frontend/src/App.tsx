
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./App.css";

type Pump = {
  id: number;
  pump_code: string;
  name: string;
  location: string;
  status: string;
};

type Telemetry = {
  id: number;
  pump_id: number;
  temperature: number;
  vibration: number;
  pressure: number;
  flow_rate: number;
  recorded_at: string;
};

type Alert = {
  id: number;
  pump_id: number;
  alert_type: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
  status: string;
  created_at: string;
};

type Maintenance = {
  id: number;
  pump_id: number;
  title: string;
  description: string | null;
  maintenance_type: string;
  status: string;
  scheduled_at: string | null;
  completed_at: string | null;
  performed_by: string | null;
  created_at: string;
};

type KpiSummary = {
  total_pumps: number;
  active_pumps: number;
  inactive_pumps: number;
  total_telemetry_readings: number;
  total_alerts: number;
  open_alerts: number;
  acknowledged_alerts: number;
  scheduled_maintenance: number;
  completed_maintenance: number;
  average_temperature: number | null;
  average_vibration: number | null;
  average_pressure: number | null;
  average_flow_rate: number | null;
};

type AIAnomaly = {
  id: number;
  pump_id: number;
  temperature: number;
  vibration: number;
  pressure: number;
  flow_rate: number;
  recorded_at: string;
  is_anomaly: boolean;
  anomaly_score: number | null;
  message: string;
};

type AIAnomalyResponse = {
  pump_id: number | null;
  readings_analyzed: number;
  anomaly_count: number;
  anomalies: AIAnomaly[];
  results: AIAnomaly[];
};

type SensorSummary = {
  minimum: number;
  maximum: number;
  average: number;
};

type PumpRiskResponse = {
  pump_id: number;
  readings_analyzed: number;
  risk_level: "Low" | "Medium" | "High" | "Unknown";
  risk_score: number | null;
  reasons: string[];
  inspection_suggestions?: string[];
  readings_used?: number;
  latest_reading?: {
    temperature: number;
    vibration: number;
    pressure: number;
    flow_rate: number;
  };
  anomaly_count?: number | null;
  anomaly_percentage?: number | null;
  sensor_summary?: {
    temperature: SensorSummary;
    vibration: SensorSummary;
    pressure: SensorSummary;
    flow_rate: SensorSummary;
  };
  assessment_note?: string;
};

type MaintenanceForm = {
  pump_id: string;
  title: string;
  description: string;
  maintenance_type: string;
  scheduled_at: string;
  performed_by: string;
};

type Page =
  | "Dashboard"
  | "Pumps"
  | "Telemetry"
  | "Analytics"
  | "Alerts"
  | "Maintenance";

const emptyMaintenanceForm: MaintenanceForm = {
  pump_id: "",
  title: "",
  description: "",
  maintenance_type: "Preventive",
  scheduled_at: "",
  performed_by: "",
};

function App() {
  const [page, setPage] = useState<Page>("Dashboard");
  const [pumps, setPumps] = useState<Pump[]>([]);
  const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [aiData, setAiData] = useState<AIAnomalyResponse | null>(null);
  const [aiError, setAiError] = useState("");
  const [pumpRisk, setPumpRisk] = useState<PumpRiskResponse | null>(null);
  const [pumpRiskError, setPumpRiskError] = useState("");

  const [maintenanceForm, setMaintenanceForm] =
    useState<MaintenanceForm>(emptyMaintenanceForm);

  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedPump, setSelectedPump] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  async function loadDashboard(showLoading = false) {
    if (showLoading) setRefreshing(true);

    try {
      const [
        pumpResponse,
        telemetryResponse,
        alertResponse,
        maintenanceResponse,
        kpiResponse,
      ] = await Promise.all([
        fetch("/api/v1/pumps/"),
        fetch("/api/v1/telemetry/?limit=100"),
        fetch("/api/v1/alerts/?limit=100"),
        fetch("/api/v1/maintenance/?limit=100"),
        fetch("/api/v1/kpis/summary"),
      ]);

      if (
        !pumpResponse.ok ||
        !telemetryResponse.ok ||
        !alertResponse.ok ||
        !maintenanceResponse.ok ||
        !kpiResponse.ok
      ) {
        throw new Error("Could not load AquaIntel data.");
      }

      const [
        pumpData,
        telemetryData,
        alertData,
        maintenanceData,
        kpiData,
      ] = await Promise.all([
        pumpResponse.json(),
        telemetryResponse.json(),
        alertResponse.json(),
        maintenanceResponse.json(),
        kpiResponse.json(),
      ]);

      setPumps(pumpData);
      setTelemetry(telemetryData);
      setAlerts(alertData);
      setMaintenance(maintenanceData);
      setKpis(kpiData);
      setError("");

      try {
        const aiResponse = await fetch(
          "/api/v1/ai/anomalies?limit=100"
        );

        if (!aiResponse.ok) {
          throw new Error("AI endpoint unavailable.");
        }

        const aiResult: AIAnomalyResponse = await aiResponse.json();
        setAiData(aiResult);
        setAiError("");
      } catch {
        setAiError(
          "AI results are unavailable. Check the AI anomaly API."
        );
      }

      try {
        const riskResponse = await fetch(
          "/api/v1/ai/pump-risk?pump_id=1&limit=100"
        );

        if (!riskResponse.ok) {
          throw new Error("Pump risk API unavailable.");
        }

        const riskResult: PumpRiskResponse = await riskResponse.json();
        setPumpRisk(riskResult);
        setPumpRiskError("");
      } catch {
        setPumpRiskError(
          "Pump risk is unavailable. Check the pump-risk API."
        );
      }
    } catch {
      setError(
        "Unable to load AquaIntel data. Check that the backend is running and all API endpoints are available."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadDashboard();

    const timer = window.setInterval(() => {
      void loadDashboard();
    }, 15000);

    return () => window.clearInterval(timer);
  }, []);

  async function acknowledgeAlert(alertId: number) {
    try {
      const response = await fetch(
        `/api/v1/alerts/${alertId}/acknowledge`,
        { method: "PATCH" }
      );

      if (!response.ok) {
        throw new Error("Could not acknowledge the alert.");
      }

      await loadDashboard();
    } catch {
      setError("Alert acknowledgement failed. Please try again.");
    }
  }

  async function createMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingMaintenance(true);
    setError("");

    try {
      const response = await fetch("/api/v1/maintenance/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pump_id: Number(maintenanceForm.pump_id),
          title: maintenanceForm.title.trim(),
          description: maintenanceForm.description.trim() || null,
          maintenance_type: maintenanceForm.maintenance_type,
          scheduled_at: maintenanceForm.scheduled_at
            ? new Date(maintenanceForm.scheduled_at).toISOString()
            : null,
          performed_by: maintenanceForm.performed_by.trim() || null,
        }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(details || "Could not schedule maintenance.");
      }

      setMaintenanceForm({ ...emptyMaintenanceForm });
      await loadDashboard();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not schedule maintenance. Please try again."
      );
    } finally {
      setSavingMaintenance(false);
    }
  }

  async function completeMaintenance(recordId: number) {
    setCompletingId(recordId);
    setError("");

    try {
      const response = await fetch(
        `/api/v1/maintenance/${recordId}/complete`,
        { method: "PATCH" }
      );

      if (!response.ok) {
        const details = await response.text();
        throw new Error(details || "Could not complete maintenance.");
      }

      await loadDashboard();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not complete maintenance. Please try again."
      );
    } finally {
      setCompletingId(null);
    }
  }

  const visiblePumps =
    selectedPump === "all"
      ? pumps
      : pumps.filter((pump) => pump.id === Number(selectedPump));

  const filteredTelemetry = telemetry.filter(
    (reading) =>
      selectedPump === "all" ||
      reading.pump_id === Number(selectedPump)
  );

  const visibleTelemetry = filteredTelemetry
    .slice()
    .reverse()
    .map((reading) => ({
      ...reading,
      time: new Date(reading.recorded_at).toLocaleTimeString(),
    }));

  const visibleAlerts = alerts.filter(
    (alert) =>
      selectedPump === "all" ||
      alert.pump_id === Number(selectedPump)
  );

  const visibleMaintenance = maintenance.filter(
    (record) =>
      selectedPump === "all" ||
      record.pump_id === Number(selectedPump)
  );

  const visibleAIAnomalies = (aiData?.anomalies ?? []).filter(
    (item) =>
      selectedPump === "all" ||
      item.pump_id === Number(selectedPump)
  );

  const openAlerts = visibleAlerts.filter(
    (alert) => alert.status.toLowerCase() === "open"
  ).length;

  const activePumps = visiblePumps.filter(
    (pump) => pump.status.toLowerCase() === "active"
  ).length;

  const scheduledMaintenance = visibleMaintenance.filter(
    (record) => record.status.toLowerCase() === "scheduled"
  ).length;

  function chart(
    title: string,
    field: "temperature" | "vibration" | "pressure" | "flow_rate",
    color: string,
    unit: string
  ) {
    return (
      <section className="panel chart-panel" key={field}>
        <h3>{title}</h3>
        {visibleTelemetry.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={visibleTelemetry}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3eaf2" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => [`${value} ${unit}`, title]}
              />
              <Line
                type="monotone"
                dataKey={field}
                stroke={color}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted">No telemetry readings available.</p>
        )}
      </section>
    );
  }

  function renderPumpRisk() {
    const riskClass =
      pumpRisk?.risk_level === "High"
        ? "high"
        : pumpRisk?.risk_level === "Medium"
          ? "medium"
          : pumpRisk?.risk_level === "Low"
            ? "low"
            : "";

    const latest = pumpRisk?.latest_reading;
    const summary = pumpRisk?.sensor_summary;

    const sensorRows = [
      { label: "Temperature", key: "temperature" as const, unit: "°C" },
      { label: "Vibration", key: "vibration" as const, unit: "mm/s" },
      { label: "Pressure", key: "pressure" as const, unit: "bar" },
      { label: "Flow Rate", key: "flow_rate" as const, unit: "L/min" },
    ];

    return (
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Pump Health Risk</h2>
            <p className="muted">
              Preliminary sensor-based risk assessment
            </p>
          </div>

          {pumpRisk && (
            <span className={`status ${riskClass}`}>
              {pumpRisk.risk_level} Risk
            </span>
          )}
        </div>

        {pumpRiskError && <p className="muted">{pumpRiskError}</p>}

        {pumpRisk && (
          <>
            <div className="stats">
              <article className="stat-card">
                <span>Pump ID</span>
                <h2>{pumpRisk.pump_id}</h2>
                <small>Risk assessment target</small>
              </article>

              <article className="stat-card">
                <span>Risk Score</span>
                <h2>
                  {pumpRisk.risk_score != null
                    ? `${pumpRisk.risk_score}/100`
                    : "—"}
                </h2>
                <small>Preliminary estimate, not failure probability</small>
              </article>

              <article className="stat-card">
                <span>Readings Analyzed</span>
                <h2>{pumpRisk.readings_analyzed}</h2>
                <small>Recent sensor readings</small>
              </article>

              <article className="stat-card">
                <span>AI Anomalies</span>
                <h2>{pumpRisk.anomaly_count ?? "—"}</h2>
                <small>
                  {pumpRisk.anomaly_percentage != null
                    ? `${pumpRisk.anomaly_percentage}% of valid readings`
                    : "Anomaly analysis"}
                </small>
              </article>
            </div>

            {latest && (
              <>
                <h3>Latest Sensor Readings</h3>
                <div className="stats">
                  {sensorRows.map((sensor) => (
                    <article className="stat-card" key={sensor.key}>
                      <span>{sensor.label}</span>
                      <h2>{latest[sensor.key].toFixed(2)}</h2>
                      <small>{sensor.unit}</small>
                    </article>
                  ))}
                </div>
              </>
            )}

            {summary && (
              <>
                <h3>Sensor Summary</h3>
                <p className="muted">
                  Statistics for readings used in this assessment.
                </p>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Sensor</th>
                        <th>Minimum</th>
                        <th>Average</th>
                        <th>Maximum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sensorRows.map((sensor) => {
                        const values = summary[sensor.key];

                        return (
                          <tr key={sensor.key}>
                            <td>{sensor.label} ({sensor.unit})</td>
                            <td>{values.minimum.toFixed(2)}</td>
                            <td>{values.average.toFixed(2)}</td>
                            <td>{values.maximum.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <h3>Assessment Reasons</h3>
            {pumpRisk.reasons.length > 0 ? (
              <ul>
                {pumpRisk.reasons.map((reason, index) => (
                  <li key={`${index}-${reason}`}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">No assessment reasons returned.</p>
            )}

            <h3>Suggested Inspection Actions</h3>
            {pumpRisk.inspection_suggestions?.length ? (
              <ul>
                {pumpRisk.inspection_suggestions.map(
                  (suggestion, index) => (
                    <li key={`${index}-${suggestion}`}>{suggestion}</li>
                  )
                )}
              </ul>
            ) : (
              <p className="muted">
                No inspection suggestions returned by the API.
              </p>
            )}

            <p className="muted">
              {pumpRisk.assessment_note ??
                "This preliminary score is not a confirmed equipment condition. Verify sensor thresholds against the pump manufacturer's specifications before making maintenance decisions."}
            </p>
          </>
        )}
      </section>
    );
  }

  function renderAIAnomalies() {
    return (
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>AI Anomaly Detection</h2>
            <p className="muted">
              Machine-learning analysis of recent sensor readings
            </p>
          </div>
          <span className="status">
            {aiData ? "AI analysis ready" : "Loading AI"}
          </span>
        </div>

        {aiError && <p className="muted">{aiError}</p>}

        {aiData && (
          <>
            <div className="stats">
              <article className="stat-card">
                <span>Readings Analyzed</span>
                <h2>{aiData.readings_analyzed}</h2>
                <small>Recent valid readings</small>
              </article>

              <article className="stat-card warning-card">
                <span>AI Anomalies Detected</span>
                <h2>{visibleAIAnomalies.length}</h2>
                <small>Unusual readings for current filter</small>
              </article>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reading ID</th>
                    <th>Pump ID</th>
                    <th>Temperature</th>
                    <th>Vibration</th>
                    <th>Pressure</th>
                    <th>Flow Rate</th>
                    <th>AI Score</th>
                    <th>Recorded At</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAIAnomalies.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.pump_id}</td>
                      <td>{item.temperature.toFixed(2)}</td>
                      <td>{item.vibration.toFixed(2)}</td>
                      <td>{item.pressure.toFixed(2)}</td>
                      <td>{item.flow_rate.toFixed(2)}</td>
                      <td>
                        {item.anomaly_score !== null
                          ? item.anomaly_score.toFixed(4)
                          : "—"}
                      </td>
                      <td>
                        {new Date(item.recorded_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}

                  {visibleAIAnomalies.length === 0 && (
                    <tr>
                      <td colSpan={8}>
                        No anomalies detected for this pump filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="muted">
              Anomaly scores are model scores, not failure probabilities.
              Investigate unusual readings before taking maintenance action.
            </p>
          </>
        )}
      </section>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">💧</span>
          <div>
            <h2>AquaIntel</h2>
            <p>Water Operations Platform</p>
          </div>
        </div>

        <p className="nav-heading">WORKSPACE</p>

        {(
          [
            "Dashboard",
            "Pumps",
            "Telemetry",
            "Analytics",
            "Alerts",
            "Maintenance",
          ] as Page[]
        ).map((item) => (
          <button
            key={item}
            className={`nav-item ${page === item ? "selected" : ""}`}
            onClick={() => setPage(item)}
          >
            {item === "Dashboard" && "▦"}
            {item === "Pumps" && "◉"}
            {item === "Telemetry" && "⌁"}
            {item === "Analytics" && "▥"}
            {item === "Alerts" && "⚠"}
            {item === "Maintenance" && "🔧"}
            <span>{item}</span>

            {item === "Alerts" && openAlerts > 0 && (
              <span className="nav-count">{openAlerts}</span>
            )}

            {item === "Maintenance" && scheduledMaintenance > 0 && (
              <span className="nav-count">{scheduledMaintenance}</span>
            )}
          </button>
        ))}

        <div className="sidebar-footer">
          <span className="online-dot" />
          API connected when data loads
        </div>
      </aside>

      <main className="main">
        <header className="header">
          <div>
            <p className="eyebrow">AQUAINTEL / OPERATIONS</p>
            <h1>{page}</h1>
            <p className="muted">
              Water pump monitoring and predictive maintenance
            </p>
          </div>

          <div className="header-actions">
            <span className="live-label">
              <span className="online-dot" /> Auto refresh: 15 sec
            </span>
            <button
              className="primary-button"
              onClick={() => void loadDashboard(true)}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {page !== "Dashboard" && (
          <div className="filter-row">
            <label htmlFor="pump-filter">Filter by pump</label>
            <select
              id="pump-filter"
              value={selectedPump}
              onChange={(event) => setSelectedPump(event.target.value)}
            >
              <option value="all">All pumps</option>
              {pumps.map((pump) => (
                <option key={pump.id} value={pump.id}>
                  {pump.pump_code} — {pump.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <section className="panel">Loading AquaIntel data...</section>
        ) : (
          <>
            {page === "Dashboard" && (
              <>
                <section className="stats">
                  <article className="stat-card">
                    <span>Total Pumps</span>
                    <h2>{kpis?.total_pumps ?? pumps.length}</h2>
                    <small>Registered assets</small>
                  </article>

                  <article className="stat-card">
                    <span>Active Pumps</span>
                    <h2>{kpis?.active_pumps ?? activePumps}</h2>
                    <small>Current pump status</small>
                  </article>

                  <article className="stat-card">
                    <span>Total Alerts</span>
                    <h2>{kpis?.total_alerts ?? alerts.length}</h2>
                    <small>Recorded alerts</small>
                  </article>

                  <article className="stat-card warning-card">
                    <span>Open Alerts</span>
                    <h2>{kpis?.open_alerts ?? openAlerts}</h2>
                    <small>Require operator review</small>
                  </article>

                  <article className="stat-card">
                    <span>Total Readings</span>
                    <h2>
                      {kpis?.total_telemetry_readings ?? telemetry.length}
                    </h2>
                    <small>Stored sensor readings</small>
                  </article>

                  <article className="stat-card">
                    <span>Average Temperature</span>
                    <h2>
                      {kpis?.average_temperature != null
                        ? kpis.average_temperature.toFixed(2)
                        : "—"}
                    </h2>
                    <small>°C · All stored readings</small>
                  </article>

                  <article className="stat-card">
                    <span>Average Vibration</span>
                    <h2>
                      {kpis?.average_vibration != null
                        ? kpis.average_vibration.toFixed(2)
                        : "—"}
                    </h2>
                    <small>All stored readings</small>
                  </article>

                  <article className="stat-card">
                    <span>Average Pressure</span>
                    <h2>
                      {kpis?.average_pressure != null
                        ? kpis.average_pressure.toFixed(2)
                        : "—"}
                    </h2>
                    <small>All stored readings</small>
                  </article>

                  <article className="stat-card">
                    <span>Average Flow Rate</span>
                    <h2>
                      {kpis?.average_flow_rate != null
                        ? kpis.average_flow_rate.toFixed(2)
                        : "—"}
                    </h2>
                    <small>L/min · All stored readings</small>
                  </article>

                  <article className="stat-card">
                    <span>Acknowledged Alerts</span>
                    <h2>{kpis?.acknowledged_alerts ?? 0}</h2>
                    <small>Reviewed alerts</small>
                  </article>

                  <article className="stat-card">
                    <span>Scheduled Maintenance</span>
                    <h2>
                      {kpis?.scheduled_maintenance ?? scheduledMaintenance}
                    </h2>
                    <small>Tasks awaiting completion</small>
                  </article>

                  <article className="stat-card">
                    <span>Completed Maintenance</span>
                    <h2>{kpis?.completed_maintenance ?? 0}</h2>
                    <small>Completed tasks</small>
                  </article>
                </section>

                {renderPumpRisk()}
                {renderAIAnomalies()}

                <div className="section-heading">
                  <div>
                    <h2>Telemetry trends</h2>
                    <p className="muted">Latest stored sensor readings</p>
                  </div>
                </div>

                <section className="chart-grid">
                  {chart("Temperature", "temperature", "#e76f51", "°C")}
                  {chart("Vibration", "vibration", "#7c5ce7", "mm/s")}
                  {chart("Pressure", "pressure", "#168aad", "bar")}
                  {chart("Flow Rate", "flow_rate", "#22936f", "L/min")}
                </section>

                <section className="panel">
                  <div className="panel-heading">
                    <h2>Water pumps</h2>
                    <button
                      className="text-button"
                      onClick={() => setPage("Pumps")}
                    >
                      View all →
                    </button>
                  </div>
                  {renderPumps(visiblePumps)}
                </section>

                <section className="panel">
                  <div className="panel-heading">
                    <h2>Recent alerts</h2>
                    <button
                      className="text-button"
                      onClick={() => setPage("Alerts")}
                    >
                      View all →
                    </button>
                  </div>
                  {renderAlerts(visibleAlerts.slice(0, 5), acknowledgeAlert)}
                </section>

                <section className="panel">
                  <div className="panel-heading">
                    <h2>Maintenance overview</h2>
                    <button
                      className="text-button"
                      onClick={() => setPage("Maintenance")}
                    >
                      Manage maintenance →
                    </button>
                  </div>
                  <p>
                    {scheduledMaintenance} scheduled task(s) and{" "}
                    {
                      visibleMaintenance.filter(
                        (record) =>
                          record.status.toLowerCase() === "completed"
                      ).length
                    }{" "}
                    completed task(s).
                  </p>
                </section>
              </>
            )}

            {page === "Pumps" && (
              <section className="panel">
                <h2>Pump inventory</h2>
                {renderPumps(visiblePumps)}
              </section>
            )}

            {page === "Telemetry" && (
              <>
                <section className="chart-grid">
                  {chart("Temperature", "temperature", "#e76f51", "°C")}
                  {chart("Vibration", "vibration", "#7c5ce7", "mm/s")}
                  {chart("Pressure", "pressure", "#168aad", "bar")}
                  {chart("Flow Rate", "flow_rate", "#22936f", "L/min")}
                </section>

                <section className="panel">
                  <h2>Reading history</h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Recorded At</th>
                          <th>Pump ID</th>
                          <th>Temperature</th>
                          <th>Vibration</th>
                          <th>Pressure</th>
                          <th>Flow Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTelemetry.map((reading) => (
                          <tr key={reading.id}>
                            <td>
                              {new Date(reading.recorded_at).toLocaleString()}
                            </td>
                            <td>{reading.pump_id}</td>
                            <td>{reading.temperature}</td>
                            <td>{reading.vibration}</td>
                            <td>{reading.pressure}</td>
                            <td>{reading.flow_rate}</td>
                          </tr>
                        ))}

                        {filteredTelemetry.length === 0 && (
                          <tr>
                            <td colSpan={6}>No readings found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            {page === "Analytics" && (
              <>
                <section className="stats">
                  <article className="stat-card">
                    <span>Total Readings</span>
                    <h2>{kpis?.total_telemetry_readings ?? telemetry.length}</h2>
                    <small>All stored sensor readings</small>
                  </article>

                  <article className="stat-card">
                    <span>Average Temperature</span>
                    <h2>
                      {kpis?.average_temperature != null
                        ? kpis.average_temperature.toFixed(2)
                        : "—"}
                    </h2>
                    <small>°C · All stored readings</small>
                  </article>

                  <article className="stat-card">
                    <span>Average Vibration</span>
                    <h2>
                      {kpis?.average_vibration != null
                        ? kpis.average_vibration.toFixed(2)
                        : "—"}
                    </h2>
                    <small>All stored readings</small>
                  </article>

                  <article className="stat-card">
                    <span>Open Alerts</span>
                    <h2>{kpis?.open_alerts ?? openAlerts}</h2>
                    <small>Require operator review</small>
                  </article>
                </section>

                <div className="section-heading">
                  <div>
                    <h2>Sensor Analytics</h2>
                    <p className="muted">
                      Trends from the latest stored telemetry readings
                    </p>
                  </div>
                </div>

                <section className="chart-grid">
                  {chart("Temperature", "temperature", "#e76f51", "°C")}
                  {chart("Vibration", "vibration", "#7c5ce7", "mm/s")}
                  {chart("Pressure", "pressure", "#168aad", "bar")}
                  {chart("Flow Rate", "flow_rate", "#22936f", "L/min")}
                </section>

                {renderPumpRisk()}
                {renderAIAnomalies()}
              </>
            )}

            {page === "Alerts" && (
              <section className="panel">
                <h2>Alert center</h2>
                <p className="muted">
                  Review alerts and acknowledge those you have checked.
                </p>
                {renderAlerts(visibleAlerts, acknowledgeAlert)}
              </section>
            )}

            {page === "Maintenance" && (
              <>
                <section className="panel">
                  <h2>Schedule Maintenance</h2>
                  <p className="muted">
                    Create preventive or corrective maintenance tasks for your
                    pumps.
                  </p>

                  <form
                    onSubmit={createMaintenance}
                    className="maintenance-form"
                  >
                    <label>
                      Pump
                      <select
                        required
                        value={maintenanceForm.pump_id}
                        onChange={(event) =>
                          setMaintenanceForm({
                            ...maintenanceForm,
                            pump_id: event.target.value,
                          })
                        }
                      >
                        <option value="">Select a pump</option>
                        {pumps.map((pump) => (
                          <option key={pump.id} value={pump.id}>
                            {pump.pump_code} — {pump.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Task title
                      <input
                        required
                        maxLength={200}
                        value={maintenanceForm.title}
                        onChange={(event) =>
                          setMaintenanceForm({
                            ...maintenanceForm,
                            title: event.target.value,
                          })
                        }
                        placeholder="e.g. Routine pump inspection"
                      />
                    </label>

                    <label>
                      Maintenance type
                      <select
                        value={maintenanceForm.maintenance_type}
                        onChange={(event) =>
                          setMaintenanceForm({
                            ...maintenanceForm,
                            maintenance_type: event.target.value,
                          })
                        }
                      >
                        <option value="Preventive">Preventive</option>
                        <option value="Corrective">Corrective</option>
                        <option value="Inspection">Inspection</option>
                        <option value="Emergency">Emergency</option>
                      </select>
                    </label>

                    <label>
                      Scheduled date and time
                      <input
                        type="datetime-local"
                        value={maintenanceForm.scheduled_at}
                        onChange={(event) =>
                          setMaintenanceForm({
                            ...maintenanceForm,
                            scheduled_at: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      Assigned to
                      <input
                        value={maintenanceForm.performed_by}
                        onChange={(event) =>
                          setMaintenanceForm({
                            ...maintenanceForm,
                            performed_by: event.target.value,
                          })
                        }
                        placeholder="Maintenance team"
                      />
                    </label>

                    <label>
                      Description
                      <textarea
                        value={maintenanceForm.description}
                        onChange={(event) =>
                          setMaintenanceForm({
                            ...maintenanceForm,
                            description: event.target.value,
                          })
                        }
                        placeholder="Describe the maintenance task"
                        rows={3}
                      />
                    </label>

                    <button
                      className="primary-button"
                      type="submit"
                      disabled={savingMaintenance || pumps.length === 0}
                    >
                      {savingMaintenance
                        ? "Saving..."
                        : "Schedule Maintenance"}
                    </button>
                  </form>
                </section>

                <section className="panel">
                  <h2>Maintenance Records</h2>
                  <p className="muted">
                    Track scheduled and completed maintenance tasks.
                  </p>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Pump ID</th>
                          <th>Task</th>
                          <th>Type</th>
                          <th>Scheduled</th>
                          <th>Assigned To</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleMaintenance.map((record) => (
                          <tr key={record.id}>
                            <td>{record.pump_id}</td>
                            <td>
                              <strong>{record.title}</strong>
                              {record.description && (
                                <p className="muted">{record.description}</p>
                              )}
                            </td>
                            <td>{record.maintenance_type}</td>
                            <td>
                              {record.scheduled_at
                                ? new Date(
                                    record.scheduled_at
                                  ).toLocaleString()
                                : "Not scheduled"}
                            </td>
                            <td>{record.performed_by || "Unassigned"}</td>
                            <td>
                              <span
                                className={`status ${record.status.toLowerCase()}`}
                              >
                                {record.status}
                              </span>
                            </td>
                            <td>
                              {record.status.toLowerCase() !== "completed" ? (
                                <button
                                  className="secondary-button"
                                  disabled={completingId === record.id}
                                  onClick={() =>
                                    void completeMaintenance(record.id)
                                  }
                                >
                                  {completingId === record.id
                                    ? "Updating..."
                                    : "Mark Completed"}
                                </button>
                              ) : (
                                <span>
                                  {record.completed_at
                                    ? new Date(
                                        record.completed_at
                                      ).toLocaleDateString()
                                    : "Completed"}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}

                        {visibleMaintenance.length === 0 && (
                          <tr>
                            <td colSpan={7}>No maintenance records found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </>
        )}

        <footer className="footer">
          AquaIntel · Water Pump Monitoring · Local development
        </footer>
      </main>
    </div>
  );
}

function renderPumps(pumps: Pump[]) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pump ID</th>
            <th>Name</th>
            <th>Location</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {pumps.map((pump) => (
            <tr key={pump.id}>
              <td><strong>{pump.pump_code}</strong></td>
              <td>{pump.name}</td>
              <td>{pump.location || "—"}</td>
              <td>
                <span className={`status ${pump.status.toLowerCase()}`}>
                  {pump.status}
                </span>
              </td>
            </tr>
          ))}

          {pumps.length === 0 && (
            <tr>
              <td colSpan={4}>No pumps found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function renderAlerts(
  alerts: Alert[],
  onAcknowledge: (id: number) => Promise<void>
) {
  return (
    <div className="alert-list">
      {alerts.map((alert) => (
        <article className="alert-row" key={alert.id}>
          <div className="alert-symbol">⚠</div>
          <div className="alert-content">
            <div className="alert-title">
              <strong>{alert.alert_type}</strong>
              <span className={`status ${alert.status.toLowerCase()}`}>
                {alert.status}
              </span>
            </div>
            <p>{alert.message}</p>
            <small>
              Pump {alert.pump_id} · Value: {alert.value} · Threshold:{" "}
              {alert.threshold} · {new Date(alert.created_at).toLocaleString()}
            </small>
          </div>

          {alert.status.toLowerCase() === "open" && (
            <button
              className="secondary-button"
              onClick={() => void onAcknowledge(alert.id)}
            >
              Acknowledge
            </button>
          )}
        </article>
      ))}

      {alerts.length === 0 && (
        <p className="muted">No alerts match this filter.</p>
      )}
    </div>
  );
}

export default App;
