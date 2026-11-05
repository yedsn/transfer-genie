#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
对同一个 GitHub Release 文件进行 curl 单连接与 aria2c 多连接下载对比。

用法：
  ./scripts/release/benchmark_github_download.sh <下载地址> [选项]

选项：
  --proxy <URL>    两种下载方式共用的代理，例如 http://127.0.0.1:7890
                   默认读取 GITEE_SYNC_PROXY
  --rounds <次数>  每种方式测试次数，默认 2；脚本会交替执行顺序
  --keep           保留下载文件和 CSV 结果
  -h, --help       显示帮助

示例：
  GITEE_SYNC_PROXY=http://127.0.0.1:7890 \
    ./scripts/release/benchmark_github_download.sh \
    'https://github.com/OWNER/REPO/releases/download/v1.0.0/app.zip'
EOF
}

download_url=""
proxy_url="${GITEE_SYNC_PROXY:-}"
rounds=2
keep_files=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --proxy)
      [[ $# -ge 2 ]] || { echo "错误：--proxy 缺少 URL。" >&2; exit 2; }
      proxy_url="$2"
      shift 2
      ;;
    --rounds)
      [[ $# -ge 2 ]] || { echo "错误：--rounds 缺少次数。" >&2; exit 2; }
      rounds="$2"
      shift 2
      ;;
    --keep)
      keep_files=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "错误：未知选项 $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [[ -n "$download_url" ]]; then
        echo "错误：只能指定一个下载地址。" >&2
        exit 2
      fi
      download_url="$1"
      shift
      ;;
  esac
done

[[ -n "$download_url" ]] || { usage >&2; exit 2; }
[[ "$rounds" =~ ^[1-9][0-9]*$ ]] || { echo "错误：--rounds 必须是正整数。" >&2; exit 2; }

for command_name in curl aria2c awk; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "错误：缺少命令 $command_name。" >&2
    exit 1
  }
done

if command -v sha256sum >/dev/null 2>&1; then
  sha256_file() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  sha256_file() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  echo "错误：缺少 sha256sum 或 shasum。" >&2
  exit 1
fi

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/github-download-benchmark.XXXXXX")"
results_file="$work_dir/results.csv"
echo "method,round,seconds,bytes,mb_per_second,sha256" > "$results_file"

cleanup() {
  if [[ "$keep_files" == true ]]; then
    echo "测试文件已保留：$work_dir"
  else
    rm -rf -- "$work_dir"
  fi
}
trap cleanup EXIT

now_ns() {
  local value
  value="$(date +%s%N 2>/dev/null || true)"
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$value"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import time; print(time.time_ns())'
  else
    echo "错误：系统不支持纳秒计时，并且没有 python3。" >&2
    exit 1
  fi
}

record_result() {
  local method="$1"
  local round="$2"
  local output_file="$3"
  local started_ns="$4"
  local finished_ns bytes sha256 metrics seconds speed

  finished_ns="$(now_ns)"
  bytes="$(wc -c < "$output_file" | tr -d ' ')"
  sha256="$(sha256_file "$output_file")"
  metrics="$(awk -v start="$started_ns" -v finish="$finished_ns" -v size="$bytes" 'BEGIN { seconds=(finish-start)/1000000000; if (seconds <= 0) seconds=0.000001; printf "%.3f %.3f", seconds, size/1024/1024/seconds }')"
  read -r seconds speed <<< "$metrics"
  echo "$method,$round,$seconds,$bytes,$speed,$sha256" >> "$results_file"
  printf '%-6s 第 %s 轮：%8.3f 秒，%8.3f MiB/s，%s 字节\n' "$method" "$round" "$seconds" "$speed" "$bytes"
}

run_with_clean_proxy_environment() {
  env \
    -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
    -u http_proxy -u https_proxy -u all_proxy \
    -u NO_PROXY -u no_proxy \
    "$@"
}

run_curl() {
  local round="$1"
  local output_file="$work_dir/curl-$round.bin"
  local started_ns
  local -a command=(
    curl --fail --location --silent --show-error
    --connect-timeout 30 --max-time 1800 --retry 0
    --output "$output_file"
  )
  [[ -z "$proxy_url" ]] || command+=(--proxy "$proxy_url")
  command+=("$download_url")

  started_ns="$(now_ns)"
  run_with_clean_proxy_environment "${command[@]}"
  record_result curl "$round" "$output_file" "$started_ns"
}

run_aria2() {
  local round="$1"
  local output_name="aria2-$round.bin"
  local output_file="$work_dir/$output_name"
  local started_ns
  local -a command=(
    aria2c
    --dir="$work_dir"
    --out="$output_name"
    --allow-overwrite=true
    --auto-file-renaming=false
    --file-allocation=none
    --split=4
    --max-connection-per-server=4
    --min-split-size=1M
    --max-tries=1
    --summary-interval=0
    --console-log-level=warn
  )
  [[ -z "$proxy_url" ]] || command+=(--all-proxy="$proxy_url")
  command+=("$download_url")

  started_ns="$(now_ns)"
  run_with_clean_proxy_environment "${command[@]}"
  record_result aria2 "$round" "$output_file" "$started_ns"
}

echo "下载地址主机：$(printf '%s' "$download_url" | sed -E 's#^[a-zA-Z]+://([^/]+).*#\1#')"
proxy_display="${proxy_url:-未配置，两种方式均直连}"
if [[ -n "$proxy_url" ]]; then
  proxy_display="$(printf '%s' "$proxy_url" | sed -E 's#(://)[^/@]+@#\1***:***@#')"
fi
echo "代理：$proxy_display"
echo "轮数：每种方式 $rounds 次；奇数轮先 curl，偶数轮先 aria2，降低执行顺序偏差。"
echo

for ((round=1; round<=rounds; round++)); do
  if ((round % 2 == 1)); then
    run_curl "$round"
    run_aria2 "$round"
  else
    run_aria2 "$round"
    run_curl "$round"
  fi
done

echo
echo "完整性检查："
unique_sizes="$(awk -F, 'NR>1 {print $4}' "$results_file" | sort -u | wc -l | tr -d ' ')"
unique_hashes="$(awk -F, 'NR>1 {print $6}' "$results_file" | sort -u | wc -l | tr -d ' ')"
if [[ "$unique_sizes" != 1 || "$unique_hashes" != 1 ]]; then
  echo "失败：下载结果的文件大小或 SHA-256 不一致，请不要比较速度。" >&2
  column -s, -t "$results_file" 2>/dev/null || cat "$results_file"
  exit 1
fi
echo "通过：所有下载文件大小和 SHA-256 完全一致。"

echo
echo "平均结果："
awk -F, 'NR>1 {count[$1]++; seconds[$1]+=$3; speed[$1]+=$5} END {for (method in count) printf "%-6s 平均耗时：%8.3f 秒，平均速度：%8.3f MiB/s\n", method, seconds[method]/count[method], speed[method]/count[method]}' "$results_file" | sort

curl_speed="$(awk -F, '$1=="curl" {total+=$5; count++} END {if (count) printf "%.6f", total/count}' "$results_file")"
aria2_speed="$(awk -F, '$1=="aria2" {total+=$5; count++} END {if (count) printf "%.6f", total/count}' "$results_file")"
ratio="$(awk -v curl_speed="$curl_speed" -v aria2_speed="$aria2_speed" 'BEGIN {if (curl_speed > 0) printf "%.2f", aria2_speed/curl_speed; else print "N/A"}')"
echo "aria2 / curl 平均速度倍率：${ratio}x"

if [[ "$keep_files" == true ]]; then
  echo "详细结果：$results_file"
fi
