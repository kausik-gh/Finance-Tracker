"""Google OAuth and Gmail API helpers."""

from __future__ import annotations

import base64
import html
import logging
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import Flow

from utils import fallback_unique_ref, parse_amount, parse_message_date

LOGGER = logging.getLogger(__name__)
SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
]

# HDFC alert mailbox used for Gmail search and sender checks.
HDFC_SENDER = "alerts@hdfcbank.bank.in"

# Currency amount such as Rs.253.00, Rs. INR 12,487.18, or INR 1000.
# Requires at least one digit so a lone comma cannot reach Decimal().
_AMOUNT_RE = re.compile(r"(?:₹|rs\.?\s*|inr\s+)([\d,]*\d[\d,]*(?:\.\d{1,2})?)", re.I)

# Body dates: "on 12-08-26", "Date: 12-08-26", "as on 14-AUG-26".
_BODY_DATE_RE = re.compile(
    r"(?:as on|date\s*:|(?<![A-Za-z])on)\s*"
    r"(\d{1,2}-[A-Za-z]{3}-\d{2,4}|\d{1,2}-\d{1,2}-\d{2,4})",
    re.I,
)

# UPI reference across debit and credit templates.
_UPI_REF_RE = re.compile(
    r"upi\s+(?:transaction\s+)?reference\s*(?:no\.?|number)?\s*[:.]?\s*([A-Za-z0-9]+)",
    re.I,
)

# Last four digits of the account, optionally prefixed with XX.
_ACCOUNT_ENDING_RE = re.compile(
    r"account ending(?:\s+in)?\s+(?:xx)?(\d{4})",
    re.I,
)

# Debit merchant: VPA plus optional display name in parentheses.
_DEBIT_VPA_RE = re.compile(
    r"towards\s+vpa\s+([^\s(]+)(?:\s*\(([^)]+)\))?",
    re.I,
)

# Credit counterparty: "Sender: NAME (VPA: ...)"
_CREDIT_SENDER_RE = re.compile(
    r"sender\s*:\s*([^\n(]+?)(?:\s*\(|\s*$)",
    re.I,
)
_CREDIT_VPA_RE = re.compile(r"vpa\s*:\s*([^\s)]+)", re.I)


def normalize_expiry(expiry: str | datetime | None) -> datetime | None:
    """Convert Supabase token expiry values into UTC-aware datetimes."""
    if expiry is None:
        return None
    if isinstance(expiry, str):
        expiry = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
    if expiry.tzinfo is None:
        return expiry.replace(tzinfo=timezone.utc)
    return expiry.astimezone(timezone.utc)


class TimezoneSafeCredentials(Credentials):
    """Credentials whose expiry check is safe across google-auth timezone behavior."""

    @property
    def expired(self) -> bool:
        expiry = normalize_expiry(self.expiry)
        return expiry is None or datetime.now(timezone.utc) >= expiry


def oauth_flow(client_id: str, client_secret: str, redirect_uri: str) -> Flow:
    client_config = {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }
    flow = Flow.from_client_config(client_config, scopes=SCOPES)
    flow.redirect_uri = redirect_uri
    return flow


def credentials_from_tokens(tokens: dict[str, Any], client_id: str, client_secret: str) -> Credentials:
    expiry_value = normalize_expiry(tokens.get("expiry"))
    return TimezoneSafeCredentials(
        token=tokens.get("access_token"),
        refresh_token=tokens.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=SCOPES,
        expiry=expiry_value,
    )


def is_expired(credentials: Credentials) -> bool:
    """Check expiry without relying on google-auth's timezone-sensitive property."""
    expiry = normalize_expiry(credentials.expiry)
    credentials.expiry = expiry
    return expiry is None or datetime.now(timezone.utc) >= expiry


def tokens_from_credentials(credentials: Credentials) -> dict[str, Any]:
    if not credentials.token:
        raise ValueError("Google did not return an access token")
    expiry = normalize_expiry(credentials.expiry) or (datetime.now(timezone.utc) + timedelta(hours=1))
    return {
        "access_token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "expiry": expiry.astimezone(timezone.utc).isoformat(),
    }


def refresh_if_needed(
    tokens: dict[str, Any],
    client_id: str,
    client_secret: str,
) -> tuple[Credentials, dict[str, Any] | None]:
    credentials = credentials_from_tokens(tokens, client_id, client_secret)
    if is_expired(credentials):
        if not credentials.refresh_token:
            raise RuntimeError("Google token expired and has no refresh token")
        credentials.refresh(Request())
        return credentials, tokens_from_credentials(credentials)
    return credentials, None


def gmail_service(credentials: Credentials):
    return build("gmail", "v1", credentials=credentials, cache_discovery=False)


def parse_hdfc_date(value: str | None) -> date | None:
    """Parse HDFC body dates in DD-MM-YY and DD-MON-YY forms."""
    if not value:
        return None
    candidate = value.strip()
    formats = ("%d-%b-%y", "%d-%b-%Y", "%d-%B-%y", "%d-%B-%Y", "%d-%m-%y", "%d-%m-%Y")
    variants = (candidate, candidate.upper(), candidate.title())
    for fmt in formats:
        for variant in variants:
            try:
                return datetime.strptime(variant, fmt).date()
            except ValueError:
                continue
    return None


def email_timestamp_from_message(message: dict[str, Any]) -> datetime:
    """Convert Gmail internalDate milliseconds into a UTC-aware datetime."""
    raw = message.get("internalDate") or "0"
    return datetime.fromtimestamp(int(raw) / 1000, timezone.utc)


def _strip_html(value: str) -> str:
    text = html.unescape(value)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</p>", "\n", text)
    text = re.sub(r"(?i)</div>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text


def _collect_bodies(payload: dict[str, Any]) -> tuple[str, str]:
    """Walk MIME parts and return the first text/plain and text/html bodies."""
    plain = ""
    html_body = ""
    mime = (payload.get("mimeType") or "").lower()
    data = payload.get("body", {}).get("data")
    if data:
        decoded = base64.urlsafe_b64decode(data).decode(errors="replace")
        if mime == "text/html":
            html_body = decoded
        else:
            plain = decoded
    for part in payload.get("parts", []) or []:
        part_plain, part_html = _collect_bodies(part)
        plain = plain or part_plain
        html_body = html_body or part_html
    return plain, html_body


def _headers(message: dict[str, Any]) -> dict[str, str]:
    payload = message.get("payload", {})
    return {item["name"].lower(): item["value"] for item in payload.get("headers", [])}


def _message_text(message: dict[str, Any]) -> str:
    payload = message.get("payload", {})
    headers = _headers(message)
    plain, html_body = _collect_bodies(payload)
    body = plain.strip() if plain.strip() else _strip_html(html_body)
    return f"{headers.get('subject', '')}\n{body}"


def _body(payload: dict[str, Any]) -> str:
    plain, html_body = _collect_bodies(payload)
    if plain.strip():
        return plain
    return _strip_html(html_body)


def is_hdfc_alert(message: dict[str, Any]) -> bool:
    sender = _headers(message).get("from", "")
    return HDFC_SENDER.lower() in sender.lower()


def _transaction_date(text: str, message: dict[str, Any]) -> date:
    parsed = None
    match = _BODY_DATE_RE.search(text)
    if match:
        parsed = parse_hdfc_date(match.group(1))
    if parsed:
        return parsed
    return parse_message_date(None, email_timestamp_from_message(message))


def _parse_amount_group(raw: str | None) -> Decimal | None:
    """Convert a regex capture into Decimal, ignoring empty or malformed values."""
    if not raw:
        return None
    try:
        return parse_amount(raw)
    except (InvalidOperation, ValueError):
        return None


def _upi_or_fallback(text: str, message: dict[str, Any], amount: Decimal, transaction_date: date) -> str:
    match = _UPI_REF_RE.search(text)
    if match:
        return match.group(1).strip()
    return fallback_unique_ref(message.get("id") or "", amount, transaction_date)


def fetch_recent_messages(service, hours: int = 1) -> list[dict[str, Any]]:
    after = int((datetime.now(timezone.utc) - timedelta(hours=hours)).timestamp())
    response = service.users().messages().list(userId="me", q=f"after:{after}").execute()
    messages = []
    for item in response.get("messages", []):
        messages.append(
            service.users()
            .messages()
            .get(userId="me", id=item["id"], format="full")
            .execute()
        )
    return messages


def fetch_emails_since(service, since_timestamp: datetime, user_id: str | None = None) -> list[dict[str, Any]]:
    """Fetch HDFC alert emails received after the given UTC timestamp."""
    aware = since_timestamp if since_timestamp.tzinfo else since_timestamp.replace(tzinfo=timezone.utc)
    after = int(aware.astimezone(timezone.utc).timestamp())
    query = f"from:{HDFC_SENDER} after:{after}"
    LOGGER.info(
        "Fetching Gmail messages since %s (query=%s%s)",
        aware.astimezone(timezone.utc).isoformat(),
        query,
        f", user={user_id}" if user_id else "",
    )

    messages: list[dict[str, Any]] = []
    page_token: str | None = None
    while True:
        request_kwargs: dict[str, Any] = {
            "userId": "me",
            "q": query,
            "maxResults": 100,
        }
        if page_token:
            request_kwargs["pageToken"] = page_token
        response = service.users().messages().list(**request_kwargs).execute()
        for item in response.get("messages", []) or []:
            messages.append(
                service.users()
                .messages()
                .get(userId="me", id=item["id"], format="full")
                .execute()
            )
        page_token = response.get("nextPageToken")
        if not page_token:
            break
    return messages


def parse_finance_message(message: dict[str, Any]) -> dict[str, Any] | None:
    """Parse HDFC debit and credit alert emails into transaction rows."""
    text = _message_text(message)
    lowered = text.lower()
    headers = _headers(message)

    # Balance snapshots are handled separately and must not become transactions.
    if "available balance" in lowered:
        return None

    is_debit = bool(re.search(r"\bdebited\b", lowered))
    is_credit = bool(re.search(r"\bcredited\b", lowered))
    if is_debit and is_credit:
        is_debit = lowered.find("debited") < lowered.find("credited")
        is_credit = not is_debit
    if not (is_debit or is_credit):
        return None

    amount_match = None
    if is_debit:
        amount_match = re.search(
            r"(?:₹|rs\.?\s*|inr\s+)([\d,]*\d[\d,]*(?:\.\d{1,2})?)\s+(?:is\s+)?debited",
            text,
            re.I,
        )
    else:
        amount_match = re.search(
            r"(?:₹|rs\.?\s*|inr\s+)([\d,]*\d[\d,]*(?:\.\d{1,2})?)\s+(?:has\s+been\s+successfully\s+)?credited",
            text,
            re.I,
        )
    if not amount_match:
        amount_match = _AMOUNT_RE.search(text)
    amount = _parse_amount_group(amount_match.group(1) if amount_match else None)
    if amount is None:
        return None
    transaction_date = _transaction_date(text, message)
    email_timestamp = email_timestamp_from_message(message)
    unique_ref = _upi_or_fallback(text, message, amount, transaction_date)
    merchant: str | None = None

    if is_debit:
        vpa_match = _DEBIT_VPA_RE.search(text)
        if vpa_match:
            vpa = vpa_match.group(1).strip().rstrip(".,;")
            display_name = (vpa_match.group(2) or "").strip()
            merchant = display_name or vpa
        else:
            towards_match = re.search(r"towards\s+([A-Za-z0-9 .&'@_-]{2,80})", text, re.I)
            merchant = towards_match.group(1).strip().rstrip(".,;") if towards_match else None
    else:
        sender_match = _CREDIT_SENDER_RE.search(text)
        if sender_match:
            merchant = sender_match.group(1).strip().rstrip(".,;")
        else:
            vpa_match = _CREDIT_VPA_RE.search(text)
            merchant = vpa_match.group(1).strip() if vpa_match else None

    account_match = _ACCOUNT_ENDING_RE.search(text)
    description = headers.get("subject") or None
    if account_match and description:
        description = f"{description} (account ending {account_match.group(1)})"
    elif account_match:
        description = f"Account ending {account_match.group(1)}"

    return {
        "unique_ref": unique_ref,
        "transaction_date": transaction_date.isoformat(),
        "amount": str(amount),
        "type": "debit" if is_debit else "credit",
        "merchant": merchant,
        "description": description,
        "email_timestamp": email_timestamp.isoformat(),
    }


def parse_balance_message(message: dict[str, Any]) -> dict[str, Any] | None:
    """Parse HDFC available-balance emails into snapshot rows."""
    text = _message_text(message)
    if "available balance" not in text.lower():
        return None

    amount_match = re.search(
        r"available\s+balance.*?is\s+(?:rs\.?\s*)?(?:inr\s+)?([\d,]*\d[\d,]*(?:\.\d{1,2})?)",
        text,
        re.I | re.S,
    )
    if not amount_match:
        amount_match = re.search(
            r"available\s+balance.*?(?:₹|rs\.?\s*|inr\s+)([\d,]*\d[\d,]*(?:\.\d{1,2})?)",
            text,
            re.I | re.S,
        )
    amount = _parse_amount_group(amount_match.group(1) if amount_match else None)
    if amount is None:
        return None

    email_timestamp = email_timestamp_from_message(message)
    snapshot_day = _transaction_date(text, message)
    snapshot_date = datetime(
        snapshot_day.year,
        snapshot_day.month,
        snapshot_day.day,
        tzinfo=timezone.utc,
    )
    return {
        "snapshot_date": snapshot_date.isoformat(),
        "balance": str(amount),
        "email_timestamp": email_timestamp.isoformat(),
    }


def parse_failure_reason(message: dict[str, Any]) -> str:
    """Explain why an HDFC alert could not be turned into a row."""
    text = _message_text(message)
    lowered = text.lower()
    if "available balance" in lowered:
        if not _AMOUNT_RE.search(text):
            return "balance email missing amount"
        return "balance email missing a usable snapshot date or amount"
    if "debited" in lowered or "credited" in lowered:
        if not _AMOUNT_RE.search(text):
            return "transaction email missing amount"
        return "transaction email missing required fields"
    sender = _headers(message).get("from", "")
    subject = _headers(message).get("subject") or "(no subject)"
    if HDFC_SENDER.lower() not in sender.lower():
        return f"sender is not {HDFC_SENDER} (subject={subject})"
    return f"unrecognized HDFC email template (subject={subject})"
