"""
Email delivery.

No real provider is wired up yet — send_email() just logs the message so the
verification flow is fully testable locally. Swap this function's body for a
real provider (AWS SES, SMTP, Resend, etc.) when ready; every caller in this
codebase goes through send_email(), so that's the only place that needs to
change.
"""

import logging

logger = logging.getLogger("email")


def send_email(to: str, subject: str, body: str) -> None:
    logger.info("Email (not actually sent) to=%s subject=%r", to, subject)
    # flush=True: stdout is fully buffered (not line-buffered) when it isn't
    # a TTY — e.g. piped to a log file by the dev runner — so without this
    # the message can sit invisible in the buffer indefinitely.
    print(
        f"\n===== EMAIL (not sent — no provider configured) =====\nTo: {to}\nSubject: {subject}\n\n{body}\n=======================================================\n",
        flush=True,
    )


def send_verification_email(user, token: str, frontend_base_url: str) -> None:
    link = f"{frontend_base_url}/verificar-email?token={token}"
    send_email(
        to=user.email,
        subject="Confirme seu e-mail — Minhas Finanças",
        body=(
            f"Olá {user.name},\n\n"
            f"Confirme seu e-mail clicando no link abaixo:\n{link}\n\n"
            "Se você não criou esta conta, pode ignorar este e-mail."
        ),
    )
