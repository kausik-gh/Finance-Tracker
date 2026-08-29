"""Persistent 30-minute Gmail scraper worker."""

from __future__ import annotations

import logging
import os
import sys
import time
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

from gmail_client import (
    fetch_emails_since,
    gmail_service,
    is_hdfc_alert,
    parse_balance_message,
    parse_failure_reason,
    parse_finance_message,
    refresh_if_needed,
)
from main import db, settings
from utils import backfill_balances

load_dotenv()
Path("logs").mkdir(exist_ok=True)
LOGGER = logging.getLogger("finance.scraper")
LOGGER.setLevel(os.getenv("LOG_LEVEL", "INFO"))
LOGGER.propagate = False
if not LOGGER.handlers:
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    file_handler = logging.FileHandler("logs/scraper.log")
    file_handler.setFormatter(formatter)
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)
    LOGGER.addHandler(file_handler)
    LOGGER.addHandler(stream_handler)


def refresh_user_token(user: dict) -> dict:
    credentials, refreshed = refresh_if_needed(
        user["gmail_tokens"],
        settings.google_client_id,
        settings.google_client_secret,
    )
    if refreshed:
        db.table("fin_users").update({"gmail_tokens": refreshed}).eq("id", user["id"]).execute()
        user["gmail_tokens"] = refreshed
        LOGGER.info("Refreshed Gmail token for user %s", user["id"])
    return {"credentials": credentials, "user": user}


def clear_invalid_token(user_id: str, error: Exception) -> None:
    db.table("fin_users").update({"gmail_tokens": None}).eq("id", user_id).execute()
    LOGGER.exception("Cleared invalid Gmail token for user %s", user_id, exc_info=error)


def _is_auth_failure(exc: Exception) -> bool:
    """Only treat confirmed Google authorization problems as revoked tokens."""
    name = type(exc).__name__
    if name in {"RefreshError", "RefreshAuthError"}:
        return True
    status = getattr(getattr(exc, "resp", None), "status", None)
    if status in {401, 403}:
        return True
    lowered = str(exc).lower()
    return any(
        marker in lowered
        for marker in ("invalid_grant", "invalid credentials", "has no refresh token")
    )


def _parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _latest_table_timestamp(table: str, user_id: str) -> datetime | None:
    rows = (
        db.table(table)
        .select("email_timestamp")
        .eq("user_id", user_id)
        .not_.is_("email_timestamp", "null")
        .order("email_timestamp", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        return None
    return _parse_timestamp(rows[0].get("email_timestamp"))


def latest_email_timestamp(user_id: str) -> datetime:
    """Return the newest stored email timestamp, or midnight UTC on the first of this month."""
    candidates = [
        stamp
        for stamp in (
            _latest_table_timestamp("fin_transactions", user_id),
            _latest_table_timestamp("fin_balance_history", user_id),
        )
        if stamp is not None
    ]
    if candidates:
        return max(candidates)
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, 1, tzinfo=timezone.utc)


def _is_duplicate_error(exc: Exception) -> bool:
    lowered = str(exc).lower()
    return "duplicate" in lowered or "23505" in lowered or "409" in lowered


def upsert_transaction(user_id: str, transaction: dict) -> bool:
    """Insert a transaction unless unique_ref already exists. Returns True when inserted."""
    unique_ref = transaction["unique_ref"]
    existing = (
        db.table("fin_transactions")
        .select("id")
        .eq("unique_ref", unique_ref)
        .limit(1)
        .execute()
        .data
    )
    if existing:
        return False
    payload = {
        "user_id": user_id,
        "unique_ref": unique_ref,
        "transaction_date": transaction["transaction_date"],
        "amount": transaction["amount"],
        "type": transaction["type"],
        "merchant": transaction.get("merchant"),
        "description": transaction.get("description"),
        "email_timestamp": transaction["email_timestamp"],
    }
    try:
        db.table("fin_transactions").insert(payload).execute()
        return True
    except Exception as exc:
        if _is_duplicate_error(exc):
            return False
        LOGGER.exception("Database error inserting transaction %s for user %s", unique_ref, user_id)
        raise


def upsert_balance(user_id: str, snapshot: dict) -> bool:
    """Insert a balance snapshot unless the same email timestamp and amount already exist."""
    existing = (
        db.table("fin_balance_history")
        .select("id")
        .eq("user_id", user_id)
        .eq("email_timestamp", snapshot["email_timestamp"])
        .eq("balance", snapshot["balance"])
        .limit(1)
        .execute()
        .data
    )
    if existing:
        return False
    payload = {
        "user_id": user_id,
        "snapshot_date": snapshot["snapshot_date"],
        "balance": snapshot["balance"],
        "email_timestamp": snapshot["email_timestamp"],
    }
    try:
        db.table("fin_balance_history").insert(payload).execute()
        return True
    except Exception:
        LOGGER.exception("Database error inserting balance snapshot for user %s", user_id)
        raise


def scrape_user(user: dict) -> None:
    user_id = str(user["id"])
    started = time.perf_counter()
    started_at = datetime.now(timezone.utc)
    last_ts = latest_email_timestamp(user_id)
    LOGGER.info(
        "Scrape cycle started for user %s at %s. Last email timestamp: %s.",
        user_id,
        started_at.isoformat(),
        last_ts.isoformat(),
    )

    try:
        auth = refresh_user_token(user)
        service = gmail_service(auth["credentials"])
        messages = fetch_emails_since(service, last_ts, user_id=user_id)
    except Exception as exc:
        LOGGER.exception("Gmail API error while fetching emails for user %s", user_id)
        if _is_auth_failure(exc):
            clear_invalid_token(user_id, exc)
        duration = time.perf_counter() - started
        LOGGER.info("Scrape cycle completed for user %s. Total time: %.2f seconds.", user_id, duration)
        return

    LOGGER.info("Fetched %s emails from Gmail.", len(messages))
    banking_messages = [message for message in messages if is_hdfc_alert(message)]
    LOGGER.info("Found %s HDFC banking emails.", len(banking_messages))

    success_count = 0
    skip_count = 0
    balance_count = 0
    balance_skip_count = 0

    for message in banking_messages:
        message_id = message.get("id")
        try:
            parsed_transaction = parse_finance_message(message)
            parsed_balance = parse_balance_message(message)
            if parsed_transaction:
                LOGGER.info(
                    "Parsed %s email: amount=%s, merchant=%s, ref=%s",
                    parsed_transaction["type"],
                    parsed_transaction["amount"],
                    parsed_transaction.get("merchant"),
                    parsed_transaction["unique_ref"],
                )
                if upsert_transaction(user_id, parsed_transaction):
                    success_count += 1
                else:
                    skip_count += 1
            if parsed_balance:
                LOGGER.info(
                    "Parsed balance email: amount=%s, merchant=%s, ref=%s",
                    parsed_balance["balance"],
                    None,
                    None,
                )
                if upsert_balance(user_id, parsed_balance):
                    balance_count += 1
                else:
                    balance_skip_count += 1
            if not parsed_transaction and not parsed_balance:
                reason = parse_failure_reason(message)
                if "unrecognized HDFC email template" in reason:
                    LOGGER.info("Skipped non-transactional HDFC email %s: %s", message_id, reason)
                else:
                    LOGGER.error("Failed to parse email %s: %s", message_id, reason)
        except Exception:
            LOGGER.exception("Failed to parse email %s: unexpected exception", message_id)

    LOGGER.info(
        "Upserted %s transactions, skipped %s duplicates.",
        success_count,
        skip_count,
    )
    LOGGER.info(
        "Upserted %s balance snapshots, skipped %s duplicates.",
        balance_count,
        balance_skip_count,
    )

    if success_count:
        try:
            backfill_user_balances(user["id"])
        except Exception:
            LOGGER.exception("Database error while backfilling balances for user %s", user_id)

    duration = time.perf_counter() - started
    LOGGER.info("Scrape cycle completed for user %s. Total time: %.2f seconds.", user_id, duration)


def backfill_user_balances(user_id: UUID) -> None:
    snapshots = (
        db.table("fin_balance_history")
        .select("snapshot_date,balance")
        .eq("user_id", str(user_id))
        .order("snapshot_date", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not snapshots:
        LOGGER.info("No balance snapshot available for user %s", user_id)
        return
    snapshot = snapshots[0]
    transactions = (
        db.table("fin_transactions")
        .select("id,transaction_date,amount,type,created_at")
        .eq("user_id", str(user_id))
        .gte("transaction_date", snapshot["snapshot_date"][:10])
        .order("transaction_date", desc=False)
        .execute()
        .data
    )
    snapshot_balance = Decimal(str(snapshot["balance"]))
    for transaction_id, balance in backfill_balances(snapshot_balance, transactions):
        db.table("fin_transactions").update({"balance_after": str(balance)}).eq("id", transaction_id).execute()


def run_cycle() -> None:
    LOGGER.info("Starting Gmail scrape cycle")
    users = (
        db.table("fin_users")
        .select("id,email,gmail_tokens")
        .not_.is_("gmail_tokens", "null")
        .execute()
        .data
    )
    for user in users:
        try:
            scrape_user(user)
        except Exception:
            LOGGER.exception("Unhandled scraper failure for user %s", user.get("id"))
    LOGGER.info("Finished Gmail scrape cycle for %d users", len(users))


def main() -> None:
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(run_cycle, "interval", minutes=30, id="gmail-scrape", max_instances=1, coalesce=True)
    scheduler.start()
    run_cycle()
    LOGGER.info("Scraper worker started")
    try:
        while True:
            time.sleep(60)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown(wait=False)
        LOGGER.info("Scraper worker stopped")


if __name__ == "__main__":
    main()
