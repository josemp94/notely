#!/bin/sh
cd /home/jose/Projects/notely || exit 1
export PATH="$HOME/.local/bin:$PATH"
echo "START $(date)" > .dobby-run.log
claude -p "$(cat .dobby-task.md)" --dangerously-skip-permissions >> .dobby-run.log 2>&1
echo "EXIT $? $(date)" >> .dobby-run.log
