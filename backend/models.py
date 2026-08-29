"""Pydantic models shared by the API and scraper."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    email: str
    display_name: str | None = None
    gmail_tokens: dict[str, Any] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    user_id: UUID
    unique_ref: str
    transaction_date: date
    amount: Decimal
    type: Literal["debit", "credit"]
    merchant: str | None = None
    category: str | None = None
    description: str | None = None
    balance_after: Decimal | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class BalanceSnapshot(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    user_id: UUID
    snapshot_date: datetime
    balance: Decimal
    created_at: datetime | None = None


class SyncRequest(BaseModel):
    transactions: list[dict[str, Any]] = Field(default_factory=list)
    sources: list[dict[str, Any]] = Field(default_factory=list)
    category_mappings: dict[str, str] = Field(default_factory=dict)


class SessionPayload(BaseModel):
    user_id: UUID
    expires_at: int
