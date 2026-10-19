import hashlib,os
from typing import Any
from fastapi import APIRouter,Depends,HTTPException
from firebase_admin import firestore
from pydantic import BaseModel,Field
from app.core.firebase import get_firestore_client
from app.core.security import require_user
from app.services.notifications import send_user_notification
router=APIRouter(prefix='/api/v1/notifications',tags=['Notifications'])
class FIDRegistration(BaseModel): fid:str=Field(min_length=10,max_length=256)
@router.post('/register')
def register_fid(body:FIDRegistration,user:dict[str,Any]=Depends(require_user)):
    key=hashlib.sha256(body.fid.encode()).hexdigest(); ref=get_firestore_client().collection('users').document(user['uid']).collection('fcmInstallations').document(key)
    ref.set({'fid':body.fid,'updatedAt':firestore.SERVER_TIMESTAMP},merge=True); return {'ok':True}
@router.delete('/register')
def unregister_fid(body:FIDRegistration,user:dict[str,Any]=Depends(require_user)):
    key=hashlib.sha256(body.fid.encode()).hexdigest(); get_firestore_client().collection('users').document(user['uid']).collection('fcmInstallations').document(key).delete(); return {'ok':True}
@router.post('/test')
def test_notification(user:dict[str,Any]=Depends(require_user)):
    if os.getenv('ENABLE_TEST_NOTIFICATIONS','false').lower()!='true': raise HTTPException(status_code=404,detail='Test notifications are disabled.')
    sent=send_user_notification(user['uid'],'NIRNAY notification test','Your browser is connected to Firebase Cloud Messaging.',{'url':'/app','type':'test'}); return {'ok':True,'sent':sent}