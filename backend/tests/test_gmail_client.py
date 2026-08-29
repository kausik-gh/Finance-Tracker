from datetime import datetime, timezone

from google.oauth2.credentials import Credentials

from gmail_client import is_expired, normalize_expiry


def test_normalize_expiry_adds_utc_to_naive_values():
    expiry = normalize_expiry("2026-08-15T12:00:00")

    assert expiry == datetime(2026, 8, 15, 12, tzinfo=timezone.utc)


def test_normalize_expiry_converts_aware_values_to_utc():
    expiry = normalize_expiry("2026-08-15T17:30:00+05:30")

    assert expiry == datetime(2026, 8, 15, 12, tzinfo=timezone.utc)


def test_is_expired_handles_naive_credentials_expiry():
    credentials = Credentials(token="test")
    credentials.expiry = datetime(2020, 1, 1)

    assert is_expired(credentials) is True
    assert credentials.expiry.tzinfo == timezone.utc
