"""
Organization API Keys API Models

Pydantic models for organization-level API key management with scopes.
Supports scopes: read:agents, write:agents, execute:agents, read:templates
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field, field_validator


class OrgApiKeyScope(str, Enum):
    """Available scopes for organization API keys"""
    READ_AGENTS = "read:agents"
    WRITE_AGENTS = "write:agents"
    EXECUTE_AGENTS = "execute:agents"
    READ_TEMPLATES = "read:templates"


class OrgApiKeyStatus(str, Enum):
    """Status of an organization API key"""
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"


class OrgApiKeyCreateRequest(BaseModel):
    """Request model for creating a new organization API key"""
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Human-readable name for the API key"
    )
    scopes: List[OrgApiKeyScope] = Field(
        ...,
        min_length=1,
        description="List of scopes for the API key"
    )
    description: Optional[str] = Field(
        None,
        description="Optional description for the API key"
    )
    expires_in_days: Optional[int] = Field(
        None,
        gt=0,
        le=365,
        description="Number of days until expiration (max 365)"
    )

    @field_validator("name")
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()

    @field_validator("scopes")
    def validate_scopes(cls, v):
        if not v:
            raise ValueError("At least one scope is required")
        return list(set(v))  # Remove duplicates


class OrgApiKeyResponse(BaseModel):
    """Response model for API key information (without the secret key)"""
    key_id: UUID
    org_id: UUID
    name: str
    public_key_prefix: str = Field(
        ...,
        description="First 8 characters of public key for identification"
    )
    scopes: List[OrgApiKeyScope]
    description: Optional[str]
    status: OrgApiKeyStatus
    expires_at: Optional[datetime]
    last_used_at: Optional[datetime]
    created_by: UUID
    created_at: datetime


class OrgApiKeyCreateResponse(BaseModel):
    """Response model for newly created API key (includes the full key once)"""
    key_id: UUID
    org_id: UUID
    name: str
    public_key: str = Field(
        ...,
        description="Full public key (opk_xxx format)"
    )
    secret_key: str = Field(
        ...,
        description="Full secret key (osk_xxx format) - only shown once!"
    )
    scopes: List[OrgApiKeyScope]
    description: Optional[str]
    status: OrgApiKeyStatus
    expires_at: Optional[datetime]
    created_by: UUID
    created_at: datetime


class OrgApiKeyListResponse(BaseModel):
    """Response model for listing organization API keys"""
    api_keys: List[OrgApiKeyResponse]
    total: int


class OrgApiKeyValidationResult(BaseModel):
    """Result of organization API key validation"""
    is_valid: bool
    org_id: Optional[UUID] = None
    key_id: Optional[UUID] = None
    scopes: Optional[List[OrgApiKeyScope]] = None
    error_message: Optional[str] = None


class OrgApiKeyUpdateRequest(BaseModel):
    """Request model for updating an organization API key"""
    name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="New name for the API key"
    )
    description: Optional[str] = Field(
        None,
        description="New description for the API key"
    )

    @field_validator("name")
    def validate_name(cls, v):
        if v is not None and not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip() if v else None
