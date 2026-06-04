# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- Correctly installed backend dependencies in the virtual environment
- Started backend FastAPI server with uvicorn
- Started frontend development server

## [1.0.0] - 2026-03-16

### Added

- Initial FastAPI backend implementation
- `/api/health`, `/api/transcribe`, and `/api/process-text` endpoints
- faster-whisper transcription pipeline with word-level timestamps
- Ollama-based text processing with rule-based fallback
- Startup orchestration and environment-based configuration
