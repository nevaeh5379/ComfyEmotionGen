import os

# SemVer of the backend API surface. Bump independently from the release bundle:
# MAJOR = breaking API change, MINOR = additive, PATCH = internal/bugfix only.
# Future WinUI/Android clients negotiate against this, not the bundle CalVer.
BACKEND_VERSION = "0.1.0"

# CalVer of the *distribution bundle* (zip / docker image / installer).
# Injected at build time by CI; "dev" for local source checkouts.
BUNDLE_VERSION = os.environ.get("CEG_BUNDLE_VERSION") or "dev"
COMMIT = os.environ.get("CEG_COMMIT") or None
