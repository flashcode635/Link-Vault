"""
Django template rendering views (asynchronous) for BrainVault.
"""

from django.shortcuts import render, redirect
from django.http import HttpResponseNotFound, HttpResponseServerError
from brain.mongodb import get_database, mongo_manager
from brain.models_mongo import serialize_doc
from brain.auth_mongo import authenticate_request

async def dashboard_view(request):
    """Render the primary Notion-style Second Brain dashboard."""
    user, _ = await authenticate_request(request)
    db = await get_database()
    
    is_mock = mongo_manager.is_mock_mode()
    
    context = {
        "title": "Brain Vault - Knowledge Second Brain",
        "user": serialize_doc(user) if user else None,
        "is_authenticated": user is not None,
        "is_mock_mode": is_mock,
        "driver_info": "In-Memory Async Engine" if is_mock else "Live MongoDB Service",
    }
    return render(request, 'dashboard.html', context)

async def shared_brain_view(request, share_hash: str):
    """Render the public shared second brain."""
    db = await get_database()
    link_doc = await db.links.find_one({"hash": share_hash})
    if not link_doc:
        return render(request, '404.html', {
            "title": "Brain Vault - Brain Not Found",
            "message": f"No shared brain was found with reference '{share_hash}'."
        }, status=404)

    curator_user_id = link_doc.get("user_id") or link_doc.get("userId")
    curator = await db.users.find_one({"_id": curator_user_id})
    username = curator.get("username", "Anonymous") if curator else "Anonymous"

    cursor = db.contents.find({"$or": [{"user_id": curator_user_id}, {"userId": curator_user_id}]}).sort("created_at", -1)
    items = []
    async for doc in cursor:
        items.append(serialize_doc(doc))

    context = {
        "title": f"{username}'s Second Brain - Brain Vault",
        "curator_username": username,
        "share_hash": share_hash,
        "items": items,
        "total_items": len(items),
    }
    return render(request, 'shared_brain.html', context)

async def login_view(request):
    """Render the sign in template."""
    return render(request, 'login.html', {"title": "Sign In - Brain Vault"})

async def register_view(request):
    """Render the registration template."""
    return render(request, 'register.html', {"title": "Create Account - Brain Vault"})

async def api_docs_view(request):
    """Render the interactive PyMongo Async API documentation and testing hub."""
    is_mock = mongo_manager.is_mock_mode()
    return render(request, 'api_docs.html', {
        "title": "API Reference - Brain Vault",
        "is_mock_mode": is_mock,
    })

def custom_404_view(request, exception=None):
    """Custom 404 error page."""
    return render(request, '404.html', {
        "title": "Page Not Found (404)",
        "message": "The page or resource you requested could not be located."
    }, status=404)

def custom_500_view(request):
    """Custom 500 error page."""
    return render(request, '500.html', {
        "title": "Internal Server Error (500)",
        "message": "An unexpected server error occurred. Please check database connectivity."
    }, status=500)
