from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.gateway.routers import models


def _create_app() -> FastAPI:
    app = FastAPI()

    @app.middleware("http")
    async def inject_context(request: Request, call_next):
        request.state.user_id = request.headers.get("x-user-id", "u-1")
        request.state.user_role = request.headers.get("x-user-role", "user")
        tenant_role = request.headers.get("x-tenant-role", "tenant_member")
        if tenant_role in {"admin", "owner"}:
            tenant_role = "tenant_admin"
        elif tenant_role == "member":
            tenant_role = "tenant_member"
        request.state.tenant_role = tenant_role
        tenant_id = request.headers.get("x-tenant-id")
        if tenant_id is not None:
            request.state.tenant_id = tenant_id
        return await call_next(request)

    app.include_router(models.router)
    return app


def test_available_models_requires_tenant_context() -> None:
    app = _create_app()

    with TestClient(app) as client:
        response = client.get("/api/models/available")

    assert response.status_code == 400
    assert response.json()["detail"] == "Tenant context is required"


def test_available_models_returns_merged_scopes(monkeypatch) -> None:
    app = _create_app()

    async def _fake_get_available_models(
        user_id: str,
        tenant_id: str,
        *,
        is_tenant_admin: bool,
        is_platform_admin: bool,
    ):
        assert user_id == "u-1"
        assert tenant_id == "tenant-a"
        assert is_tenant_admin is True
        assert is_platform_admin is False
        return [
            {
                "name": "global-1",
                "model": "gpt-global",
                "display_name": "Global 1",
                "description": None,
                "supports_thinking": False,
                "supports_reasoning_effort": False,
                "scope": "global",
                "source": "platform_builtin",
                "managed_by_current_user": False,
                "effective_permissions": ["read", "use"],
            },
            {
                "name": "tenant-1",
                "model": "gpt-tenant",
                "display_name": "Tenant 1",
                "description": None,
                "supports_thinking": False,
                "supports_reasoning_effort": False,
                "scope": "tenant",
                "source": "tenant_shared",
                "managed_by_current_user": True,
                "effective_permissions": ["read", "use", "manage"],
            },
            {
                "name": "mine-1",
                "model": "gpt-mine",
                "display_name": "Mine 1",
                "description": None,
                "supports_thinking": True,
                "supports_reasoning_effort": True,
                "scope": "user",
                "source": "user_private",
                "managed_by_current_user": True,
                "effective_permissions": ["read", "use", "manage"],
            },
        ]

    monkeypatch.setattr(models, "get_available_models", _fake_get_available_models)

    with TestClient(app) as client:
        response = client.get(
            "/api/models/available",
            headers={"x-tenant-id": "tenant-a", "x-tenant-role": "tenant_admin"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert [item["scope"] for item in payload["models"]] == ["global", "tenant", "user"]


def test_tenant_shared_models_reject_non_tenant_admin() -> None:
    app = _create_app()

    with TestClient(app) as client:
        response = client.get(
            "/api/tenants/models",
            headers={"x-tenant-id": "tenant-a", "x-tenant-role": "tenant_member"},
        )

    assert response.status_code == 403


def test_tenant_shared_models_reject_platform_admin_without_membership() -> None:
    app = _create_app()

    with TestClient(app) as client:
        response = client.get(
            "/api/tenants/models",
            headers={"x-tenant-id": "tenant-a", "x-tenant-role": "tenant_member", "x-user-role": "admin"},
        )

    assert response.status_code == 403


def test_tenant_shared_models_create_is_deprecated() -> None:
    app = _create_app()

    with TestClient(app) as client:
        response = client.post(
            "/api/tenants/models",
            headers={"x-tenant-id": "tenant-a", "x-tenant-role": "tenant_admin"},
            json={"name": "tenant-new", "model": "gpt-tenant"},
        )

    assert response.status_code == 410


def test_tenant_shared_model_delete_rejects_non_tenant_admin() -> None:
    app = _create_app()

    with TestClient(app) as client:
        response = client.delete(
            "/api/tenants/models/tenant-new",
            headers={"x-tenant-id": "tenant-a", "x-tenant-role": "tenant_member"},
        )

    assert response.status_code == 403


def test_tenant_shared_model_delete_is_deprecated() -> None:
    app = _create_app()

    with TestClient(app) as client:
        response = client.delete(
            "/api/tenants/models/missing-model",
            headers={"x-tenant-id": "tenant-a", "x-tenant-role": "tenant_admin"},
        )

    assert response.status_code == 410


def test_tenant_shared_model_update_only_allows_enabled_field() -> None:
    app = _create_app()

    with TestClient(app) as client:
        response = client.put(
            "/api/tenants/models/missing-model",
            headers={"x-tenant-id": "tenant-a", "x-tenant-role": "tenant_admin"},
            json={"description": "x"},
        )

    assert response.status_code == 400
    assert "Only 'enabled'" in response.json()["detail"]


def test_tenant_shared_model_update_enabled_passes_to_service(monkeypatch) -> None:
    app = _create_app()

    class _Row:
        name = "tenant-model"
        model = "gpt-tenant"
        display_name = "Tenant Model"
        description = "tenant model"
        supports_thinking = False
        supports_reasoning_effort = False
        supports_text2image = False
        settings = {"enabled": False}

    async def _fake_update_tenant_shared_model(tenant_id: str, model_name: str, payload: dict):
        assert tenant_id == "tenant-a"
        assert model_name == "tenant-model"
        assert payload == {"enabled": False}
        return _Row()

    monkeypatch.setattr(models, "update_tenant_shared_model", _fake_update_tenant_shared_model)

    with TestClient(app) as client:
        response = client.put(
            "/api/tenants/models/tenant-model",
            headers={"x-tenant-id": "tenant-a", "x-tenant-role": "tenant_admin"},
            json={"enabled": False},
        )

    assert response.status_code == 200
    assert response.json()["name"] == "tenant-model"


def test_available_models_passes_platform_admin_flag(monkeypatch) -> None:
    app = _create_app()

    async def _fake_get_available_models(
        user_id: str,
        tenant_id: str,
        *,
        is_tenant_admin: bool,
        is_platform_admin: bool,
    ):
        assert user_id == "u-1"
        assert tenant_id == "tenant-a"
        assert is_tenant_admin is False
        assert is_platform_admin is True
        return []

    monkeypatch.setattr(models, "get_available_models", _fake_get_available_models)

    with TestClient(app) as client:
        response = client.get(
            "/api/models/available",
            headers={"x-tenant-id": "tenant-a", "x-tenant-role": "tenant_member", "x-user-role": "admin"},
        )

    assert response.status_code == 200
    assert response.json() == {"models": []}


def test_user_private_model_create_forbidden_for_tenant_member(monkeypatch) -> None:
    app = _create_app()

    with TestClient(app) as client:
        response = client.post(
            "/api/models",
            headers={"x-tenant-id": "tenant-a", "x-tenant-role": "tenant_member"},
            json={"name": "mine-new", "model": "gpt-user"},
        )

    assert response.status_code == 403


def test_user_private_model_create_forbidden_for_platform_admin_without_tenant_admin() -> None:
    app = _create_app()

    with TestClient(app) as client:
        response = client.post(
            "/api/models",
            headers={"x-tenant-id": "tenant-a", "x-tenant-role": "tenant_member", "x-user-role": "admin"},
            json={"name": "mine-new", "model": "gpt-user"},
        )

    assert response.status_code == 403
