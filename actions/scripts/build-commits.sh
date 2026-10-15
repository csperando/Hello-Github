#!/usr/bin/env bash
# Builds local commits in the current git repo (the canvas) from an array of
# entries as returned by GET /scheduler/due or POST /scheduler/backfill/claim:
#   { github_username, commit_author_email, commit_timestamp, commit_count, ... }
# Each commit appends a line to log.txt, authored as the entry's user and
# dated (author + committer) at its commit_timestamp - GitHub credits a
# contribution to the author date, not the order in history.
#
# Writes every entry back to <results.json> with a "status" of committed or
# failed, keeping all of its other fields, so each workflow can build its own
# completion report. Nothing is pushed here.
#
# usage: build-commits.sh <entries.json> <results.json>
set -euo pipefail

entries_file="$1"
results_file="$2"

git config user.name "commitsforgood-bot"
git config user.email "actions@users.noreply.github.com"

# lightly varied wording rather than identical text on every commit
MESSAGES=("Automated action" "painting" "contribution" "keeping the streak" "🎨")

results_lines=$(mktemp)
count=$(jq 'length' "$entries_file")

for i in $(seq 0 $((count - 1))); do
  entry=$(jq -c ".[$i]" "$entries_file")
  username=$(echo "$entry" | jq -r '.github_username')
  email=$(echo "$entry" | jq -r '.commit_author_email')
  timestamp=$(echo "$entry" | jq -r '.commit_timestamp')
  commit_count=$(echo "$entry" | jq -r '.commit_count')

  status="committed"
  for c in $(seq 1 "$commit_count"); do
    msg="${MESSAGES[$((RANDOM % ${#MESSAGES[@]}))]}"
    echo "$timestamp $username $c" >> log.txt
    git add log.txt
    if ! GIT_AUTHOR_DATE="$timestamp" GIT_COMMITTER_DATE="$timestamp" \
        git commit --author="$username <$email>" -m "$msg" --quiet; then
      status="failed"
      break
    fi
  done

  echo "$entry" | jq -c --arg status "$status" '. + {status: $status}' >> "$results_lines"
done

jq -s '.' "$results_lines" > "$results_file"
rm -f "$results_lines"
