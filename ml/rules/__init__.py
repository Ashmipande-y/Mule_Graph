"""Stage 1: deterministic, CPU-only rules fallback for MuleGraph.

This package is intentionally independent of FastAPI, any database, and the
frontend. It only depends on the Python standard library and operates on
plain Transaction records, so it can be imported and tested without the rest
of the application running.
"""
