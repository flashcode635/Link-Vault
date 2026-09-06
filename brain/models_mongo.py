"""
MongoDB document schema helpers and serializes for PyMongo models.
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from bson import ObjectId

def serialize_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Recursively converts BSON ObjectId and datetime objects to JSON serializable structures."""
    if doc is None:
        return None
    res = {}
    for k, v in doc.items():
        if k == '_id':
            res['_id'] = str(v)
            res['id'] = str(v)
        elif isinstance(v, ObjectId):
            res[k] = str(v)
        elif isinstance(v, datetime):
            res[k] = v.isoformat()
        elif isinstance(v, list):
            res[k] = [
                str(item) if isinstance(item, ObjectId) else serialize_doc(item) if isinstance(item, dict) else item
                for item in v
            ]
        elif isinstance(v, dict):
            res[k] = serialize_doc(v)
        else:
            res[k] = v
    return res

def serialize_list(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Serializes a list of BSON documents."""
    return [serialize_doc(d) for d in docs if d is not None]

def current_iso_time() -> str:
    return datetime.now(timezone.utc).isoformat()
