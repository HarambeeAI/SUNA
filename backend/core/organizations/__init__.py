"""Organizations module for multi-tenant organization management."""

from . import repo
from . import invitations_repo
from . import auth_context_repo
from . import rbac
from . import usage_limits
# Note: billing_webhooks is imported lazily in webhooks.py to avoid circular dependencies

# Re-export commonly used RBAC components
from .rbac import (
    OrganizationRole,
    Permission,
    OrgAccessContext,
    require_org_owner,
    require_org_admin,
    require_org_member,
    require_org_viewer,
    require_org_permission,
    role_has_permission,
    role_at_least,
)

# Re-export usage limit functions
from .usage_limits import (
    check_org_agent_limit,
    check_org_run_limit,
    increment_org_agent_usage,
    increment_org_run_usage,
    ERROR_CODE_AGENT_LIMIT,
    ERROR_CODE_RUN_LIMIT,
)
