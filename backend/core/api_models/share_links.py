"""Agent share link API models."""

from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class ShareLinkSettings(BaseModel):
    """Settings for a share link."""
    rate_limit_per_hour: Optional[int] = 10  # Max runs per hour for public users
    allow_file_access: Optional[bool] = False  # Allow file upload/download
    custom_greeting: Optional[str] = None  # Custom welcome message


class ShareLinkCreateRequest(BaseModel):
    """Request model for creating a share link."""
    expires_in_days: Optional[int] = None  # Optional expiration in days
    settings: Optional[ShareLinkSettings] = None


class ShareLinkAgentInfo(BaseModel):
    """Basic agent info for share link responses."""
    agent_id: str
    name: str
    description: Optional[str] = None
    icon_name: Optional[str] = None
    icon_color: Optional[str] = None
    icon_background: Optional[str] = None


class ShareLinkResponse(BaseModel):
    """Response model for a share link."""
    share_id: str
    agent_id: str
    created_at: str
    expires_at: Optional[str] = None
    is_active: bool
    views_count: int
    runs_count: int
    last_viewed_at: Optional[str] = None
    last_run_at: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None


class ShareLinksListResponse(BaseModel):
    """Response model for list of share links."""
    share_links: List[ShareLinkResponse]


class PublicShareLinkResponse(BaseModel):
    """Response model for public share link access."""
    share_id: str
    agent: ShareLinkAgentInfo
    views_count: int
    settings: Optional[Dict[str, Any]] = None


class PublicShareLinkErrorResponse(BaseModel):
    """Response model for share link errors."""
    error: str
    code: str  # LINK_DEACTIVATED, LINK_EXPIRED, AGENT_NOT_FOUND


class ShareLinkUpdateRequest(BaseModel):
    """Request model for updating a share link."""
    is_active: Optional[bool] = None
    settings: Optional[ShareLinkSettings] = None
