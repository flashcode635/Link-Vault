"""
Authentication utilities for PyMongo Async and Django.
Includes bcrypt hashing, JWT issuance and verification, and async auth helpers.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Tuple
import bcrypt
import jwt
from bson import ObjectId
from django.conf import settings
from django.http import JsonResponse
from brain.mongodb import get_database

def hash_password(password: str) -> str:
    """Hash plaintext password using bcrypt."""
    salt = bcrypt.gensalt(rounds=10)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against bcrypt hash or fallback to legacy plaintext."""
    if not hashed_password or not plain_password:
        return False
    try:
        if str(hashed_password).startswith(('$2b$', '$2a$', '$2y$')):
            return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
        return plain_password == hashed_password
    except Exception:
        return plain_password == hashed_password

def generate_jwt_token(user_id: str, username: str) -> str:
    """Generate JWT authentication token."""
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRATION_HOURS)
    payload = {
        "sub": str(user_id),
        "username": username,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def decode_jwt_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate a JWT authentication token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

async def authenticate_request(request) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Extracts and authenticates user from Authorization header or cookies.
    Returns (user_dict, error_message).
    """
    token = None
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1].strip()
    elif 'access_token' in request.COOKIES:
        token = request.COOKIES.get('access_token')
    elif 'token' in request.GET:
        token = request.GET.get('token')

    if not token:
        return None, "Authentication token missing"

    payload = decode_jwt_token(token)
    if not payload:
        return None, "Invalid or expired authentication token"

    db = await get_database()
    try:
        user_id = ObjectId(payload["sub"])
        user = await db.users.find_one({"_id": user_id})
        if not user:
            return None, "User not found"
        return user, None
    except Exception as e:
        return None, f"Database authentication error: {str(e)}"
