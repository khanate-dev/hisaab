#!/usr/bin/env bash
# Copies <dir> to <prefix>/ in the R2 backup bucket. The bucket's lifecycle rule deletes everything after 30 days
# (docs/infra.md), which is the retention the privacy policy states.
set -euo pipefail
dir=${1:?usage: to-r2.sh <dir> <prefix>}
prefix=${2:?usage: to-r2.sh <dir> <prefix>}
: "${R2_ENDPOINT:?R2_ENDPOINT must be set}" "${R2_BUCKET:?R2_BUCKET must be set}"
export AWS_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID must be set}
export AWS_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY must be set}
export AWS_DEFAULT_REGION=auto
# R2 rejects the checksums newer AWS CLIs add by default.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
aws s3 cp --recursive --only-show-errors --endpoint-url "$R2_ENDPOINT" "$dir" "s3://$R2_BUCKET/$prefix/"
