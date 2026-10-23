"""LLM provider adapters for structured JSON output.

Security rules:
- API keys are NEVER logged or printed.
- Keys are passed via authorization headers, not URL query parameters.
- Error messages never expose secrets or raw authorization headers.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx
from dotenv import load_dotenv

# Ensure environment variables are loaded from backend/.env
backend_dir = Path(__file__).resolve().parent.parent.parent
env_path = backend_dir / ".env"
load_dotenv(dotenv_path=env_path)


class LLMError(Exception):
    """Raised when an LLM provider request fails."""

    pass


class GeminiLLM:
    """Client for Google Gemini REST API using generateContent with JSON response schema."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout_s: Optional[float] = None,
    ):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        self.model = model or os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
        timeout_val = timeout_s or os.getenv("LLM_TIMEOUT_S", "20")
        try:
            self.timeout_s = float(timeout_val)
        except ValueError:
            self.timeout_s = 20.0

    def chat_json(
        self,
        system: str,
        messages: List[Dict[str, str]],
    ) -> Dict[str, Any]:
        """Send chat messages and return parsed JSON dictionary."""
        if not self.api_key:
            raise LLMError("GEMINI_API_KEY is not configured in backend/.env")
        if not self.model:
            raise LLMError("GEMINI_MODEL is not configured in backend/.env")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key,
        }

        # Format contents
        formatted_contents = []
        for msg in messages:
            role = "model" if msg.get("role") in ("assistant", "model") else "user"
            formatted_contents.append({
                "role": role,
                "parts": [{"text": str(msg.get("content", ""))}],
            })

        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": formatted_contents,
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.2,
            },
        }

        # Make request with 1 retry on transient failure
        last_exception = None
        for attempt in range(2):
            try:
                with httpx.Client(timeout=self.timeout_s) as client:
                    resp = client.post(url, headers=headers, json=body)

                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if not candidates:
                        raise LLMError("Gemini returned no candidates in response")

                    parts = candidates[0].get("content", {}).get("parts", [])
                    if not parts or "text" not in parts[0]:
                        raise LLMError("Gemini response missing text part")

                    raw_text = parts[0]["text"].strip()
                    try:
                        return json.loads(raw_text)
                    except json.JSONDecodeError as jde:
                        raise LLMError(f"Failed to parse LLM response as JSON: {jde}") from jde

                # Handle HTTP errors with clear short messages without leaking URL or key
                status = resp.status_code
                if status == 404:
                    raise LLMError(f"Gemini API 404: Model '{self.model}' not found or invalid.")
                elif status == 429:
                    raise LLMError("Gemini API 429: Rate limit exceeded or quota exhausted.")
                elif status == 400:
                    raise LLMError(f"Gemini API 400: Bad request. Response: {resp.text[:120]}")
                elif status == 403:
                    raise LLMError("Gemini API 403: Forbidden or invalid API key.")
                else:
                    raise LLMError(f"Gemini API failed with HTTP {status}: {resp.text[:120]}")

            except httpx.RequestError as exc:
                last_exception = exc
                if attempt == 0:
                    continue  # Retry once
                raise LLMError(f"Network error communicating with Gemini API: {type(exc).__name__}") from exc
            except LLMError:
                raise

        raise LLMError(f"LLM call failed after retry: {last_exception}")


class OpenRouterLLM:
    """Client for OpenRouter's OpenAI-compatible chat completions API."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout_s: Optional[float] = None,
    ):
        self.api_key = api_key if api_key is not None else os.getenv("OPENROUTER_API_KEY", "")
        self.model = model or os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
        timeout_val = timeout_s or os.getenv("LLM_TIMEOUT_S", "20")
        try:
            self.timeout_s = float(timeout_val)
        except ValueError:
            self.timeout_s = 20.0

    def chat_json(
        self,
        system: str,
        messages: List[Dict[str, str]],
    ) -> Dict[str, Any]:
        """Send chat messages to OpenRouter and return the parsed JSON object."""
        if not self.api_key:
            raise LLMError("OPENROUTER_API_KEY is not configured in backend/.env")
        if not self.model:
            raise LLMError("OPENROUTER_MODEL is not configured in backend/.env")

        request_messages = [{"role": "system", "content": system}]
        for message in messages:
            role = message.get("role", "user")
            request_messages.append({
                "role": "assistant" if role in ("assistant", "model") else "user",
                "content": str(message.get("content", "")),
            })
        body = {
            "model": self.model,
            "messages": request_messages,
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        last_exception = None
        for attempt in range(2):
            try:
                with httpx.Client(timeout=self.timeout_s) as client:
                    response = client.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers=headers,
                        json=body,
                    )

                if response.status_code != 200:
                    raise LLMError(
                        f"OpenRouter API failed with HTTP {response.status_code}."
                    )

                try:
                    data = response.json()
                    content = data["choices"][0]["message"]["content"]
                    result = json.loads(content)
                except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
                    raise LLMError(
                        "OpenRouter response did not contain a valid JSON object."
                    ) from exc
                if not isinstance(result, dict):
                    raise LLMError("OpenRouter response must be a JSON object.")
                return result
            except httpx.RequestError as exc:
                last_exception = exc
                if attempt == 0:
                    continue
                raise LLMError(
                    f"Network error communicating with OpenRouter: {type(exc).__name__}"
                ) from exc
            except LLMError:
                raise

        raise LLMError(f"OpenRouter call failed after retry: {last_exception}")


def get_llm() -> GeminiLLM | OpenRouterLLM:
    """Return the LLM client selected by LLM_PROVIDER."""
    provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
    if provider == "gemini":
        return GeminiLLM()
    if provider == "openrouter":
        return OpenRouterLLM()
    raise LLMError(f"Unsupported LLM_PROVIDER '{provider}'. Use 'gemini' or 'openrouter'.")
