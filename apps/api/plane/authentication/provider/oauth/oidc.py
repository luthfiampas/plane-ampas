import os
from datetime import datetime, timedelta
from urllib.parse import urlencode

import jwt
import pytz
import requests
from jwt import PyJWKClient

from plane.authentication.adapter.error import (
    AUTHENTICATION_ERROR_CODES,
    AuthenticationException,
)
from plane.authentication.adapter.oauth import OauthAdapter
from plane.license.utils.instance_value import get_configuration_value


class OIDCOAuthProvider(OauthAdapter):
    provider = "oidc"
    scope = "openid email profile"

    def __init__(self, request, code=None, state=None, callback=None):
        (OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_DISCOVERY_URL) = get_configuration_value(
            [
                {
                    "key": "OIDC_CLIENT_ID",
                    "default": os.environ.get("OIDC_CLIENT_ID"),
                },
                {
                    "key": "OIDC_CLIENT_SECRET",
                    "default": os.environ.get("OIDC_CLIENT_SECRET"),
                },
                {
                    "key": "OIDC_DISCOVERY_URL",
                    "default": os.environ.get("OIDC_DISCOVERY_URL"),
                },
            ]
        )

        if not (OIDC_CLIENT_ID and OIDC_CLIENT_SECRET and OIDC_DISCOVERY_URL):
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["OIDC_NOT_CONFIGURED"],
                error_message="OIDC_NOT_CONFIGURED",
            )

        OIDC_DISCOVERY_URL = OIDC_DISCOVERY_URL.rstrip("/")
        if not OIDC_DISCOVERY_URL.endswith("/.well-known/openid-configuration"):
            OIDC_DISCOVERY_URL += "/.well-known/openid-configuration"

        try:
            discovery = requests.get(OIDC_DISCOVERY_URL, timeout=10).json()
        except requests.RequestException:
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["OIDC_NOT_CONFIGURED"],
                error_message="OIDC_NOT_CONFIGURED",
            )

        auth_url = discovery.get("authorization_endpoint")
        token_url = discovery.get("token_endpoint")
        userinfo_url = discovery.get("userinfo_endpoint")
        self.jwks_uri = discovery.get("jwks_uri")

        if not (auth_url and token_url and userinfo_url):
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["OIDC_NOT_CONFIGURED"],
                error_message="OIDC_NOT_CONFIGURED",
            )

        self._discovery = discovery
        client_id = OIDC_CLIENT_ID
        client_secret = OIDC_CLIENT_SECRET

        redirect_uri = f"{'https' if request.is_secure() else 'http'}://{request.get_host()}/auth/oidc/callback/"
        url_params = {
            "client_id": client_id,
            "scope": self.scope,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "state": state,
        }
        auth_url_with_params = f"{auth_url}?{urlencode(url_params)}"

        super().__init__(
            request,
            self.provider,
            client_id,
            self.scope,
            redirect_uri,
            auth_url_with_params,
            token_url,
            userinfo_url,
            client_secret,
            code,
            callback=callback,
        )

    def set_token_data(self):
        data = {
            "code": self.code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": self.redirect_uri,
            "grant_type": "authorization_code",
        }
        headers = {"Accept": "application/json"}
        token_response = self.get_user_token(data=data, headers=headers)
        super().set_token_data(
            {
                "access_token": token_response.get("access_token"),
                "refresh_token": token_response.get("refresh_token", None),
                "access_token_expired_at": (
                    datetime.now(tz=pytz.utc) + timedelta(seconds=token_response.get("expires_in"))
                    if token_response.get("expires_in")
                    else None
                ),
                "refresh_token_expired_at": (
                    datetime.fromtimestamp(token_response.get("refresh_token_expired_at"), tz=pytz.utc)
                    if token_response.get("refresh_token_expired_at")
                    else None
                ),
                "id_token": token_response.get("id_token", ""),
            }
        )

    def _decode_id_token(self, id_token):
        if not id_token:
            return None
        try:
            unverified = jwt.decode(id_token, options={"verify_signature": False}, audience=self.client_id)
            return unverified
        except jwt.InvalidTokenError:
            return None

    def _verify_id_token(self, id_token):
        if not id_token or not self.jwks_uri:
            return self._decode_id_token(id_token)
        try:
            jwks_client = PyJWKClient(self.jwks_uri, cache_keys=True)
            signing_key = jwks_client.get_signing_key_from_jwt(id_token)
            return jwt.decode(
                id_token,
                signing_key.key,
                algorithms=["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"],
                audience=self.client_id,
            )
        except Exception:
            return self._decode_id_token(id_token)

    def set_user_data(self):
        id_token_claims = self._verify_id_token(self.token_data.get("id_token"))

        user_info = {}
        if id_token_claims:
            user_info = id_token_claims
        else:
            try:
                user_info = self.get_user_response()
            except AuthenticationException:
                raise AuthenticationException(
                    error_code=AUTHENTICATION_ERROR_CODES["OIDC_OAUTH_PROVIDER_ERROR"],
                    error_message="OIDC_OAUTH_PROVIDER_ERROR",
                )

        email = user_info.get("email") or ""
        provider_id = str(user_info.get("sub") or user_info.get("id") or "")

        if not provider_id:
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["OIDC_OAUTH_PROVIDER_ERROR"],
                error_message="OIDC_OAUTH_PROVIDER_ERROR",
            )

        first_name = user_info.get("given_name") or user_info.get("name") or ""
        last_name = user_info.get("family_name") or ""
        avatar = user_info.get("picture") or ""

        super().set_user_data(
            {
                "email": email,
                "user": {
                    "provider_id": provider_id,
                    "email": email,
                    "avatar": avatar,
                    "first_name": first_name,
                    "last_name": last_name,
                    "is_password_autoset": True,
                },
            }
        )
