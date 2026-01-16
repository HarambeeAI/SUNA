"""API Models for AgentPress

This module contains all Pydantic models used for API request/response validation.
Models are organized by domain for better maintainability.
"""

from .common import (
    PaginationInfo,
)

from .agents import (
    AgentCreateRequest,
    AgentUpdateRequest,
    AgentResponse,
    AgentVersionResponse,
    AgentVersionCreateRequest,
    AgentsResponse,
    AgentExportData,
    AgentImportRequest,
    AgentIconGenerationRequest,
    AgentIconGenerationResponse,
)

from .threads import (
    UnifiedAgentStartResponse,
    CreateThreadResponse,
    MessageCreateRequest,
)

from .imports import (
    JsonAnalysisRequest,
    JsonAnalysisResponse,
    JsonImportRequestModel,
    JsonImportResponse,
)

from .organizations import (
    PlanTier,
    BillingStatus,
    OrganizationRole,
    OrganizationCreateRequest,
    OrganizationUpdateRequest,
    OrganizationMemberResponse,
    OrganizationResponse,
    OrganizationsListResponse,
)

from .invitations import (
    InvitationStatus,
    InvitationCreateRequest,
    InvitationResponse,
    InvitationsListResponse,
    InvitationPublicResponse,
    AcceptInvitationResponse,
)

from .auth_context import (
    OrganizationSummary,
    AuthContextResponse,
    SwitchOrgRequest,
    SwitchOrgResponse,
)


__all__ = [
    # Agent models
    "AgentCreateRequest",
    "AgentUpdateRequest", 
    "AgentResponse",
    "AgentVersionResponse",
    "AgentVersionCreateRequest",
    "AgentsResponse",
    "AgentExportData",
    "AgentImportRequest",
    "AgentIconGenerationRequest",
    "AgentIconGenerationResponse",
    
    # Thread models
    "UnifiedAgentStartResponse",
    "CreateThreadResponse",
    "MessageCreateRequest",
    
    # Import models
    "JsonAnalysisRequest",
    "JsonAnalysisResponse", 
    "JsonImportRequestModel",
    "JsonImportResponse",
    
    # Common models
    "PaginationInfo",

    # Organization models
    "PlanTier",
    "BillingStatus",
    "OrganizationRole",
    "OrganizationCreateRequest",
    "OrganizationUpdateRequest",
    "OrganizationMemberResponse",
    "OrganizationResponse",
    "OrganizationsListResponse",

    # Invitation models
    "InvitationStatus",
    "InvitationCreateRequest",
    "InvitationResponse",
    "InvitationsListResponse",
    "InvitationPublicResponse",
    "AcceptInvitationResponse",

    # Auth context models
    "OrganizationSummary",
    "AuthContextResponse",
    "SwitchOrgRequest",
    "SwitchOrgResponse",
]