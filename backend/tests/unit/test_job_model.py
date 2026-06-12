"""
Unit tests for backend.src.jobs — Job dataclass & ActiveJobError.

Instead of polluting sys.modules permanently (which breaks other test files),
we inject mock modules temporarily via patch.dict in a with block.
"""
from __future__ import annotations



from backend.src.jobs import ActiveJobError, Job


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sample_job(**overrides) -> Job:
    """Return a Job with all non-default fields populated."""
    defaults = dict(
        id="job-001",
        filename="test.png",
        prompt="a happy cat",
        workflow={"3": {"class_type": "KSampler", "inputs": {"seed": 42}}},
        status="running",
        worker_id="worker-1",
        error=None,
        image_urls=["http://img/1.png", "http://img/2.png"],
        saved_image_hashes=["hash_a", "hash_b"],
        progress_percent=0.5,
        current_node_name="KSampler",
        total_node_count=10,
        completed_node_count=5,
        created_at=1700000000.0,
        started_at=1700000010.0,
        finished_at=None,
        retry_count=2,
        execution_duration_ms=None,
        meta={"seed": "42", "model": "sd-xl"},
        ceg_template="portrait",
        image_uploads={"upload-1": {"filename": "cat.jpg", "subfolder": ""}},
        worker_type="comfyui",
    )
    defaults.update(overrides)
    return Job(**defaults)


# ===================================================================
# to_dict / from_dict roundtrip
# ===================================================================


class TestToDictFromDictRoundtrip:
    """to_dict() → from_dict() should preserve every field."""

    def test_roundtrip_preserves_all_fields(self) -> None:
        original = _sample_job()
        d = original.to_dict()
        restored = Job.from_dict(d)

        assert restored.id == original.id
        assert restored.filename == original.filename
        assert restored.prompt == original.prompt
        assert restored.workflow == original.workflow
        assert restored.status == original.status
        assert restored.worker_id == original.worker_id
        assert restored.error == original.error
        assert restored.image_urls == original.image_urls
        assert restored.saved_image_hashes == original.saved_image_hashes
        assert restored.progress_percent == original.progress_percent
        assert restored.current_node_name == original.current_node_name
        assert restored.total_node_count == original.total_node_count
        assert restored.completed_node_count == original.completed_node_count
        assert restored.created_at == original.created_at
        assert restored.started_at == original.started_at
        assert restored.finished_at == original.finished_at
        assert restored.retry_count == original.retry_count
        assert restored.execution_duration_ms == original.execution_duration_ms
        assert restored.meta == original.meta
        assert restored.ceg_template == original.ceg_template
        assert restored.image_uploads == original.image_uploads
        assert restored.worker_type == original.worker_type

    def test_roundtrip_double_conversion(self) -> None:
        """to_dict → from_dict → to_dict should be idempotent."""
        job = _sample_job()
        d1 = job.to_dict()
        d2 = Job.from_dict(d1).to_dict()
        assert d1 == d2


# ===================================================================
# from_dict with defaults for missing optional fields
# ===================================================================


class TestFromDictDefaults:
    """from_dict() should fill in defaults when optional keys are missing."""

    def test_minimal_dict_gives_defaults(self) -> None:
        minimal: dict = {
            "id": "job-min",
            "filename": "min.png",
            "prompt": "hello",
        }
        job = Job.from_dict(minimal)

        assert job.status == "pending"
        assert job.worker_id is None
        assert job.error is None
        assert job.image_urls == []
        assert job.saved_image_hashes == []
        assert job.progress_percent == 0.0
        assert job.current_node_name == ""
        assert job.total_node_count == 0
        assert job.completed_node_count == 0
        assert job.created_at > 0
        assert job.started_at is None
        assert job.finished_at is None
        assert job.retry_count == 0
        assert job.execution_duration_ms is None
        assert job.meta == {}
        assert job.ceg_template == ""
        assert job.image_uploads == {}
        assert job.worker_type is None

    def test_workflow_defaults_to_empty_dict(self) -> None:
        """If _workflow key is missing, workflow should default to {}."""
        job = Job.from_dict({
            "id": "j1",
            "filename": "a.png",
            "prompt": "p",
        })
        assert job.workflow.root == {}


# ===================================================================
# clone
# ===================================================================


class TestClone:
    """clone() should create a deep copy with a new id and reset fields."""

    def test_clone_has_new_id(self) -> None:
        original = _sample_job()
        cloned = original.clone()
        assert cloned.id != original.id

    def test_clone_resets_created_at_and_retry_count(self) -> None:
        original = _sample_job()
        cloned = original.clone()

        assert cloned.created_at != original.created_at
        assert cloned.created_at >= original.created_at
        assert cloned.retry_count == 0
        assert original.retry_count == 2

    def test_clone_resets_started_at_and_finished_at(self) -> None:
        original = _sample_job(started_at=1700000010.0, finished_at=1700000100.0)
        cloned = original.clone()

        assert cloned.started_at is None
        assert cloned.finished_at is None
        assert original.started_at == 1700000010.0
        assert original.finished_at == 1700000100.0

    def test_clone_does_not_mutate_original(self) -> None:
        original = _sample_job()
        _cloned = original.clone()

        assert original.id == "job-001"
        assert original.retry_count == 2
        assert original.status == "running"

    def test_clone_deep_copies_workflow(self) -> None:
        original = _sample_job()
        cloned = original.clone()

        assert cloned.workflow == original.workflow
        cloned.workflow.root["3"].inputs["seed"] = 999
        assert original.workflow.root["3"].inputs["seed"] == 42

    def test_clone_deep_copies_meta(self) -> None:
        original = _sample_job()
        cloned = original.clone()

        assert cloned.meta == original.meta
        cloned.meta["new_key"] = "new_val"
        assert "new_key" not in original.meta

    def test_clone_resets_image_urls(self) -> None:
        original = _sample_job()
        cloned = original.clone()

        assert cloned.image_urls == []
        assert len(original.image_urls) == 2

    def test_clone_deep_copies_image_uploads(self) -> None:
        original = _sample_job()
        cloned = original.clone()

        assert cloned.image_uploads == original.image_uploads
        cloned.image_uploads["upload-2"] = {"filename": "dog.jpg"}
        assert "upload-2" not in original.image_uploads

    def test_clone_preserves_simple_fields(self) -> None:
        original = _sample_job()
        cloned = original.clone()

        assert cloned.filename == original.filename
        assert cloned.prompt == original.prompt
        # clone()은 새 잡이므로 상태/진행 정보는 초기화됨
        assert cloned.status == "pending"
        assert cloned.worker_id is None
        assert cloned.error is None
        assert cloned.saved_image_hashes == []
        assert cloned.progress_percent == 0.0
        assert cloned.current_node_name == ""
        assert cloned.total_node_count == 0
        assert cloned.completed_node_count == 0
        # 템플릿/워커 타입 등 설정 정보는 유지
        assert cloned.worker_type == original.worker_type
        assert cloned.ceg_template == original.ceg_template


# ===================================================================
# from_dict with imageUploads field
# ===================================================================


class TestFromDictImageUploads:
    """from_dict() should correctly map the camelCase imageUploads key."""

    def test_image_uploads_preserved(self) -> None:
        uploads = {
            "upload-1": {"filename": "cat.jpg", "subfolder": "pets"},
            "upload-2": {"filename": "dog.jpg", "subfolder": ""},
        }
        d = _sample_job().to_dict()
        d["imageUploads"] = uploads
        job = Job.from_dict(d)
        assert job.image_uploads == uploads

    def test_image_uploads_missing_defaults_empty_dict(self) -> None:
        d = _sample_job().to_dict()
        del d["imageUploads"]
        job = Job.from_dict(d)
        assert job.image_uploads == {}


# ===================================================================
# ActiveJobError
# ===================================================================


class TestActiveJobError:
    """ActiveJobError stores worker_id and job_id and formats message."""

    def test_attributes(self) -> None:
        err = ActiveJobError("worker-42", "job-7")
        assert err.worker_id == "worker-42"
        assert err.job_id == "job-7"

    def test_message(self) -> None:
        err = ActiveJobError("worker-42", "job-7")
        assert "worker-42" in str(err)
        assert "job-7" in str(err)

    def test_is_exception(self) -> None:
        err = ActiveJobError("w1", "j1")
        assert isinstance(err, Exception)


# ===================================================================
# Default status is "pending"
# ===================================================================


class TestDefaultStatus:
    """A newly-constructed Job (without explicit status) defaults to 'pending'."""

    def test_default_status_is_pending(self) -> None:
        job = Job(
            id="j",
            filename="f.png",
            prompt="p",
            workflow={},
        )
        assert job.status == "pending"

    def test_from_dict_default_status_is_pending(self) -> None:
        d = {"id": "j", "filename": "f.png", "prompt": "p"}
        job = Job.from_dict(d)
        assert job.status == "pending"