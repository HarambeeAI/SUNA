"""Template submission API models."""

from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class TemplateSubmissionStatus(str, Enum):
    """Status of a template submission."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class TemplateSubmissionCreateRequest(BaseModel):
    """Request model for creating a template submission."""
    agent_id: str = Field(..., description="The ID of the agent to submit as a template")
    template_name: str = Field(..., min_length=1, max_length=255, description="Name for the template")
    template_description: Optional[str] = Field(None, description="Description of the template")
    category_id: Optional[str] = Field(None, description="Category ID for the template")
    use_cases: Optional[List[str]] = Field(None, description="Example use cases for the template")


class TemplateSubmissionResponse(BaseModel):
    """Response model for a template submission."""
    submission_id: str
    agent_id: str
    submitter_id: str
    template_name: str
    template_description: Optional[str] = None
    category_id: Optional[str] = None
    use_cases: Optional[List[str]] = None
    status: TemplateSubmissionStatus
    submitted_at: str
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    rejection_reason: Optional[str] = None
    published_template_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: str
    updated_at: str

    # Joined fields (optional, populated when needed)
    agent_name: Optional[str] = None
    submitter_email: Optional[str] = None
    category_name: Optional[str] = None


class TemplateSubmissionsListResponse(BaseModel):
    """Response model for a list of template submissions."""
    submissions: List[TemplateSubmissionResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class ApproveSubmissionRequest(BaseModel):
    """Request model for approving a template submission."""
    admin_notes: Optional[str] = Field(None, description="Internal notes from the admin")


class RejectSubmissionRequest(BaseModel):
    """Request model for rejecting a template submission."""
    rejection_reason: str = Field(..., min_length=1, description="Reason for rejection (sent to user)")
    admin_notes: Optional[str] = Field(None, description="Internal notes from the admin")


class TemplateSubmissionStatsResponse(BaseModel):
    """Response model for template submission statistics."""
    total_submissions: int
    pending_count: int
    approved_count: int
    rejected_count: int
    submissions_this_week: int
    avg_review_time_hours: Optional[float] = None
