# Personal AI CTO – Architecture

## Interface Layer
Purpose:
- Accept human commands
- Display system output

Forbidden:
- Business logic
- State storage
- Decision making

## Orchestration Layer
Purpose:
- Route events
- Schedule jobs
- Handle retries

Forbidden:
- Scoring
- Rules
- Intelligence

## Intelligence Layer
Purpose:
- Analyze provided data
- Return structured JSON only

Forbidden:
- State
- Side effects
- Direct user communication

## Execution Layer
Purpose:
- Own system truth
- Enforce rules
- Calculate metrics

Forbidden:
- Natural language reasoning
- Guessing
- Delegating logic to LLMs
