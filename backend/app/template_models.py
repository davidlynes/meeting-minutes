"""
Pydantic models for the template API.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class TemplateSectionModel(BaseModel):
    """A single section within a meeting template."""
    title: str
    instruction: str
    format: str
    item_format: Optional[str] = None
    example_item_format: Optional[str] = None


class TemplateModel(BaseModel):
    """Full template document as stored in MongoDB."""
    template_id: str
    client_id: str = "default"
    name: str
    description: str
    sections: List[TemplateSectionModel]
    global_instruction: Optional[str] = None
    clinical_safety_rules: Optional[List[str]] = None
    version: int = 1
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TemplateListItem(BaseModel):
    """Lightweight template info for list responses."""
    template_id: str
    name: str
    description: str
    version: int
    updated_at: datetime


class TemplateSyncResponse(BaseModel):
    """Response for the sync endpoint consumed by the frontend."""
    templates: List[TemplateModel]
    sync_timestamp: datetime = Field(default_factory=datetime.utcnow)
