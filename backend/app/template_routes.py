"""
Template API router — serves templates from MongoDB with client override resolution.
"""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from template_models import TemplateModel, TemplateListItem, TemplateSyncResponse
from mongodb import get_templates_collection, check_mongo_connection

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/templates", tags=["templates"])


async def _ensure_indexes():
    """Create indexes if they don't already exist (idempotent)."""
    collection = get_templates_collection()
    await collection.create_index(
        [("template_id", 1), ("client_id", 1)], unique=True
    )
    await collection.create_index("client_id")
    await collection.create_index("updated_at")


def _doc_to_model(doc: dict) -> TemplateModel:
    """Convert a MongoDB document to a TemplateModel, dropping _id."""
    doc.pop("_id", None)
    return TemplateModel(**doc)


# ---------- Health ----------

@router.get("/health")
async def templates_health():
    """Check MongoDB connectivity for the template service."""
    connected = await check_mongo_connection()
    if not connected:
        raise HTTPException(status_code=503, detail="MongoDB is not reachable")
    return {"status": "ok"}


# ---------- List / Get ----------

@router.get("", response_model=TemplateSyncResponse)
async def list_templates(client_id: str = "default"):
    """List resolved templates (client overrides merged with defaults).

    Resolution logic:
    1. Fetch all default active templates
    2. Fetch all client-specific active templates
    3. Client templates override defaults by matching template_id
    """
    try:
        collection = get_templates_collection()

        # Fetch defaults
        default_cursor = collection.find({"client_id": "default", "is_active": True})
        defaults = {doc["template_id"]: doc async for doc in default_cursor}

        # Merge client overrides if a non-default client was requested
        if client_id != "default":
            client_cursor = collection.find({"client_id": client_id, "is_active": True})
            async for doc in client_cursor:
                defaults[doc["template_id"]] = doc  # override

        templates = [_doc_to_model(doc) for doc in defaults.values()]
        templates.sort(key=lambda t: t.name)

        logger.info(f"Returning {len(templates)} resolved templates for client_id={client_id}")
        return TemplateSyncResponse(templates=templates)

    except Exception as e:
        logger.error(f"Failed to list templates: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Template service unavailable: {e}")


@router.get("/{template_id}", response_model=TemplateModel)
async def get_template(template_id: str, client_id: str = "default"):
    """Get a single resolved template (client override takes precedence)."""
    try:
        collection = get_templates_collection()

        # Try client-specific first
        if client_id != "default":
            doc = await collection.find_one(
                {"template_id": template_id, "client_id": client_id, "is_active": True}
            )
            if doc:
                return _doc_to_model(doc)

        # Fall back to default
        doc = await collection.find_one(
            {"template_id": template_id, "client_id": "default", "is_active": True}
        )
        if doc:
            return _doc_to_model(doc)

        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get template {template_id}: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Template service unavailable: {e}")


# ---------- Create / Update (future admin use) ----------

@router.post("", response_model=TemplateModel, status_code=201)
async def create_template(template: TemplateModel):
    """Create a new template."""
    try:
        collection = get_templates_collection()
        await _ensure_indexes()

        doc = template.model_dump()
        doc["created_at"] = datetime.utcnow()
        doc["updated_at"] = datetime.utcnow()

        await collection.insert_one(doc)
        logger.info(f"Created template '{template.template_id}' for client '{template.client_id}'")
        return template

    except Exception as e:
        if "duplicate key" in str(e).lower():
            raise HTTPException(
                status_code=409,
                detail=f"Template '{template.template_id}' already exists for client '{template.client_id}'"
            )
        logger.error(f"Failed to create template: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Template service unavailable: {e}")


@router.put("/{template_id}", response_model=TemplateModel)
async def update_template(template_id: str, template: TemplateModel):
    """Update an existing template."""
    try:
        collection = get_templates_collection()

        update_data = template.model_dump()
        update_data["updated_at"] = datetime.utcnow()
        update_data.pop("created_at", None)

        result = await collection.find_one_and_update(
            {"template_id": template_id, "client_id": template.client_id},
            {"$set": update_data},
            return_document=True,
        )

        if result is None:
            raise HTTPException(
                status_code=404,
                detail=f"Template '{template_id}' not found for client '{template.client_id}'"
            )

        logger.info(f"Updated template '{template_id}' for client '{template.client_id}'")
        return _doc_to_model(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update template {template_id}: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Template service unavailable: {e}")
