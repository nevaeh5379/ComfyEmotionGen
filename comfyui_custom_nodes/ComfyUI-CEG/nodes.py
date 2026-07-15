from __future__ import annotations

from typing import Any


CATEGORY = "CEG"
MAX_SEED = 0xFFFFFFFFFFFFFFFF
MAX_SAFE_INTEGER = 0x1FFFFFFFFFFFFF


class CEGContext:
    """Values injected into a workflow for each CEG render item."""

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "prompt": (
                    "STRING",
                    {"default": "", "multiline": True, "tooltip": "Rendered CEG prompt."},
                ),
                "filename": (
                    "STRING",
                    {"default": "CEG", "tooltip": "Rendered CEG filename."},
                ),
                "seed": (
                    "INT",
                    {"default": 0, "min": 0, "max": MAX_SEED, "control_after_generate": False},
                ),
                "metadata_json": (
                    "STRING",
                    {"default": "{}", "multiline": True, "tooltip": "CEG axis metadata as JSON."},
                ),
                "slots_json": (
                    "STRING",
                    {"default": "{}", "multiline": True, "tooltip": "CEG slots as JSON."},
                ),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "INT", "STRING", "STRING")
    RETURN_NAMES = ("prompt", "filename", "seed", "metadata_json", "slots_json")
    OUTPUT_TOOLTIPS = (
        "Rendered prompt for this item.",
        "Rendered filename for this item.",
        "One random seed shared by this context.",
        "Axis metadata encoded as JSON.",
        "Slot values encoded as JSON.",
    )
    FUNCTION = "emit"
    CATEGORY = CATEGORY
    DESCRIPTION = "CEG fills this node automatically for every submitted render item."

    def emit(
        self,
        prompt: str,
        filename: str,
        seed: int,
        metadata_json: str,
        slots_json: str,
    ) -> tuple[str, str, int, str, str]:
        return (prompt, filename, seed, metadata_json, slots_json)


class _CEGValueBase:
    RETURN_TYPES: tuple[str, ...]
    RETURN_NAMES = ("value",)
    FUNCTION = "emit"
    CATEGORY = f"{CATEGORY}/values"
    SOURCE_INPUT = (["slot", "meta"], {"default": "slot"})
    KEY_INPUT = ("STRING", {"default": "", "tooltip": "CEG slot or metadata key."})


class CEGText(_CEGValueBase):
    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "source": cls.SOURCE_INPUT,
                "key": cls.KEY_INPUT,
                "value": (
                    "STRING",
                    {"default": "", "multiline": True, "tooltip": "Fallback value outside CEG."},
                ),
            }
        }

    RETURN_TYPES = ("STRING",)
    DESCRIPTION = "Reads a text slot or metadata value injected by CEG."

    def emit(self, source: str, key: str, value: str) -> tuple[str]:
        del source, key
        return (value,)


class CEGInteger(_CEGValueBase):
    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "source": cls.SOURCE_INPUT,
                "key": cls.KEY_INPUT,
                "value": (
                    "INT",
                    {"default": 0, "min": -MAX_SAFE_INTEGER, "max": MAX_SAFE_INTEGER},
                ),
            }
        }

    RETURN_TYPES = ("INT",)
    DESCRIPTION = "Reads an integer slot or metadata value injected by CEG."

    def emit(self, source: str, key: str, value: int) -> tuple[int]:
        del source, key
        return (value,)


class CEGFloat(_CEGValueBase):
    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "source": cls.SOURCE_INPUT,
                "key": cls.KEY_INPUT,
                "value": (
                    "FLOAT",
                    {"default": 0.0, "min": -1.0e12, "max": 1.0e12, "step": 0.01},
                ),
            }
        }

    RETURN_TYPES = ("FLOAT",)
    DESCRIPTION = "Reads a floating-point slot or metadata value injected by CEG."

    def emit(self, source: str, key: str, value: float) -> tuple[float]:
        del source, key
        return (value,)


class CEGBoolean(_CEGValueBase):
    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "source": cls.SOURCE_INPUT,
                "key": cls.KEY_INPUT,
                "value": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("BOOLEAN",)
    DESCRIPTION = "Reads a boolean slot or metadata value injected by CEG."

    def emit(self, source: str, key: str, value: bool) -> tuple[bool]:
        del source, key
        return (value,)


class CEGSeed:
    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "seed": ("INT", {"default": 0, "min": 0, "max": MAX_SEED}),
            }
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("seed",)
    FUNCTION = "emit"
    CATEGORY = f"{CATEGORY}/values"
    DESCRIPTION = "A random seed injected once for every CEG render item."

    def emit(self, seed: int) -> tuple[int]:
        return (seed,)


NODE_CLASS_MAPPINGS = {
    "CEGContext": CEGContext,
    "CEGText": CEGText,
    "CEGInteger": CEGInteger,
    "CEGFloat": CEGFloat,
    "CEGBoolean": CEGBoolean,
    "CEGSeed": CEGSeed,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "CEGContext": "CEG Context",
    "CEGText": "CEG Text",
    "CEGInteger": "CEG Integer",
    "CEGFloat": "CEG Float",
    "CEGBoolean": "CEG Boolean",
    "CEGSeed": "CEG Seed",
}
