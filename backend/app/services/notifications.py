from firebase_admin import messaging

from app.core.firebase import get_firebase_app, get_firestore_client


def send_user_notification(
    uid: str,
    title: str,
    body: str,
    data: dict[str, str] | None = None,
) -> int:
    """Send an FCM notification to the registration tokens stored for a user."""
    registrations = (
        get_firestore_client()
        .collection("users")
        .document(uid)
        .collection("fcmInstallations")
        .stream()
    )
    sent = 0
    for registration in registrations:
        token = (registration.to_dict() or {}).get("token")
        if not token:
            continue
        try:
            message = messaging.Message(
                token=token,
                notification=messaging.Notification(title=title, body=body),
                data=data or {},
            )
            messaging.send(message, app=get_firebase_app())
            sent += 1
        except Exception:
            # One invalid registration should not prevent other deliveries.
            continue
    return sent
