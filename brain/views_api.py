"""
Asynchronous REST API views for Second Brain using PyMongo's AsyncMongoClient API.
"""

import json
import uuid
from typing import Dict, Any
from bson import ObjectId
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from brain.mongodb import get_database, mongo_manager
from brain.models_mongo import serialize_doc, serialize_list, current_iso_time
from brain.auth_mongo import (
    hash_password,
    verify_password,
    generate_jwt_token,
    authenticate_request
)

def parse_json_body(request) -> Dict[str, Any]:
    """Helper to safely parse incoming JSON payloads."""
    try:
        if not request.body:
            return {}
        return json.loads(request.body.decode('utf-8'))
    except Exception:
        return {}

def json_error(message: str, status: int = 400):
    return JsonResponse({"error": message, "status": "error"}, status=status)

def json_success(data: Any, status: int = 200):
    return JsonResponse({"data": data, "status": "success"}, status=status)


# -------------------------------------------------------------
# AUTHENTICATION ENDPOINTS
# -------------------------------------------------------------

@csrf_exempt
async def api_signup(request):
    """POST /api/v1/auth/signup - Register new user"""
    if request.method != 'POST':
        return json_error("Method not allowed", 405)

    data = parse_json_body(request)
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    email = data.get('email', '').strip()

    if not username or not password:
        return json_error("Username and password are required")

    db = await get_database()
    existing = await db.users.find_one({"username": username})
    if existing:
        return json_error("Username already registered", 409)

    hashed_pwd = hash_password(password)
    user_doc = {
        "_id": ObjectId(),
        "username": username,
        "email": email or f"{username}@secondbrain.dev",
        "password": hashed_pwd,
        "created_at": current_iso_time()
    }
    await db.users.insert_one(user_doc)

    token = generate_jwt_token(str(user_doc["_id"]), username)
    user_resp = serialize_doc(user_doc)
    user_resp.pop("password", None)

    response = JsonResponse({
        "status": "success",
        "message": "User registered successfully",
        "token": token,
        "user": user_resp
    }, status=201)
    response.set_cookie('access_token', token, httponly=True, samesite='Lax', max_age=86400 * 3)
    return response


@csrf_exempt
async def api_signin(request):
    """POST /api/v1/auth/signin - Authenticate user & issue JWT"""
    if request.method != 'POST':
        return json_error("Method not allowed", 405)

    data = parse_json_body(request)
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if not username or not password:
        return json_error("Username and password are required")

    db = await get_database()
    user = await db.users.find_one({"username": username})
    if not user or not verify_password(password, user.get("password", "")):
        return json_error("Invalid credentials", 401)

    token = generate_jwt_token(str(user["_id"]), user["username"])
    user_resp = serialize_doc(user)
    user_resp.pop("password", None)

    response = JsonResponse({
        "status": "success",
        "message": "Authenticated successfully",
        "token": token,
        "user": user_resp
    })
    response.set_cookie('access_token', token, httponly=True, samesite='Lax', max_age=86400 * 3)
    return response


async def api_me(request):
    """GET /api/v1/auth/me - Retrieve current user profile"""
    user, err = await authenticate_request(request)
    if err:
        return json_error(err, 401)

    user_resp = serialize_doc(user)
    user_resp.pop("password", None)
    return json_success(user_resp)


# -------------------------------------------------------------
# CONTENT / KNOWLEDGE MANAGEMENT ENDPOINTS
# -------------------------------------------------------------

@csrf_exempt
async def api_content_list(request):
    """
    GET /api/v1/content - Query contents with folder, type, tag, search filters
    POST /api/v1/content - Create new knowledge item
    """
    user, err = await authenticate_request(request)
    if err:
        return json_error(err, 401)

    db = await get_database()
    user_id = user["_id"]

    if request.method == 'GET':
        query = {"$or": [{"user_id": user_id}, {"userId": user_id}]}

        # Filter by folder
        folder_id = request.GET.get('folder_id')
        if folder_id:
            query["folder_id"] = folder_id

        # Filter by content type
        content_type = request.GET.get('type')
        if content_type:
            query["type"] = content_type

        # Filter by tag
        tag = request.GET.get('tag')
        if tag:
            query["tags"] = {"$in": [tag]}

        # Search query across title, link, notes
        search_q = request.GET.get('q', '').strip()
        if search_q:
            regex_pattern = {"$regex": search_q, "$options": "i"}
            user_filter = {"$or": [{"user_id": user_id}, {"userId": user_id}]}
            search_filter = {"$or": [
                {"title": regex_pattern},
                {"link": regex_pattern},
                {"notes": regex_pattern},
                {"tags": regex_pattern}
            ]}
            query = {"$and": [user_filter, search_filter]}
            if folder_id:
                query["$and"].append({"folder_id": folder_id})
            if content_type:
                query["$and"].append({"type": content_type})
            if tag:
                query["$and"].append({"tags": {"$in": [tag]}})

        # PyMongo Asynchronous cursor query
        cursor = db.contents.find(query).sort("created_at", -1)
        items = []
        async for doc in cursor:
            items.append(serialize_doc(doc))

        return json_success(items)

    elif request.method == 'POST':
        data = parse_json_body(request)
        title = data.get('title', '').strip()
        link = data.get('link', '').strip()
        c_type = data.get('type', 'article').strip().lower()
        tags = data.get('tags', [])
        notes = data.get('notes', '').strip()
        folder_id = data.get('folder_id') or None

        if not title:
            return json_error("Title is required")

        if isinstance(tags, str):
            tags = [t.strip().lower() for t in tags.split(',') if t.strip()]
        else:
            tags = [str(t).strip().lower() for t in tags if str(t).strip()]

        content_doc = {
            "_id": ObjectId(),
            "user_id": user_id,
            "userId": user_id,
            "title": title,
            "link": link or "",
            "type": c_type,
            "tags": tags,
            "notes": notes,
            "folder_id": folder_id,
            "created_at": current_iso_time(),
            "updated_at": current_iso_time()
        }

        # Async PyMongo insertion
        try:
            await db.contents.insert_one(content_doc)
        except Exception as insert_err:
            if "duplicate key" in str(insert_err).lower() and "link" in str(insert_err).lower():
                return json_error("An item with this link already exists in your vault", 409)
            return json_error(f"Error saving content: {str(insert_err)}", 500)

        return json_success(serialize_doc(content_doc), 201)

    return json_error("Method not allowed", 405)


@csrf_exempt
async def api_content_detail(request, item_id: str):
    """
    GET /api/v1/content/<id> - Fetch single content
    PUT /api/v1/content/<id> - Update content
    DELETE /api/v1/content/<id> - Remove content
    """
    user, err = await authenticate_request(request)
    if err:
        return json_error(err, 401)

    try:
        oid = ObjectId(item_id)
    except Exception:
        return json_error("Invalid ObjectId format", 400)

    db = await get_database()
    user_id = user["_id"]
    user_filter = {"$or": [{"user_id": user_id}, {"userId": user_id}]}

    if request.method == 'GET':
        doc = await db.contents.find_one({"_id": oid, "$or": [{"user_id": user_id}, {"userId": user_id}]})
        if not doc:
            return json_error("Item not found", 404)
        return json_success(serialize_doc(doc))

    elif request.method in ('PUT', 'PATCH'):
        data = parse_json_body(request)
        update_fields = {}
        if 'title' in data:
            update_fields['title'] = str(data['title']).strip()
        if 'link' in data:
            update_fields['link'] = str(data['link']).strip()
        if 'type' in data:
            update_fields['type'] = str(data['type']).strip().lower()
        if 'notes' in data:
            update_fields['notes'] = str(data['notes']).strip()
        if 'folder_id' in data:
            update_fields['folder_id'] = data['folder_id'] or None
        if 'tags' in data:
            tags = data['tags']
            if isinstance(tags, str):
                update_fields['tags'] = [t.strip().lower() for t in tags.split(',') if t.strip()]
            else:
                update_fields['tags'] = [str(t).strip().lower() for t in tags if str(t).strip()]

        update_fields['updated_at'] = current_iso_time()

        res = await db.contents.update_one(
            {"_id": oid, "$or": [{"user_id": user_id}, {"userId": user_id}]},
            {"$set": update_fields}
        )
        if res.matched_count == 0:
            return json_error("Item not found or unauthorized", 404)

        updated_doc = await db.contents.find_one({"_id": oid})
        return json_success(serialize_doc(updated_doc))

    elif request.method == 'DELETE':
        res = await db.contents.delete_one({"_id": oid, "$or": [{"user_id": user_id}, {"userId": user_id}]})
        if res.deleted_count == 0:
            return json_error("Item not found or unauthorized", 404)
        return json_success({"message": "Item deleted successfully", "id": item_id})

    return json_error("Method not allowed", 405)


# -------------------------------------------------------------
# FOLDER MANAGEMENT ENDPOINTS
# -------------------------------------------------------------

@csrf_exempt
async def api_folders(request):
    """
    GET /api/v1/folders - List user folders with count of items
    POST /api/v1/folders - Create new folder
    """
    user, err = await authenticate_request(request)
    if err:
        return json_error(err, 401)

    db = await get_database()
    user_id = user["_id"]

    if request.method == 'GET':
        cursor = db.folders.find({"$or": [{"user_id": user_id}, {"userId": user_id}]}).sort("name", 1)
        folders = []
        async for doc in cursor:
            s_doc = serialize_doc(doc)
            # Count items in folder
            count = await db.contents.count_documents({
                "$or": [{"user_id": user_id}, {"userId": user_id}],
                "folder_id": str(doc["_id"])
            })
            s_doc["item_count"] = count
            folders.append(s_doc)
        return json_success(folders)

    elif request.method == 'POST':
        data = parse_json_body(request)
        name = data.get('name', '').strip()
        color = data.get('color', '#3b82f6').strip()

        if not name:
            return json_error("Folder name is required")

        folder_doc = {
            "_id": ObjectId(),
            "user_id": user_id,
            "userId": user_id,
            "name": name,
            "color": color,
            "created_at": current_iso_time()
        }
        await db.folders.insert_one(folder_doc)
        s_folder = serialize_doc(folder_doc)
        s_folder["item_count"] = 0
        return json_success(s_folder, 201)

    return json_error("Method not allowed", 405)


@csrf_exempt
async def api_folder_delete(request, folder_id: str):
    """DELETE /api/v1/folders/<id> - Delete folder and unassign items"""
    if request.method != 'DELETE':
        return json_error("Method not allowed", 405)

    user, err = await authenticate_request(request)
    if err:
        return json_error(err, 401)

    try:
        oid = ObjectId(folder_id)
    except Exception:
        return json_error("Invalid folder ID", 400)

    db = await get_database()
    user_id = user["_id"]

    res = await db.folders.delete_one({"_id": oid, "$or": [{"user_id": user_id}, {"userId": user_id}]})
    if res.deleted_count == 0:
        return json_error("Folder not found", 404)

    # Unassign items from deleted folder
    await db.contents.update_many(
        {"$or": [{"user_id": user_id}, {"userId": user_id}], "folder_id": folder_id},
        {"$set": {"folder_id": None}}
    )

    return json_success({"message": "Folder deleted", "id": folder_id})


# -------------------------------------------------------------
# TAGS & SHARING ENDPOINTS
# -------------------------------------------------------------

async def api_tags(request):
    """GET /api/v1/tags - Aggregated unique tags for current user"""
    user, err = await authenticate_request(request)
    if err:
        return json_error(err, 401)

    db = await get_database()
    user_id = user["_id"]

    # PyMongo distinct aggregation
    cursor = db.contents.find({"$or": [{"user_id": user_id}, {"userId": user_id}]}, {"tags": 1})
    tags_set = set()
    async for doc in cursor:
        for t in doc.get("tags", []):
            if t:
                tags_set.add(t)

    return json_success(sorted(list(tags_set)))


@csrf_exempt
async def api_share_brain(request):
    """
    POST /api/v1/brain/share - Toggle or generate sharable public hash
    GET /api/v1/brain/share - Get current share status
    """
    user, err = await authenticate_request(request)
    if err:
        return json_error(err, 401)

    db = await get_database()
    user_id = user["_id"]

    if request.method == 'GET':
        existing = await db.links.find_one({"$or": [{"user_id": user_id}, {"userId": user_id}]})
        if existing:
            return json_success({
                "shared": True,
                "hash": existing["hash"],
                "url": f"/share/{existing['hash']}"
            })
        return json_success({"shared": False, "hash": None})

    elif request.method == 'POST':
        data = parse_json_body(request)
        share_action = data.get('share', True)

        existing = await db.links.find_one({"$or": [{"user_id": user_id}, {"userId": user_id}]})
        if share_action:
            if existing:
                hash_val = existing["hash"]
            else:
                hash_val = uuid.uuid4().hex[:12]
                await db.links.insert_one({
                    "_id": ObjectId(),
                    "user_id": user_id,
                    "userId": user_id,
                    "hash": hash_val,
                    "created_at": current_iso_time()
                })
            return json_success({
                "shared": True,
                "hash": hash_val,
                "url": f"/share/{hash_val}"
            })
        else:
            if existing:
                await db.links.delete_one({"$or": [{"user_id": user_id}, {"userId": user_id}]})
            return json_success({"shared": False, "hash": None})

    return json_error("Method not allowed", 405)


async def api_public_share_data(request, share_hash: str):
    """GET /api/v1/brain/public/<hash> - Retrieve public brain data without auth"""
    db = await get_database()
    link_doc = await db.links.find_one({"hash": share_hash})
    if not link_doc:
        return json_error("Shared brain not found or link has expired", 404)

    curator_user_id = link_doc.get("user_id") or link_doc.get("userId")
    user = await db.users.find_one({"_id": curator_user_id})
    if not user:
        return json_error("Curator account no longer available", 404)

    cursor = db.contents.find({"$or": [{"user_id": curator_user_id}, {"userId": curator_user_id}]}).sort("created_at", -1)
    items = []
    async for doc in cursor:
        items.append(serialize_doc(doc))

    folder_cursor = db.folders.find({"$or": [{"user_id": curator_user_id}, {"userId": curator_user_id}]})
    folders = []
    async for f in folder_cursor:
        folders.append(serialize_doc(f))

    return json_success({
        "curator": user.get("username", "Anonymous Curator"),
        "created_at": link_doc.get("created_at"),
        "hash": share_hash,
        "folders": folders,
        "items": items
    })


# -------------------------------------------------------------
# HEALTH & DRIVER STATUS
# -------------------------------------------------------------

async def api_health(request):
    """GET /api/v1/health - System and PyMongo status"""
    db = await get_database()
    is_mock = mongo_manager.is_mock_mode()
    try:
        user_count = await db.users.count_documents({})
        content_count = await db.contents.count_documents({})
        return json_success({
            "status": "healthy",
            "framework": "Django 5.2 (Async)",
            "database": "MongoDB Atlas",
            "driver": "PyMongo AsyncMongoClient",
            "engine": "In-Memory Async Engine" if is_mock else "Live MongoDB Service",
            "counts": {
                "users": user_count,
                "content_items": content_count
            }
        })
    except Exception as e:
        return json_error(f"Health check failed: {str(e)}", 500)
