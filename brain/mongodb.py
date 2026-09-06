"""
MongoDB asynchronous connection manager using PyMongo's Asynchronous API.
"""

import logging
import re
import asyncio
from typing import Optional, Dict, Any, Tuple
from bson import ObjectId
from django.conf import settings
from pymongo import AsyncMongoClient
from pymongo.uri_parser import parse_uri
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure

logger = logging.getLogger(__name__)


def sanitize_mongo_uri(raw_uri: str) -> Tuple[str, Optional[str]]:
    """
    Sanitize and normalize MongoDB connection string.
    Handles typos like `?appName=production/secondbrain?authSource=admin`
    and returns a clean, valid URI and detected database name.
    """
    if not raw_uri:
        return raw_uri, None

    cleaned = raw_uri.strip()

    # Try parsing as-is first
    try:
        parsed = parse_uri(cleaned)
        return cleaned, parsed.get('database')
    except Exception:
        pass

    # Pattern for mongodb(+srv)://<credentials>@<host>/<optional_path>?<query>
    match = re.match(r'^(mongodb(?:\+srv)?://[^/?]+)/?([^?]*)\?(.*)$', cleaned)
    if match:
        base, path, query = match.groups()
        query_fixed = query.replace('?', '&')
        db_name = path.strip('/') if path else None

        if not db_name and '/' in query_fixed:
            parts = query_fixed.split('/', 1)
            first_opt = parts[0]
            rest = parts[1]
            if '&' in rest:
                db_candidate, rest_opts = rest.split('&', 1)
                all_opts = f"{first_opt}&{rest_opts}"
            else:
                db_candidate = rest
                all_opts = first_opt
            db_name = db_candidate
            valid_opts = [o for o in all_opts.split('&') if '=' in o]
            new_uri = f"{base}/{db_name}?" + '&'.join(valid_opts) if valid_opts else f"{base}/{db_name}"
            try:
                parse_uri(new_uri)
                return new_uri, db_name
            except Exception as e:
                logger.warning(f"URI parser fallback note: {e}")
                return new_uri, db_name

    return cleaned, None


class MongoDBManager:
    """
    Singleton Async MongoDB Manager utilizing PyMongo's modern Asynchronous API.
    Provides automatic fallback to in-memory async mock client if no MongoDB
    daemon is currently reachable at MONGO_URI, ensuring zero downtime in demo/test environments.
    """
    _instance: Optional['MongoDBManager'] = None
    _client = None
    _db = None
    _is_mock: bool = False
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(MongoDBManager, cls).__new__(cls)
        return cls._instance

    async def get_db(self):
        """Returns the async database instance, connecting if not already connected."""
        if self._db is not None:
            return self._db

        raw_mongo_uri = getattr(settings, 'MONGO_URI', 'mongodb://localhost:27017')
        default_db_name = getattr(settings, 'MONGO_DB_NAME', 'secondbrain')

        mongo_uri, parsed_db = sanitize_mongo_uri(raw_mongo_uri)
        db_name = parsed_db or default_db_name or 'secondbrain'

        try:
            logger.info(f"Connecting to MongoDB at {mongo_uri[:30]}... via PyMongo AsyncMongoClient...")
            # Official PyMongo 4.9+ Asynchronous Client
            client = AsyncMongoClient(
                mongo_uri,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000
            )
            # Verify connectivity via async ping
            await client.admin.command('ping')
            self._client = client
            self._db = client[db_name]
            self._is_mock = False
            logger.info(f"PyMongo AsyncMongoClient successfully connected to '{db_name}'.")
        except (ServerSelectionTimeoutError, ConnectionFailure, Exception) as err:
            logger.warning(
                f"Could not connect to external MongoDB ({err}). "
                f"Falling back to Async Mongo engine for reliable local operation."
            )
            try:
                from mongomock_motor import AsyncMongoMockClient
                self._client = AsyncMongoMockClient()
                self._db = self._client[db_name]
                self._is_mock = True
                logger.info(f"Initialized Async In-Memory MongoDB Engine for '{db_name}'.")
            except Exception as mock_err:
                logger.error(f"Error initializing fallback async client: {mock_err}")
                raise

        # Ensure db.content references db.contents for seamless compatibility
        if not hasattr(self._db, 'content'):
            setattr(self._db, 'content', self._db['contents'])

        if not self._initialized:
            await self._init_indexes_and_seed()
            self._initialized = True

        return self._db

    async def _init_indexes_and_seed(self):
        """Initialize database indexes and seed sample curated knowledge if empty."""
        try:
            db = self._db
            # Create indexes on users
            await db.users.create_index("username", unique=True)

            # Drop accidental password_1 unique index if it exists from legacy schemas
            user_idx = await db.users.index_information()
            if "password_1" in user_idx:
                try:
                    await db.users.drop_index("password_1")
                except Exception:
                    pass

            # Create indexes on contents (both user_id and userId for full Mongoose compatibility)
            await db.contents.create_index([("user_id", 1), ("type", 1)])
            await db.contents.create_index([("userId", 1), ("type", 1)])
            await db.contents.create_index([("user_id", 1), ("folder_id", 1)])
            await db.contents.create_index("link", unique=True, sparse=True)

            # Folders & links indexes
            await db.folders.create_index([("user_id", 1), ("name", 1)])
            await db.links.create_index("hash", unique=True)
            await db.tags.create_index([("user_id", 1), ("title", 1)])

            # Seed demo curator user & items if demo user does not exist
            demo_user = await db.users.find_one({"username": "notion_curator"})
            if not demo_user:
                await self._seed_data(db)
        except Exception as e:
            logger.warning(f"Index creation or seeding notice: {e}")

    async def _seed_data(self, db):
        """Seed demo user, folders, and curated second brain entries."""
        import bcrypt
        hashed_pwd = bcrypt.hashpw(b'demo123', bcrypt.gensalt()).decode('utf-8')

        demo_user_id = ObjectId()
        await db.users.insert_one({
            "_id": demo_user_id,
            "username": "notion_curator",
            "email": "curator@secondbrain.dev",
            "password": hashed_pwd,
            "created_at": "2026-09-01T10:00:00Z"
        })

        f_ai = ObjectId()
        f_python = ObjectId()
        f_readings = ObjectId()

        await db.folders.insert_many([
            {
                "_id": f_ai,
                "user_id": demo_user_id,
                "userId": demo_user_id,
                "name": "Artificial Intelligence",
                "color": "#8b5cf6",
                "created_at": "2026-09-01T10:05:00Z"
            },
            {
                "_id": f_python,
                "user_id": demo_user_id,
                "userId": demo_user_id,
                "name": "Django & Async Python",
                "color": "#10b981",
                "created_at": "2026-09-01T10:06:00Z"
            },
            {
                "_id": f_readings,
                "user_id": demo_user_id,
                "userId": demo_user_id,
                "name": "Deep Work & Architecture",
                "color": "#f59e0b",
                "created_at": "2026-09-01T10:07:00Z"
            }
        ])

        await db.contents.insert_many([
            {
                "_id": ObjectId(),
                "user_id": demo_user_id,
                "userId": demo_user_id,
                "title": "Building Production Web Apps with Django & Async PyMongo",
                "link": "https://docs.djangoproject.com/en/5.2/topics/async/",
                "type": "article",
                "tags": ["django", "python", "async", "mongodb"],
                "notes": "Key takeaway: Django async views enable non-blocking database queries with PyMongo's AsyncMongoClient for ultra-high throughput.",
                "folder_id": str(f_python),
                "created_at": "2026-09-02T12:00:00Z"
            },
            {
                "_id": ObjectId(),
                "user_id": demo_user_id,
                "userId": demo_user_id,
                "title": "Lex Fridman Podcast #400: Architecture of Modern Neural Networks",
                "link": "https://www.youtube.com/watch?v=L_Guz73e6fw",
                "type": "youtube",
                "tags": ["ai", "neural-nets", "podcast"],
                "notes": "Excellent discussion on attention mechanisms, inference latency optimizations, and multimodality.",
                "folder_id": str(f_ai),
                "created_at": "2026-09-03T09:15:00Z"
            },
            {
                "_id": ObjectId(),
                "user_id": demo_user_id,
                "userId": demo_user_id,
                "title": "Andrej Karpathy on Software 2.0 & LLM OS Concept",
                "link": "https://twitter.com/karpathy/status/1707437820049961147",
                "type": "twitter",
                "tags": ["karpathy", "llm", "ai", "architecture"],
                "notes": "Operating system analogy: LLMs as CPUs, memory context windows as RAM, disk/tools as peripheral I/O.",
                "folder_id": str(f_ai),
                "created_at": "2026-09-04T15:30:00Z"
            },
            {
                "_id": ObjectId(),
                "user_id": demo_user_id,
                "userId": demo_user_id,
                "title": "Tiago Forte: Building a Second Brain Methodology",
                "link": "https://fortelabs.com/blog/basb/",
                "type": "document",
                "tags": ["productivity", "p-a-r-a", "notes"],
                "notes": "The CODE framework: Capture, Organize, Distill, Express. Organize by actionability rather than topical category.",
                "folder_id": str(f_readings),
                "created_at": "2026-09-05T08:00:00Z"
            }
        ])

        # Seed initial share link
        await db.links.insert_one({
            "_id": ObjectId(),
            "user_id": demo_user_id,
            "userId": demo_user_id,
            "hash": "curator-vault",
            "created_at": "2026-09-05T08:30:00Z"
        })

    def is_mock_mode(self) -> bool:
        return self._is_mock


# Global singleton
mongo_manager = MongoDBManager()

async def get_database():
    """Helper to retrieve the active async database"""
    return await mongo_manager.get_db()
