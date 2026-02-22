#!/usr/bin/env python3
"""
Seed script — loads template JSON files into MongoDB as default templates.

Safe to re-run: uses upsert based on (template_id, client_id).

Usage:
    python scripts/seed_templates.py

Requires:
    - MongoDB running (default: mongodb://localhost:27017)
    - motor package installed
    - Template JSON files in frontend/src-tauri/templates/
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Allow imports from backend/app/
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "backend" / "app"))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load env from backend/.env
load_dotenv(PROJECT_ROOT / "backend" / ".env")

TEMPLATES_DIR = PROJECT_ROOT / "frontend" / "src-tauri" / "templates"
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "iqcapture")


async def seed():
    print(f"Connecting to MongoDB at {MONGODB_URI}...")
    client = AsyncIOMotorClient(MONGODB_URI, serverSelectionTimeoutMS=5000)

    # Verify connection
    await client.admin.command("ping")
    print("Connected to MongoDB.")

    db = client[MONGODB_DATABASE]
    collection = db["templates"]

    # Create compound unique index
    await collection.create_index(
        [("template_id", 1), ("client_id", 1)], unique=True
    )
    await collection.create_index("client_id")
    await collection.create_index("updated_at")
    print("Indexes ensured.")

    # Read and upsert each template file
    template_files = sorted(TEMPLATES_DIR.glob("*.json"))
    if not template_files:
        print(f"No template JSON files found in {TEMPLATES_DIR}")
        sys.exit(1)

    for template_file in template_files:
        template_id = template_file.stem
        with open(template_file) as f:
            data = json.load(f)

        doc = {
            "template_id": template_id,
            "client_id": "default",
            "name": data["name"],
            "description": data["description"],
            "sections": data["sections"],
            "global_instruction": data.get("global_instruction"),
            "clinical_safety_rules": data.get("clinical_safety_rules"),
            "version": 1,
            "is_active": True,
            "updated_at": datetime.utcnow(),
        }

        result = await collection.update_one(
            {"template_id": template_id, "client_id": "default"},
            {"$set": doc, "$setOnInsert": {"created_at": datetime.utcnow()}},
            upsert=True,
        )

        action = "inserted" if result.upserted_id else "updated"
        print(f"  {action}: {template_id} ({data['name']})")

    count = await collection.count_documents({})
    print(f"\nDone. {len(template_files)} templates processed. Collection now has {count} documents.")

    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
