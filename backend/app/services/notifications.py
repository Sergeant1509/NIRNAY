from firebase_admin import messaging
from app.core.firebase import get_firebase_app,get_firestore_client
def send_user_notification(uid:str,title:str,body:str,data:dict[str,str]|None=None)->int:
    """Send to FCM Firebase Installation IDs (FIDs) registered to this UID."""
    docs=get_firestore_client().collection('users').document(uid).collection('fcmInstallations').stream(); sent=0
    for doc in docs:
        fid=(doc.to_dict() or {}).get('fid')
        if not fid: continue
        try: messaging.send(messaging.Message(fid=fid,notification=messaging.Notification(title=title,body=body),data=data or {}),app=get_firebase_app()); sent+=1
        except Exception: continue
    return sent