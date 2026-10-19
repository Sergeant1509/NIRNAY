from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from app.core.firebase import get_firestore_client
from app.core.security import require_user
router=APIRouter(prefix='/api/v1/auth',tags=['Authentication'])
@router.get('/me')
def get_current_user(user:dict[str,Any]=Depends(require_user)):
    uid=user.get('uid')
    if not uid: raise HTTPException(status_code=401,detail='Authenticated user has no UID.')
    ref=get_firestore_client().collection('users').document(uid); existing=ref.get()
    profile={'uid':uid,'email':user.get('email'),'displayName':user.get('name') or user.get('display_name'),'photoURL':user.get('picture'),'emailVerified':bool(user.get('email_verified',False)),'lastLoginAt':firestore.SERVER_TIMESTAMP}
    if not existing.exists: profile['createdAt']=firestore.SERVER_TIMESTAMP
    ref.set(profile,merge=True)
    return {'uid':uid,'email':user.get('email'),'display_name':user.get('name') or user.get('display_name'),'email_verified':bool(user.get('email_verified',False)),'role':user.get('role')}