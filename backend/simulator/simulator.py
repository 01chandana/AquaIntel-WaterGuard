
import random
import time
import urllib.error
import urllib.request
import json

API_URL = "http://127.0.0.1:8000/api/v1"
INTERVAL_SECONDS = 5


def get_pumps():
    request = urllib.request.Request(
        f"{API_URL}/pumps/",
        headers={"Accept": "application/json"},
    )

    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def send_reading(pump):
    # Demonstration data only; not connected to physical sensors.
    payload = {
        "pump_id": pump["id"],
        "temperature": round(random.uniform(45, 68), 2),
        "vibration": round(random.uniform(1.0, 4.5), 2),
        "pressure": round(random.uniform(2.5, 6.0), 2),
        "flow_rate": round(random.uniform(80, 140), 2),
    }

    # Occasionally simulate an abnormal reading to test alerts.
    if random.random() < 0.10:
        payload["temperature"] = round(random.uniform(72, 85), 2)

    request = urllib.request.Request(
        f"{API_URL}/telemetry/",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=10) as response:
        result = json.loads(response.read().decode("utf-8"))

    print(
        f"Pump {pump['pump_code']} | "
        f"Temp: {result['temperature']} | "
        f"Vibration: {result['vibration']} | "
        f"Pressure: {result['pressure']} | "
        f"Flow: {result['flow_rate']} | "
        "Saved"
    )


def main():
    print("AquaIntel Sensor Simulator")
    print("Press Ctrl+C to stop.\n")

    while True:
        try:
            pumps = get_pumps()

            if not pumps:
                print("No pumps found. Add a pump first.")
            else:
                for pump in pumps:
                    if pump["status"].lower() == "active":
                        try:
                            send_reading(pump)
                        except urllib.error.HTTPError as error:
                            print(
                                f"API error for {pump['pump_code']}: "
                                f"{error.code} {error.reason}"
                            )
                        except urllib.error.URLError as error:
                            print(f"Connection error: {error.reason}")

            time.sleep(INTERVAL_SECONDS)

        except urllib.error.URLError as error:
            print(f"Cannot connect to AquaIntel API: {error.reason}")
            print("Check that the backend is running.")
            time.sleep(INTERVAL_SECONDS)

        except KeyboardInterrupt:
            print("\nSimulator stopped.")
            break


if __name__ == "__main__":
    main()
