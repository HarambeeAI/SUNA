#!/bin/bash
set -e

MAX_ITERATIONS=${1:-10}
SLEEP_SECONDS=${2:-2}

echo "Starting Ralph - Max $MAX_ITERATIONS iterations"
echo ""

for ((i=1; i<=MAX_ITERATIONS; i++)); do
    echo "==========================================="
    echo "  Iteration $i of $MAX_ITERATIONS"
    echo "==========================================="

    PROMPT='You are Ralph, an autonomous coding agent. Do exactly ONE task per iteration.

## Steps

1. Read PRD.md and find the first task that is NOT complete (marked [ ]).
2. Read progress.txt - check the Learnings section first for patterns from previous iterations.
3. Implement that ONE task only.
4. Run tests/typecheck to verify it works.

## Critical: Only Complete If Tests Pass

- If tests PASS:
  - Update PRD.md to mark the task complete (change [ ] to [x])
  - Commit your changes with message: feat: [task description]
  - Append what worked to progress.txt

- If tests FAIL:
  - Do NOT mark the task complete
  - Do NOT commit broken code
  - Append what went wrong to progress.txt (so next iteration can learn)

## Progress Notes Format

Append to progress.txt using this format:

## Iteration [N] - [Task Name]
- What was implemented
- Files changed
- Learnings for future iterations:
  - Patterns discovered
  - Gotchas encountered
  - Useful context
---

## Update AGENTS.md (If Applicable)

If you discover a reusable pattern that future work should know about:
- Check if AGENTS.md exists in the project root
- Add patterns like: '\''This codebase uses X for Y'\'' or '\''Always do Z when changing W'\''
- Only add genuinely reusable knowledge, not task-specific details

## End Condition

After completing your task, check PRD.md:
- If ALL tasks are [x], output exactly: <promise>COMPLETE</promise>
- If tasks remain [ ], just end your response (next iteration will continue)'

    result=$(npx claude --dangerously-skip-permissions -p "$PROMPT" 2>&1) || true

    echo "$result"
    echo ""

    if echo "$result" | grep -q "<promise>COMPLETE</promise>"; then
        echo "==========================================="
        echo "  All tasks complete after $i iterations!"
        echo "==========================================="
        exit 0
    fi

    sleep "$SLEEP_SECONDS"
done

echo "==========================================="
echo "  Reached max iterations ($MAX_ITERATIONS)"
echo "==========================================="
exit 1
