#!/bin/sh
# Copies the mention judge out of the image the worker image is built with, to where the worker loads it.
set -eu
cd "$(dirname "$0")/.."
image=$(sed -n 's/^ARG MENTION_JUDGE_IMAGE=//p' ../../docker/Dockerfile)
container=$(docker create "$image" none)
trap 'docker rm "$container" >/dev/null' EXIT
rm -rf mention-judge
docker cp "$container:/mention-judge" mention-judge
echo "Mention judge copied to apps/worker/mention-judge"
