import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from app.gateway.authorization import _is_global_admin, _is_tenant_admin, require_config_write_access, require_tenant_admin, require_tenant_context
from deerflow.database.user_config_service import (
    create_tenant_shared_model,
    create_user_model,
    delete_tenant_shared_model,
    delete_user_model,
    get_available_models,
    get_user_models,
    list_tenant_shared_models,
    update_tenant_shared_model,
    update_user_model,
)
from deerflow.models.factory import _maybe_patch_openai_model_class
from deerflow.reflection.resolvers import resolve_class

router = APIRouter(prefix="/api", tags=["models"])


class ModelResponse(BaseModel):
    """Response model for model information."""

    name: str = Field(..., description="Unique identifier for the model")
    model: str = Field(..., description="Actual provider model identifier")
    display_name: str | None = Field(None, description="Human-readable name")
    description: str | None = Field(None, description="Model description")
    supports_thinking: bool = Field(default=False, description="Whether model supports thinking mode")
    supports_reasoning_effort: bool = Field(default=False, description="Whether model supports reasoning effort")
    supports_text2image: bool = Field(default=False, description="Whether model supports text-to-image (image generation)")
    max_input_tokens: int | None = Field(default=None, description="Maximum input tokens (context window) for auto-calculating summarization thresholds")
    model_type: str | None = Field(default=None, description="Model category: chat, code, reasoning, vision, text2image, multimodal")
    enabled: bool = Field(default=True, description="Whether model is enabled for selection")



class AvailableModelResponse(ModelResponse):
    scope: str = Field(..., description="Resource scope: global, tenant, user")
    source: str = Field(..., description="Model source classification")
    managed_by_current_user: bool = Field(..., description="Whether current user can manage this model")
    effective_permissions: list[str] = Field(default_factory=list, description="Effective permissions for current user")


class ModelsListResponse(BaseModel):
    """Response model for listing all models."""

    models: list[ModelResponse]


class AvailableModelsListResponse(BaseModel):
    models: list[AvailableModelResponse]


class ModelCreateRequest(BaseModel):
    """Request model for creating a model entry."""

    model_config = ConfigDict(extra="allow")

    name: str = Field(..., description="Unique identifier for the model")
    model: str = Field(..., description="Actual provider model identifier")
    use: str = Field(default="langchain_openai.ChatOpenAI", description="Model provider class path")
    display_name: str | None = Field(default=None, description="Human-readable name")
    description: str | None = Field(default=None, description="Model description")
    supports_thinking: bool = Field(default=False, description="Whether model supports thinking mode")
    supports_reasoning_effort: bool = Field(default=False, description="Whether model supports reasoning effort")
    supports_vision: bool = Field(default=False, description="Whether model supports vision")
    supports_text2image: bool = Field(default=False, description="Whether model supports text-to-image (image generation)")
    max_input_tokens: int | None = Field(default=None, description="Maximum input tokens (context window) for auto-calculating summarization thresholds")
    model_type: str | None = Field(default=None, description="Model category: chat, code, reasoning, vision, text2image, multimodal")
    enabled: bool = Field(default=True, description="Whether model is enabled")
    use_responses_api: bool | None = Field(default=None, description="Whether to use OpenAI responses API")
    output_version: str | None = Field(default=None, description="Structured output version")
    max_tokens: int | None = Field(default=None, description="Optional max tokens")
    base_url: str | None = Field(default=None, description="Optional provider base URL")
    api_key: str | None = Field(default=None, description="Optional provider API key")


@router.get(
    "/models",
    response_model=ModelsListResponse,
    summary="List All Models",
    description="Retrieve a list of all available AI models configured in the system.",
)
async def list_models(request: Request) -> ModelsListResponse:
    """List all available models from configuration.

    Returns model information suitable for frontend display,
    excluding sensitive fields like API keys and internal configuration.

    Returns:
        A list of all configured models with their metadata.

    Example Response:
        ```json
        {
            "models": [
                {
                    "name": "gpt-4",
                    "display_name": "GPT-4",
                    "description": "OpenAI GPT-4 model",
                    "supports_thinking": false
                },
                {
                    "name": "claude-3-opus",
                    "display_name": "Claude 3 Opus",
                    "description": "Anthropic Claude 3 Opus model",
                    "supports_thinking": true
                }
            ]
        }
        ```
    """
    require_tenant_context(request)
    rows = await get_user_models(request.state.user_id, tenant_id=getattr(request.state, "tenant_id", None))
    models = [
        ModelResponse(
            name=row.name,
            model=row.model,
            display_name=row.display_name,
            description=row.description,
            supports_thinking=row.supports_thinking,
            supports_reasoning_effort=row.supports_reasoning_effort,
            supports_text2image=row.supports_text2image,
            max_input_tokens=row.max_input_tokens,
            enabled=_model_enabled_from_row_settings(row),
        )
        for row in rows
    ]
    return ModelsListResponse(models=models)


@router.post(
    "/models",
    response_model=ModelResponse,
    status_code=201,
    summary="Register Model",
    description="Register a new AI model for the current user.",
)
async def register_model(request: Request, body: ModelCreateRequest) -> ModelResponse:
    require_tenant_context(request)
    require_config_write_access(request)
    try:
        row = await create_user_model(
            request.state.user_id,
            body.model_dump(),
            tenant_id=getattr(request.state, "tenant_id", None),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    return ModelResponse(
        name=row.name,
        model=row.model,
        display_name=row.display_name,
        description=row.description,
        supports_thinking=row.supports_thinking,
        supports_reasoning_effort=row.supports_reasoning_effort,
        supports_text2image=row.supports_text2image,
        enabled=_model_enabled_from_row_settings(row),
    )




class ModelUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    display_name: str | None = None
    description: str | None = None
    supports_thinking: bool | None = None
    supports_reasoning_effort: bool | None = None
    supports_vision: bool | None = None
    supports_text2image: bool | None = None
    max_input_tokens: int | None = None
    model_type: str | None = None
    enabled: bool | None = None


class TestConnectionRequest(BaseModel):
    model: str = Field(..., description="The actual provider model identifier to test")
    use: str = Field(default="langchain_openai.ChatOpenAI", description="Provider class path")
    base_url: str | None = Field(default=None, description="Optional provider base URL")
    api_key: str | None = Field(default=None, description="Optional provider API key")
    max_tokens: int = Field(default=32, description="Max tokens for the test call")
    verify_ssl: bool = Field(default=False, description="Verify SSL certificate when connecting")


class TestConnectionResponse(BaseModel):
    success: bool
    message: str


def _model_enabled_from_row_settings(row) -> bool:
    settings = row.settings if isinstance(getattr(row, "settings", None), dict) else {}
    return bool(settings.get("enabled", True))


def _is_platform_admin(request: Request) -> bool:
    role = getattr(request.state, "user_role", None)
    return isinstance(role, str) and role.lower() in {"platform_admin", "admin"}


def _is_tenant_admin(request: Request) -> bool:
    role = getattr(request.state, "tenant_role", None)
    return isinstance(role, str) and role.lower() == "tenant_admin"


@router.post(
    "/models/test-connection",
    response_model=TestConnectionResponse,
    summary="Test Model Connection",
    description="Test connectivity to a model provider by sending a minimal chat completion request.",
)
async def test_model_connection(request: Request, body: TestConnectionRequest) -> TestConnectionResponse:
    """Test connectivity to a model provider with the given parameters.

    Instantiates the provider's chat model class and sends a minimal request
    to verify that the base URL, API key, and model identifier are valid.
    """
    if not _is_global_admin(request) and not _is_tenant_admin(request):
        raise HTTPException(status_code=403, detail="Admin access required")

    try:
        model_class = resolve_class(body.use)
        model_class = _maybe_patch_openai_model_class(body.use, model_class)
    except Exception as exc:
        return TestConnectionResponse(
            success=False,
            message=f"Invalid provider class '{body.use}': {exc}",
        )

    kwargs: dict = {
        "model": body.model,
        "temperature": 0,
        "request_timeout": 15,
    }
    if body.base_url:
        kwargs["base_url"] = body.base_url.rstrip("/")
    if body.api_key:
        kwargs["api_key"] = body.api_key
    if not body.verify_ssl:
        import httpx
        kwargs["http_client"] = httpx.Client(verify=False, trust_env=False)
        kwargs["http_async_client"] = httpx.AsyncClient(verify=False, trust_env=False)
    if "api_key" not in kwargs:
        kwargs["api_key"] = "not-needed"
    # Map generic api_key to provider-specific parameter names
    if body.use.startswith("langchain_anthropic"):
        kwargs["anthropic_api_key"] = kwargs.pop("api_key")
    elif body.use.startswith("langchain_google_genai"):
        kwargs["google_api_key"] = kwargs.pop("api_key")

    try:
        instance = model_class(**kwargs)
        result = await asyncio.wait_for(
            asyncio.to_thread(instance.invoke, "Reply with exactly: ok"),
            timeout=15,
        )
        content = result.content if hasattr(result, "content") else str(result)
        preview = str(content)[:300]
        return TestConnectionResponse(
            success=True,
            message=f"Connection successful. Model response: {preview}",
        )
    except asyncio.TimeoutError:
        return TestConnectionResponse(
            success=False,
            message="Connection timed out after 15 seconds. Check the base URL and API key, or try again.",
        )
    except Exception as exc:
        err_msg = str(exc)
        # Truncate verbose error messages for cleaner frontend display
        if len(err_msg) > 500:
            err_msg = err_msg[:500] + "..."
        return TestConnectionResponse(
            success=False,
            message=f"Connection failed: {err_msg}",
        )


@router.get(
    "/models/available",
    response_model=AvailableModelsListResponse,
    summary="List Available Models",
    description="Return merged global, tenant-shared and user-private models for current tenant context.",
)
async def list_available_models(request: Request) -> AvailableModelsListResponse:
    tenant_id = require_tenant_context(request)
    rows = await get_available_models(
        request.state.user_id,
        tenant_id,
        is_tenant_admin=_is_tenant_admin(request),
        is_platform_admin=_is_platform_admin(request),
    )
    return AvailableModelsListResponse(models=[AvailableModelResponse.model_validate(row) for row in rows])


@router.get(
    "/tenants/models",
    response_model=ModelsListResponse,
    summary="List Tenant Shared Models",
    description="List tenant shared models for current tenant.",
    dependencies=[Depends(require_tenant_admin)],
)
async def list_tenant_models(request: Request) -> ModelsListResponse:
    tenant_id = require_tenant_context(request)
    rows = await list_tenant_shared_models(tenant_id)
    return ModelsListResponse(
        models=[
            ModelResponse(
                name=row.name,
                model=row.model,
                display_name=row.display_name,
                description=row.description,
                supports_thinking=row.supports_thinking,
                supports_reasoning_effort=row.supports_reasoning_effort,
                supports_text2image=row.supports_text2image,
                enabled=_model_enabled_from_row_settings(row),
            )
            for row in rows
        ]
    )


@router.post(
    "/tenants/models",
    response_model=ModelResponse,
    status_code=201,
    summary="Create Tenant Shared Model",
    dependencies=[Depends(require_tenant_admin)],
)
async def create_tenant_model(request: Request, body: ModelCreateRequest) -> ModelResponse:
    raise HTTPException(status_code=410, detail="Tenant model creation has been deprecated. Use platform model assignment.")


@router.put(
    "/tenants/models/{model_name:path}",
    response_model=ModelResponse,
    summary="Update Tenant Shared Model",
    dependencies=[Depends(require_tenant_admin)],
)
async def update_tenant_model(model_name: str, request: Request, body: ModelUpdateRequest) -> ModelResponse:
    tenant_id = require_tenant_context(request)
    payload = body.model_dump(exclude_unset=True)
    unsupported = {key for key in payload if key != "enabled"}
    if unsupported:
        raise HTTPException(
            status_code=400,
            detail="Only 'enabled' can be updated for tenant shared models.",
        )

    try:
        row = await update_tenant_shared_model(tenant_id, model_name, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return ModelResponse(
        name=row.name,
        model=row.model,
        display_name=row.display_name,
        description=row.description,
        supports_thinking=row.supports_thinking,
        supports_reasoning_effort=row.supports_reasoning_effort,
        supports_text2image=row.supports_text2image,
        enabled=_model_enabled_from_row_settings(row),
    )


@router.delete(
    "/tenants/models/{model_name:path}",
    status_code=204,
    summary="Delete Tenant Shared Model",
    dependencies=[Depends(require_tenant_admin)],
)
async def delete_tenant_model(model_name: str, request: Request):
    raise HTTPException(status_code=410, detail="Tenant model deletion has been deprecated. Use platform model unassignment.")


@router.get(
    "/models/{model_name:path}",
    response_model=ModelResponse,
    summary="Get Model Details",
    description="Retrieve detailed information about a specific AI model by its name.",
)
async def get_model(model_name: str, request: Request) -> ModelResponse:
    """Get a specific model by name.

    Args:
        model_name: The unique name of the model to retrieve.

    Returns:
        Model information if found.

    Raises:
        HTTPException: 404 if model not found.

    Example Response:
        ```json
        {
            "name": "gpt-4",
            "display_name": "GPT-4",
            "description": "OpenAI GPT-4 model",
            "supports_thinking": false
        }
        ```
    """
    require_tenant_context(request)
    rows = await get_user_models(request.state.user_id, tenant_id=getattr(request.state, "tenant_id", None))
    model = next((row for row in rows if row.name == model_name), None)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_name}' not found")

    return ModelResponse(
        name=model.name,
        model=model.model,
        display_name=model.display_name,
        description=model.description,
        supports_thinking=model.supports_thinking,
        supports_reasoning_effort=model.supports_reasoning_effort,
        supports_text2image=model.supports_text2image,
        enabled=_model_enabled_from_row_settings(model),
    )

@router.put("/models/{model_name:path}", response_model=ModelResponse)
async def update_model(model_name: str, request: Request, body: ModelUpdateRequest) -> ModelResponse:
    require_tenant_context(request)
    require_config_write_access(request)
    try:
        row = await update_user_model(
            request.state.user_id,
            model_name,
            body.model_dump(exclude_unset=True),
            tenant_id=getattr(request.state, "tenant_id", None),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
        
    return ModelResponse(
        name=row.name,
        model=row.model,
        display_name=row.display_name,
        description=row.description,
        supports_thinking=row.supports_thinking,
        supports_reasoning_effort=row.supports_reasoning_effort,
        supports_text2image=row.supports_text2image,
        enabled=_model_enabled_from_row_settings(row),
    )

@router.delete("/models/{model_name:path}", status_code=204)
async def delete_model(model_name: str, request: Request):
    require_tenant_context(request)
    require_config_write_access(request)
    try:
        await delete_user_model(
            request.state.user_id,
            model_name,
            tenant_id=getattr(request.state, "tenant_id", None),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
