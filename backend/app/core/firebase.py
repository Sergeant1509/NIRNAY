import os
from functools import lru_cache
import firebase_admin
from firebase_admin import firestore
@lru_cache(maxsize=1)
def get_firebase_app():
    try: return firebase_admin.get_app()
    except ValueError:
        options={}
        project=os.getenv('FIREBASE_PROJECT_ID') or os.getenv('GOOGLE_CLOUD_PROJECT')
        if project: options['projectId']=project
        bucket=os.getenv('FIREBASE_STORAGE_BUCKET')
        if bucket: options['storageBucket']=bucket
        return firebase_admin.initialize_app(options=options or None)
def get_firestore_client(): return firestore.client(app=get_firebase_app())