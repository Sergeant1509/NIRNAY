from typing import Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from app.core.firebase import get_firebase_app
bearer=HTTPBearer(auto_error=False)
def require_user(credentials:HTTPAuthorizationCredentials|None=Depends(bearer))->dict[str,Any]:
    if credentials is None or credentials.scheme.lower()!='bearer':
        raise HTTPException(status_code=401,detail='A Firebase ID token is required.',headers={'WWW-Authenticate':'Bearer'})
    try: app=get_firebase_app()
    except Exception as exc: raise HTTPException(status_code=503,detail='Firebase Admin is not configured on this server.') from exc
    try: return firebase_auth.verify_id_token(credentials.credentials,check_revoked=True,app=app)
    except Exception as exc: raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,detail='Firebase ID token is invalid or expired. Sign in again.',headers={'WWW-Authenticate':'Bearer'}) from exc