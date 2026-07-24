from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient

def test_get_extensions_empty(client):
    from backend.src.server import worker_pool
    # If no workers, it should return empty list
    worker_pool.find_idle.return_value = None
    worker_pool.all.return_value = []
    
    resp = client.get("/extensions")
    assert resp.status_code == 200
    assert resp.json() == []

def test_get_extensions_with_worker(client):
    from backend.src.server import worker_pool
    
    mock_worker = AsyncMock()
    mock_worker.alive = True
    mock_worker.get_extensions = AsyncMock(return_value=["foo", "bar"])
    
    worker_pool.find_idle.return_value = mock_worker
    
    resp = client.get("/extensions")
    assert resp.status_code == 200
    assert resp.json() == ["foo", "bar"]

def test_get_extension_file_success(client):
    from backend.src.server import worker_pool
    
    mock_worker = AsyncMock()
    mock_worker.alive = True
    
    mock_http = AsyncMock()
    mock_worker._http = mock_http
    
    mock_resp = AsyncMock()
    mock_resp.status_code = 200
    mock_resp.headers = {"content-type": "application/javascript"}
    
    async def mock_aiter_bytes():
        yield b"console.log('hello');"
        
    mock_resp.aiter_bytes = mock_aiter_bytes
    mock_resp.aclose = AsyncMock()
    
    mock_http.build_request = MagicMock()
    mock_http.send = AsyncMock(return_value=mock_resp)
    
    worker_pool.find_idle.return_value = mock_worker
    
    resp = client.get("/extensions/foo/bar.js?import")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/javascript"
    assert resp.content == b"console.log('hello');"
    mock_resp.aclose.assert_called_once()

def test_get_extension_file_not_found(client):
    from backend.src.server import worker_pool
    
    mock_worker = AsyncMock()
    mock_worker.alive = True
    
    mock_http = AsyncMock()
    mock_worker._http = mock_http
    
    mock_resp = AsyncMock()
    mock_resp.status_code = 404
    mock_resp.reason_phrase = "Not Found"
    mock_resp.aclose = AsyncMock()
    
    mock_http.build_request = MagicMock()
    mock_http.send = AsyncMock(return_value=mock_resp)
    
    worker_pool.find_idle.return_value = mock_worker
    
    resp = client.get("/extensions/foo/invalid.js")
    assert resp.status_code == 404
    mock_resp.aclose.assert_called_once()
