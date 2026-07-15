from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / "nodes.py"
SPEC = importlib.util.spec_from_file_location("comfyui_ceg_nodes", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
NODES = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(NODES)


def load_package():
    package_dir = MODULE_PATH.parent
    spec = importlib.util.spec_from_file_location(
        "comfyui_ceg_package",
        package_dir / "__init__.py",
        submodule_search_locations=[str(package_dir)],
    )
    assert spec is not None and spec.loader is not None
    package = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = package
    try:
        spec.loader.exec_module(package)
    finally:
        sys.modules.pop(spec.name, None)
    return package


class CEGNodeTests(unittest.TestCase):
    def test_package_exports_comfyui_mappings(self) -> None:
        package = load_package()
        self.assertEqual(set(package.NODE_CLASS_MAPPINGS), set(NODES.NODE_CLASS_MAPPINGS))
        self.assertEqual(set(package.NODE_DISPLAY_NAME_MAPPINGS), set(NODES.NODE_DISPLAY_NAME_MAPPINGS))

    def test_all_nodes_are_registered(self) -> None:
        self.assertEqual(
            set(NODES.NODE_CLASS_MAPPINGS),
            {"CEGContext", "CEGText", "CEGInteger", "CEGFloat", "CEGBoolean", "CEGSeed"},
        )

    def test_context_passes_injected_values_through(self) -> None:
        result = NODES.CEGContext().emit("happy", "emotion-happy", 42, '{"emotion":"happy"}', "{}")
        self.assertEqual(result, ("happy", "emotion-happy", 42, '{"emotion":"happy"}', "{}"))

    def test_typed_nodes_pass_values_through(self) -> None:
        self.assertEqual(NODES.CEGText().emit("slot", "negative", "blur"), ("blur",))
        self.assertEqual(NODES.CEGInteger().emit("slot", "steps", 30), (30,))
        self.assertEqual(NODES.CEGFloat().emit("slot", "cfg", 6.5), (6.5,))
        self.assertEqual(NODES.CEGBoolean().emit("slot", "enabled", True), (True,))
        self.assertEqual(NODES.CEGSeed().emit(123), (123,))

    def test_context_contract_matches_return_values(self) -> None:
        required = NODES.CEGContext.INPUT_TYPES()["required"]
        self.assertEqual(tuple(required), NODES.CEGContext.RETURN_NAMES)
        self.assertEqual(len(NODES.CEGContext.RETURN_TYPES), len(NODES.CEGContext.RETURN_NAMES))


if __name__ == "__main__":
    unittest.main()
