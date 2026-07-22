"""Recoverable development pipeline harness.

The package deliberately keeps its runtime dependencies small.  Discord and
provider-specific integrations are imported only by the modules that need
them, so the state layer remains usable in an offline test environment.
"""

__version__ = "0.1.0"
