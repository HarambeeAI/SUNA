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
    AgentFromTemplateRequest,
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

from .plan_tiers import (
    PlanTierFeatures,
    PlanTierResponse,
    PlanTiersListResponse,
    UsagePercentages,
    UsageLimits,
    OrganizationUsageResponse,
    UsageRecordResponse,
    UsageHistoryResponse,
)

from .org_billing import (
    OrgPlanTier,
    OrgCheckoutRequest,
    OrgCheckoutResponse,
    OrgBillingPortalRequest,
    OrgBillingPortalResponse,
    OrgSubscriptionStatusResponse,
    UpgradeCTA,
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
    "AgentFromTemplateRequest",
    
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

    # Plan tier and usage models
    "PlanTierFeatures",
    "PlanTierResponse",
    "PlanTiersListResponse",
    "UsagePercentages",
    "UsageLimits",
    "OrganizationUsageResponse",
    "UsageRecordResponse",
    "UsageHistoryResponse",

    # Organization billing models
    "OrgPlanTier",
    "OrgCheckoutRequest",
    "OrgCheckoutResponse",
    "OrgBillingPortalRequest",
    "OrgBillingPortalResponse",
    "OrgSubscriptionStatusResponse",
    "UpgradeCTA",
]