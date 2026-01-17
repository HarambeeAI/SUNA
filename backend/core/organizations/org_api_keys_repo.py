"""
Organization API Keys Repository

Database operations for organization-level API key management.
"""

import secrets
import string
import hmac
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from uuid import UUID

from core.utils.logger import logger
from core.utils.config import config
from core.services.db import execute_one, execute_all


def _generate_org_key_pair() -> tuple[str, str]:
    """
    Generate a public key and secret key pair for organization API keys.

    Returns:
        tuple: (public_key, secret_key) where public_key starts with 'opk_'
               and secret_key starts with 'osk_'
    """
    pk_suffix = "".join(
        secrets.choice(string.ascii_letters + string.digits) for _ in range(32)
    )
    sk_suffix = "".join(
        secrets.choice(string.ascii_letters + string.digits) for _ in range(32)
    )

    public_key = f"opk_{pk_suffix}"
    secret_key = f"osk_{sk_suffix}"

    return public_key, secret_key


def _hash_secret_key(secret_key: str) -> str:
    """
    Hash a secret key using HMAC-SHA256.

    Args:
        secret_key: The secret key to hash

    Returns:
        str: The HMAC-SHA256 hash of the secret key
    """
    secret = config.API_KEY_SECRET.encode("utf-8")
    return hmac.new(secret, secret_key.encode("utf-8"), hashlib.sha256).hexdigest()


def _verify_secret_key(secret_key: str, hashed_key: str) -> bool:
    """
    Verify a secret key against its hash using constant-time comparison.

    Args:
        secret_key: The secret key to verify
        hashed_key: The stored hash

    Returns:
        bool: True if the secret key matches the hash
    """
    try:
        expected_hash = _hash_secret_key(secret_key)
        return hmac.compare_digest(expected_hash, hashed_key)
    except Exception:
        return False


async def create_org_api_key(
    org_id: str,
    user_id: str,
    name: str,
    scopes: List[str],
    description: Optional[str] = None,
    expires_in_days: Optional[int] = None
) -> dict:
    """
    Create a new organization API key.

    Args:
        org_id: The organization ID
        user_id: The user creating the key
        name: Human-readable name for the key
        scopes: List of scopes (e.g., ['read:agents', 'write:agents'])
        description: Optional description
        expires_in_days: Optional number of days until expiration

    Returns:
        dict: The created API key including the secret (only returned once!)
    """
    # Generate key pair
    public_key, secret_key = _generate_org_key_pair()
    secret_key_hash = _hash_secret_key(secret_key)

    # Calculate expiration
    expires_at = None
    if expires_in_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

    # Convert scopes list to PostgreSQL array format
    scopes_array = "{" + ",".join(scopes) + "}"

    sql = """
    INSERT INTO org_api_keys (
        org_id,
        name,
        public_key,
        secret_key_hash,
        scopes,
        description,
        expires_at,
        created_by
    ) VALUES (
        :org_id,
        :name,
        :public_key,
        :secret_key_hash,
        :scopes::org_api_key_scope[],
        :description,
        :expires_at,
        :user_id
    )
    RETURNING *
    """

    result = await execute_one(
        sql,
        {
            "org_id": org_id,
            "name": name,
            "public_key": public_key,
            "secret_key_hash": secret_key_hash,
            "scopes": scopes_array,
            "description": description,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "user_id": user_id
        },
        commit=True
    )

    if not result:
        raise Exception("Failed to create organization API key")

    # Return result with secret key (only returned once)
    return {
        **result,
        "secret_key": secret_key
    }


async def get_org_api_key_by_id(key_id: str) -> Optional[dict]:
    """Get an organization API key by its ID."""
    sql = """
    SELECT
        key_id,
        org_id,
        name,
        public_key,
        scopes,
        description,
        status,
        expires_at,
        last_used_at,
        created_by,
        created_at,
        updated_at
    FROM org_api_keys
    WHERE key_id = :key_id
    """
    return await execute_one(sql, {"key_id": key_id})


async def get_org_api_key_by_public_key(public_key: str) -> Optional[dict]:
    """
    Get an organization API key by its public key.
    Returns the full key data including hash for validation.
    """
    sql = """
    SELECT
        key_id,
        org_id,
        name,
        public_key,
        secret_key_hash,
        scopes,
        description,
        status,
        expires_at,
        last_used_at,
        created_by,
        created_at
    FROM org_api_keys
    WHERE public_key = :public_key
    """
    return await execute_one(sql, {"public_key": public_key})


async def list_org_api_keys(org_id: str) -> List[dict]:
    """
    List all API keys for an organization.

    Args:
        org_id: The organization ID

    Returns:
        List of API key records (without secret hashes)
    """
    sql = """
    SELECT
        key_id,
        org_id,
        name,
        public_key,
        scopes,
        description,
        status,
        expires_at,
        last_used_at,
        created_by,
        created_at,
        updated_at
    FROM org_api_keys
    WHERE org_id = :org_id
    ORDER BY created_at DESC
    """
    return await execute_all(sql, {"org_id": org_id})


async def update_org_api_key(
    key_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None
) -> Optional[dict]:
    """
    Update an organization API key.

    Args:
        key_id: The key ID to update
        name: New name (optional)
        description: New description (optional)

    Returns:
        Updated key record or None if not found
    """
    updates = []
    params = {"key_id": key_id}

    if name is not None:
        updates.append("name = :name")
        params["name"] = name

    if description is not None:
        updates.append("description = :description")
        params["description"] = description

    if not updates:
        return await get_org_api_key_by_id(key_id)

    updates.append("updated_at = NOW()")

    sql = f"""
    UPDATE org_api_keys
    SET {", ".join(updates)}
    WHERE key_id = :key_id
    RETURNING *
    """

    return await execute_one(sql, params, commit=True)


async def revoke_org_api_key(key_id: str) -> bool:
    """
    Revoke an organization API key.

    Args:
        key_id: The key ID to revoke

    Returns:
        True if successful, False if key not found
    """
    sql = """
    UPDATE org_api_keys
    SET status = 'revoked', updated_at = NOW()
    WHERE key_id = :key_id
    RETURNING key_id
    """
    result = await execute_one(sql, {"key_id": key_id}, commit=True)
    return result is not None


async def delete_org_api_key(key_id: str) -> bool:
    """
    Permanently delete an organization API key.

    Args:
        key_id: The key ID to delete

    Returns:
        True if successful, False if key not found
    """
    sql = """
    DELETE FROM org_api_keys
    WHERE key_id = :key_id
    RETURNING key_id
    """
    result = await execute_one(sql, {"key_id": key_id}, commit=True)
    return result is not None


async def update_last_used(key_id: str) -> None:
    """Update the last_used_at timestamp for an API key."""
    sql = """
    UPDATE org_api_keys
    SET last_used_at = NOW()
    WHERE key_id = :key_id
    """
    await execute_one(sql, {"key_id": key_id}, commit=True)


async def validate_org_api_key(
    public_key: str,
    secret_key: str
) -> dict:
    """
    Validate an organization API key pair.

    Args:
        public_key: The public key (starts with 'opk_')
        secret_key: The secret key (starts with 'osk_')

    Returns:
        dict with validation result:
            - is_valid: bool
            - org_id: Optional[str]
            - key_id: Optional[str]
            - scopes: Optional[List[str]]
            - error_message: Optional[str]
    """
    # Validate key format
    if not public_key.startswith("opk_") or not secret_key.startswith("osk_"):
        return {
            "is_valid": False,
            "error_message": "Invalid organization API key format"
        }

    # Look up the key
    key_data = await get_org_api_key_by_public_key(public_key)

    if not key_data:
        return {
            "is_valid": False,
            "error_message": "Organization API key not found"
        }

    # Check if expired
    if key_data.get("expires_at"):
        expires_at = key_data["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if expires_at < datetime.now(timezone.utc):
            return {
                "is_valid": False,
                "error_message": "Organization API key expired"
            }

    # Check status
    if key_data.get("status") != "active":
        return {
            "is_valid": False,
            "error_message": f"Organization API key is {key_data.get('status')}"
        }

    # Verify secret key
    if not _verify_secret_key(secret_key, key_data.get("secret_key_hash", "")):
        return {
            "is_valid": False,
            "error_message": "Invalid secret key"
        }

    # Success
    return {
        "is_valid": True,
        "org_id": str(key_data["org_id"]),
        "key_id": str(key_data["key_id"]),
        "scopes": key_data.get("scopes", [])
    }


async def get_key_org_id(key_id: str) -> Optional[str]:
    """Get the organization ID for a given API key."""
    sql = """
    SELECT org_id FROM org_api_keys WHERE key_id = :key_id
    """
    result = await execute_one(sql, {"key_id": key_id})
    return str(result["org_id"]) if result else None


def has_scope(scopes: List[str], required_scope: str) -> bool:
    """
    Check if the given scopes list includes the required scope.

    Args:
        scopes: List of scopes the key has
        required_scope: The scope required for the operation

    Returns:
        True if the required scope is present
    """
    return required_scope in scopes
