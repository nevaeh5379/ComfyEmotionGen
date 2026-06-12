"""
Tests for the WebSocket events streaming endpoint /ws/events.
Ensures that SnapshotEvent is serialized properly without TypeErrors.
"""
from __future__ import annotations

import pytest


def test_ws_events_snapshot_empty(client):
    """Test websocket connection when there are no jobs."""
    with client.websocket_connect("/ws/events") as ws:
        data = ws.receive_json()
        assert data["type"] == "snapshot"
        assert "jobs" in data
        assert isinstance(data["jobs"], list)
        assert len(data["jobs"]) == 0
        assert "workers" in data
        assert isinstance(data["workers"], list)


def test_ws_events_snapshot_with_jobs(client):
    """Test websocket connection and snapshot serialization when there are jobs in the system."""
    # Submit a job via the API so it is registered in the active job list / memory of job_manager
    resp = client.post(
        "/jobs",
        json={
            "items": [
                {
                    "filename": "ws_test.png",
                    "prompt": "websocket serializability test",
                    "workflow": {"3": {"class_type": "KSampler", "inputs": {}}},
                    "workerType": "comfyui",
                }
            ]
        }
    )
    assert resp.status_code == 200
    job_ids = resp.json()["jobIds"]
    assert len(job_ids) == 1
    job_id = job_ids[0]

    try:
        # Connect to websocket
        with client.websocket_connect("/ws/events") as ws:
            data = ws.receive_json()
            assert data["type"] == "snapshot"
            assert "jobs" in data
            assert isinstance(data["jobs"], list)
            assert len(data["jobs"]) >= 1
            
            # Verify job serialization properties
            job_item = next(j for j in data["jobs"] if j["id"] == job_id)
            assert job_item["filename"] == "ws_test.png"
            assert job_item["prompt"] == "websocket serializability test"
            assert job_item["status"] == "pending"
    finally:
        # Clean up the submitted job
        client.post("/jobs/delete", json={"jobIds": [job_id]})
