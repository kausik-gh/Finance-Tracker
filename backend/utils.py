"""Small security, parsing, and balance-calculation helpers."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import date, datetime, timezone
from decimal import Decimal
from email.utils import parsedate_to_datetime
from typing import Any
from uuid import UUID


def new_state() -> str:
    return secrets.token_urlsafe(32)


def sign_session(user_id: UUID, secret_key: str, ttl_seconds: int) -> str:
    expires_at = int(time.time()) + ttl_seconds
    payload = json.dumps(
        {"user_id": str(user_id), "expires_at": expires_at},
        separators=(",", ":"),
    ).encode()
    encoded = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    signature = hmac.new(secret_key.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def verify_session(value: str | None, secret_key: str) -> UUID | None:
    if not value or "." not in value:
        return None
    encoded, signature = value.rsplit(".", 1)
    expected = hmac.new(secret_key.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(encoded + "=="))
        if int(payload["expires_at"]) <= int(time.time()):
            return None
        return UUID(payload["user_id"])
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None


def parse_amount(value: str) -> Decimal:
    cleaned = value.replace(",", "").replace("₹", "").strip()
    return Decimal(cleaned)


def parse_message_date(value: str | None, fallback: datetime | None = None) -> date:
    if value:
        try:
            return parsedate_to_datetime(value).date()
        except (TypeError, ValueError, OverflowError):
            pass
    return (fallback or datetime.now(timezone.utc)).date()


def fallback_unique_ref(message_id: str, amount: Decimal, transaction_date: date) -> str:
    raw = f"{message_id}|{amount}|{transaction_date}".encode()
    return f"email-{hashlib.sha256(raw).hexdigest()}"


def backfill_balances(
    snapshot_balance: Decimal | None,
    transactions: list[dict[str, Any]],
) -> list[tuple[str, Decimal]]:
    """Calculate running balances from a snapshot in chronological order."""
    if snapshot_balance is None:
        return []
    running = snapshot_balance
    results: list[tuple[str, Decimal]] = []
    for transaction in sorted(
        transactions,
        key=lambda item: (item["transaction_date"], item.get("created_at") or ""),
    ):
        amount = Decimal(str(transaction["amount"]))
        running += amount if transaction["type"] == "credit" else -amount
        results.append((transaction["id"], running.quantize(Decimal("0.01"))))
    return results
