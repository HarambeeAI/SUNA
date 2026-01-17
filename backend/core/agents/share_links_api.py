"""API endpoints for agent share links."""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from core.api_models import (
    ShareLinkCreateRequest,
    ShareLinkResponse,
    ShareLinksListResponse,
    PublicShareLinkResponse,
    PublicShareLinkErrorResponse,
    ShareLinkUpdateRequest,
    ShareLinkAgentInfo,
)
from core.agents import share_links_repo
from core.utils.auth_utils import get_current_user, get_optional_user
from core.utils.logger import logger

router = APIRouter(tags=["share-links"])


@router.post(
    "/agents/{agent_id}/share-links",
    response_model=ShareLinkResponse,
    summary="Create agent share link",
    operation_id="create_agent_share_link"
)
async def create_share_link(
    agent_id: str,
    request: ShareLinkCreateRequest,
    user_id: str = Depends(get_current_user)
):
    """Create a public share link for an agent.

    Only the agent creator can create share links.
    """
    from core.services.supabase import DBConnection

    db = DBConnection()
    client = await db.client

    # Get user's account ID
    account_result = await client.schema("basejump").from_("accounts").select("id").eq(
        "primary_owner_user_id", user_id
    ).limit(1).execute()

    if not account_result.data:
        raise HTTPException(status_code=404, detail="User account not found")

    account_id = account_result.data[0]["id"]

    # Verify agent ownership
    is_owner = await share_links_repo.verify_agent_ownership(agent_id, account_id)
    if not is_owner:
        raise HTTPException(
            status_code=403,
            detail="Only the agent creator can create share links"
        )

    # Create the share link
    settings = request.settings.model_dump() if request.settings else None
    share_link = await share_links_repo.create_share_link(
        agent_id=agent_id,
        account_id=account_id,
        expires_in_days=request.expires_in_days,
        settings=settings
    )

    if not share_link:
        raise HTTPException(status_code=500, detail="Failed to create share link")

    logger.info(f"Created share link {share_link['share_id']} for agent {agent_id}")

    return ShareLinkResponse(
        share_id=share_link["share_id"],
        agent_id=share_link["agent_id"],
        created_at=str(share_link["created_at"]),
        expires_at=str(share_link["expires_at"]) if share_link.get("expires_at") else None,
        is_active=share_link.get("is_active", True),
        views_count=share_link.get("views_count", 0),
        runs_count=share_link.get("runs_count", 0),
        last_viewed_at=str(share_link["last_viewed_at"]) if share_link.get("last_viewed_at") else None,
        last_run_at=str(share_link["last_run_at"]) if share_link.get("last_run_at") else None,
        settings=share_link.get("settings")
    )


@router.get(
    "/agents/{agent_id}/share-links",
    response_model=ShareLinksListResponse,
    summary="List agent share links",
    operation_id="list_agent_share_links"
)
async def list_share_links(
    agent_id: str,
    user_id: str = Depends(get_current_user)
):
    """List all share links for an agent.

    Only the agent creator can view share links.
    """
    from core.services.supabase import DBConnection

    db = DBConnection()
    client = await db.client

    # Get user's account ID
    account_result = await client.schema("basejump").from_("accounts").select("id").eq(
        "primary_owner_user_id", user_id
    ).limit(1).execute()

    if not account_result.data:
        raise HTTPException(status_code=404, detail="User account not found")

    account_id = account_result.data[0]["id"]

    # Verify agent ownership
    is_owner = await share_links_repo.verify_agent_ownership(agent_id, account_id)
    if not is_owner:
        raise HTTPException(
            status_code=403,
            detail="Only the agent creator can view share links"
        )

    # Get share links
    share_links = await share_links_repo.get_agent_share_links(agent_id, account_id)

    return ShareLinksListResponse(
        share_links=[
            ShareLinkResponse(
                share_id=sl["share_id"],
                agent_id=sl["agent_id"],
                created_at=str(sl["created_at"]),
                expires_at=str(sl["expires_at"]) if sl.get("expires_at") else None,
                is_active=sl.get("is_active", True),
                views_count=sl.get("views_count", 0),
                runs_count=sl.get("runs_count", 0),
                last_viewed_at=str(sl["last_viewed_at"]) if sl.get("last_viewed_at") else None,
                last_run_at=str(sl["last_run_at"]) if sl.get("last_run_at") else None,
                settings=sl.get("settings")
            )
            for sl in share_links
        ]
    )


@router.get(
    "/share/{share_id}",
    response_model=PublicShareLinkResponse,
    summary="Get public share link",
    operation_id="get_public_share_link"
)
async def get_public_share_link(
    share_id: str,
    user_id: Optional[str] = Depends(get_optional_user)
):
    """Get a public share link by its token.

    This endpoint is publicly accessible (no auth required).
    Returns agent info if the link is valid.
    """
    # Check if share link is valid
    validation = await share_links_repo.check_share_link_valid(share_id)

    if not validation["valid"]:
        raise HTTPException(
            status_code=404 if validation["code"] == "LINK_NOT_FOUND" else 410,
            detail={
                "error": validation["error"],
                "code": validation["code"]
            }
        )

    share_link = validation["share_link"]

    # Increment view count
    await share_links_repo.increment_view_count(share_id)

    return PublicShareLinkResponse(
        share_id=share_link["share_id"],
        agent=ShareLinkAgentInfo(
            agent_id=share_link["agent_id"],
            name=share_link["agent_name"],
            description=share_link.get("agent_description"),
            icon_name=share_link.get("icon_name"),
            icon_color=share_link.get("icon_color"),
            icon_background=share_link.get("icon_background")
        ),
        views_count=share_link.get("views_count", 0) + 1,
        settings=share_link.get("settings")
    )


@router.patch(
    "/share-links/{share_id}",
    response_model=ShareLinkResponse,
    summary="Update share link",
    operation_id="update_share_link"
)
async def update_share_link(
    share_id: str,
    request: ShareLinkUpdateRequest,
    user_id: str = Depends(get_current_user)
):
    """Update a share link.

    Only the share link creator can update it.
    """
    from core.services.supabase import DBConnection

    db = DBConnection()
    client = await db.client

    # Get user's account ID
    account_result = await client.schema("basejump").from_("accounts").select("id").eq(
        "primary_owner_user_id", user_id
    ).limit(1).execute()

    if not account_result.data:
        raise HTTPException(status_code=404, detail="User account not found")

    account_id = account_result.data[0]["id"]

    # Build updates dict
    updates = {}
    if request.is_active is not None:
        updates["is_active"] = request.is_active
    if request.settings is not None:
        updates["settings"] = request.settings.model_dump()

    if not updates:
        # Get and return current share link
        share_link = await share_links_repo.get_share_link_by_id(share_id)
        if not share_link:
            raise HTTPException(status_code=404, detail="Share link not found")
    else:
        # Update the share link
        share_link = await share_links_repo.update_share_link(
            share_id=share_id,
            account_id=account_id,
            updates=updates
        )

    if not share_link:
        raise HTTPException(
            status_code=404,
            detail="Share link not found or you don't have permission to update it"
        )

    return ShareLinkResponse(
        share_id=share_link["share_id"],
        agent_id=share_link["agent_id"],
        created_at=str(share_link["created_at"]),
        expires_at=str(share_link["expires_at"]) if share_link.get("expires_at") else None,
        is_active=share_link.get("is_active", True),
        views_count=share_link.get("views_count", 0),
        runs_count=share_link.get("runs_count", 0),
        last_viewed_at=str(share_link["last_viewed_at"]) if share_link.get("last_viewed_at") else None,
        last_run_at=str(share_link["last_run_at"]) if share_link.get("last_run_at") else None,
        settings=share_link.get("settings")
    )


@router.delete(
    "/share-links/{share_id}",
    summary="Delete share link",
    operation_id="delete_share_link"
)
async def delete_share_link(
    share_id: str,
    user_id: str = Depends(get_current_user)
):
    """Delete a share link permanently.

    Only the share link creator can delete it.
    """
    from core.services.supabase import DBConnection

    db = DBConnection()
    client = await db.client

    # Get user's account ID
    account_result = await client.schema("basejump").from_("accounts").select("id").eq(
        "primary_owner_user_id", user_id
    ).limit(1).execute()

    if not account_result.data:
        raise HTTPException(status_code=404, detail="User account not found")

    account_id = account_result.data[0]["id"]

    # Delete the share link
    deleted = await share_links_repo.delete_share_link(share_id, account_id)

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Share link not found or you don't have permission to delete it"
        )

    logger.info(f"Deleted share link {share_id}")

    return {"success": True, "message": "Share link deleted"}


@router.post(
    "/share-links/{share_id}/revoke",
    response_model=ShareLinkResponse,
    summary="Revoke share link",
    operation_id="revoke_share_link"
)
async def revoke_share_link(
    share_id: str,
    user_id: str = Depends(get_current_user)
):
    """Revoke (deactivate) a share link.

    The link remains in the database but is no longer usable.
    Only the share link creator can revoke it.
    """
    from core.services.supabase import DBConnection

    db = DBConnection()
    client = await db.client

    # Get user's account ID
    account_result = await client.schema("basejump").from_("accounts").select("id").eq(
        "primary_owner_user_id", user_id
    ).limit(1).execute()

    if not account_result.data:
        raise HTTPException(status_code=404, detail="User account not found")

    account_id = account_result.data[0]["id"]

    # Revoke the share link
    revoked = await share_links_repo.revoke_share_link(share_id, account_id)

    if not revoked:
        raise HTTPException(
            status_code=404,
            detail="Share link not found or you don't have permission to revoke it"
        )

    # Get updated share link
    share_link = await share_links_repo.get_share_link_by_id(share_id)

    logger.info(f"Revoked share link {share_id}")

    return ShareLinkResponse(
        share_id=share_link["share_id"],
        agent_id=share_link["agent_id"],
        created_at=str(share_link["created_at"]),
        expires_at=str(share_link["expires_at"]) if share_link.get("expires_at") else None,
        is_active=share_link.get("is_active", False),
        views_count=share_link.get("views_count", 0),
        runs_count=share_link.get("runs_count", 0),
        last_viewed_at=str(share_link["last_viewed_at"]) if share_link.get("last_viewed_at") else None,
        last_run_at=str(share_link["last_run_at"]) if share_link.get("last_run_at") else None,
        settings=share_link.get("settings")
    )
