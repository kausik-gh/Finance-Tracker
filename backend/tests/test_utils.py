from datetime import date
from decimal import Decimal
from uuid import uuid4

from utils import backfill_balances, sign_session, verify_session


def test_session_round_trip_and_tamper_detection():
    secret = "test-secret"
    user_id = uuid4()
    signed = sign_session(user_id, secret, 60)

    assert verify_session(signed, secret) == user_id
    assert verify_session(f"{signed}x", secret) is None


def test_backfill_balance_applies_credit_and_debit_in_date_order():
    transactions = [
        {"id": "debit", "transaction_date": date(2026, 1, 2), "amount": "10.00", "type": "debit"},
        {"id": "credit", "transaction_date": date(2026, 1, 1), "amount": "25.00", "type": "credit"},
    ]

    assert backfill_balances(Decimal("100.00"), transactions) == [
        ("credit", Decimal("125.00")),
        ("debit", Decimal("115.00")),
    ]
