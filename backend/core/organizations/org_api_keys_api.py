"""
Organization API Keys API Endpoints

REST API endpoints for managing organization-level API keys with scopes.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List
from uuid import UUID

from core.api_models import (
    OrgApiKeyScope,
    OrgApiKeyStatus,
    OrgApiKeyCreateRequest,
    OrgApiKeyResponse,
    OrgApiKeyCreateResponse,
    OrgApiKeyListResponse,
    OrgApiKeyUpdateRequest,
)
from core.organizations.rbac import OrgAccessContext, require_org_admin
from core.organizations import org_api_keys_repo
from core.utils.logger import logger

router = APIRouter(prefix="/organizations", tags=["organization-api-keys"])


def _format_key_response(key_data: dict) -> OrgApiKeyResponse:
    """Format a key record for API response (hides full public key)."""
    public_key = key_data.get("public_key", "")
    return OrgApiKeyResponse(
        key_id=UUID(str(key_data["key_id"])),
        org_id=UUID(str(key_data["org_id"])),
        name=key_data["name"],
        public_key_prefix=public_key[:12] + "..." if public_key else "",
        scopes=[OrgApiKeyScope(s) for s in key_data.get("scopes", [])],
        description=key_data.get("description"),
        status=OrgApiKeyStatus(key_data.get("status", "active")),
        expires_at=key_data.get("expires_at"),
        last_used_at=key_data.get("last_used_at"),
        created_by=UUID(str(key_data["created_by"])),
        created_at=key_data["created_at"],
    )


@router.post(
    "/{org_id}/api-keys",
    response_model=OrgApiKeyCreateResponse,
    summary="Generate API key",
    description="Create a new API key for the organization with specified scopes."
)
async def create_api_key(
    org_id: UUID,
    request: OrgApiKeyCreateRequest,
    access: OrgAccessContext = Depends(require_org_admin),
):
    """
    Create a new organization API key.

    The secret key is only returned once upon creation.
    Store it securely - it cannot be retrieved again.

    Requires admin or owner role.
    """
    try:
        # Convert scopes to string list
        scopes = [scope.value for scope in request.scopes]

        key_data = await org_api_keys_repo.create_org_api_key(
            org_id=str(org_id),
            user_id=access.user_id,
            name=request.name,
            scopes=scopes,
            description=request.description,
            expires_in_days=request.expires_in_days,
        )

        logger.info(
            "Organization API key created",
            org_id=str(org_id),
            key_id=str(key_data["key_id"]),
            user_id=access.user_id,
            scopes=scopes,
        )

        return OrgApiKeyCreateResponse(
            key_id=UUID(str(key_data["key_id"])),
            org_id=UUID(str(key_data["org_id"])),
            name=key_data["name"],
            public_key=key_data["public_key"],
            secret_key=key_data["secret_key"],
            scopes=[OrgApiKeyScope(s) for s in key_data.get("scopes", [])],
            description=key_data.get("description"),
            status=OrgApiKeyStatus(key_data.get("status", "active")),
            expires_at=key_data.get("expires_at"),
            created_by=UUID(str(key_data["created_by"])),
            created_at=key_data["created_at"],
        )

    except Exception as e:
        logger.error(f"Error creating org API key: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create API key")


@router.get(
    "/{org_id}/api-keys",
    response_model=OrgApiKeyListResponse,
    summary="List API keys",
    description="List all API keys for the organization."
)
async def list_api_keys(
    org_id: UUID,
    access: OrgAccessContext = Depends(require_org_admin),
):
    """
    List all API keys for the organization.

    Returns key metadata and prefix only - not the full keys.
    Requires admin or owner role.
    """
    try:
        keys = await org_api_keys_repo.list_org_api_keys(str(org_id))

        return OrgApiKeyListResponse(
            api_keys=[_format_key_response(key) for key in keys],
            total=len(keys),
        )

    except Exception as e:
        logger.error(f"Error listing org API keys: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to list API keys")


@router.get(
    "/{org_id}/api-keys/{key_id}",
    response_model=OrgApiKeyResponse,
    summary="Get API key",
    description="Get details of a specific API key."
)
async def get_api_key(
    org_id: UUID,
    key_id: UUID,
    access: OrgAccessContext = Depends(require_org_admin),
):
    """
    Get details of a specific API key.

    Does not return the secret key.
    Requires admin or owner role.
    """
    try:
        key_data = await org_api_keys_repo.get_org_api_key_by_id(str(key_id))

        if not key_data:
            raise HTTPException(status_code=404, detail="API key not found")

        # Verify the key belongs to this org
        if str(key_data["org_id"]) != str(org_id):
            raise HTTPException(status_code=404, detail="API key not found")

        return _format_key_response(key_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting org API key: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get API key")


@router.patch(
    "/{org_id}/api-keys/{key_id}",
    response_model=OrgApiKeyResponse,
    summary="Update API key",
    description="Update the name or description of an API key."
)
async def update_api_key(
    org_id: UUID,
    key_id: UUID,
    request: OrgApiKeyUpdateRequest,
    access: OrgAccessContext = Depends(require_org_admin),
):
    """
    Update an API key's name or description.

    Cannot change scopes after creation.
    Requires admin or owner role.
    """
    try:
        # Verify the key exists and belongs to this org
        existing = await org_api_keys_repo.get_org_api_key_by_id(str(key_id))
        if not existing or str(existing["org_id"]) != str(org_id):
            raise HTTPException(status_code=404, detail="API key not found")

        key_data = await org_api_keys_repo.update_org_api_key(
            key_id=str(key_id),
            name=request.name,
            description=request.description,
        )

        if not key_data:
            raise HTTPException(status_code=404, detail="API key not found")

        logger.info(
            "Organization API key updated",
            org_id=str(org_id),
            key_id=str(key_id),
            user_id=access.user_id,
        )

        return _format_key_response(key_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating org API key: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update API key")


@router.post(
    "/{org_id}/api-keys/{key_id}/revoke",
    summary="Revoke API key",
    description="Revoke an API key. The key can no longer be used but is preserved for audit."
)
async def revoke_api_key(
    org_id: UUID,
    key_id: UUID,
    access: OrgAccessContext = Depends(require_org_admin),
):
    """
    Revoke an API key.

    The key is deactivated but preserved for audit purposes.
    Requires admin or owner role.
    """
    try:
        # Verify the key exists and belongs to this org
        existing = await org_api_keys_repo.get_org_api_key_by_id(str(key_id))
        if not existing or str(existing["org_id"]) != str(org_id):
            raise HTTPException(status_code=404, detail="API key not found")

        success = await org_api_keys_repo.revoke_org_api_key(str(key_id))

        if not success:
            raise HTTPException(status_code=404, detail="API key not found")

        logger.info(
            "Organization API key revoked",
            org_id=str(org_id),
            key_id=str(key_id),
            user_id=access.user_id,
        )

        return {"message": "API key revoked successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revoking org API key: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to revoke API key")


@router.delete(
    "/{org_id}/api-keys/{key_id}",
    summary="Delete API key",
    description="Permanently delete an API key."
)
async def delete_api_key(
    org_id: UUID,
    key_id: UUID,
    access: OrgAccessContext = Depends(require_org_admin),
):
    """
    Permanently delete an API key.

    This action cannot be undone.
    Requires admin or owner role.
    """
    try:
        # Verify the key exists and belongs to this org
        existing = await org_api_keys_repo.get_org_api_key_by_id(str(key_id))
        if not existing or str(existing["org_id"]) != str(org_id):
            raise HTTPException(status_code=404, detail="API key not found")

        success = await org_api_keys_repo.delete_org_api_key(str(key_id))

        if not success:
            raise HTTPException(status_code=404, detail="API key not found")

        logger.info(
            "Organization API key deleted",
            org_id=str(org_id),
            key_id=str(key_id),
            user_id=access.user_id,
        )

        return {"message": "API key deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting org API key: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete API key")
