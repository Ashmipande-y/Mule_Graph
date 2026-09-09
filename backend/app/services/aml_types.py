"""Shared types for the AML dataset services -- kept in their own module so
`aml_dataset.py` and `aml_session.py` can each depend on the record shape
without a circular import between them."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AmlRecord:
    id: str
    sender: str
    receiver: str
    amount_paise: int
    currency: str
    timestamp: str
    payment_format: str
