from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import time
from pathlib import Path
import os
import json
from typing import Literal

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LOG_DIR = Path("/var/log/remote")
SERVER_HOSTNAME = "rhel"  # Change this to your server's hostname
PORT = 8000

def detect_severity(line: str) -> Literal['error', 'warning', 'info', 'debug']:
    """Classify log severity based on content"""
    line_lower = line.lower()
    if any(word in line_lower for word in ['error', 'exception', 'critical', 'fail', 'fatal']):
        return 'error'
    elif any(word in line_lower for word in ['warn', 'alert', 'notice']):
        return 'warning'
    elif any(word in line_lower for word in ['debug', 'trace', 'verbose']):
        return 'debug'
    return 'info'

def get_recent_logs(last_n: int = 100, minutes: int = 5):
    """Get recent logs with proper time filtering"""
    cutoff_time = time.time() - (minutes * 60) if minutes > 0 else 0
    all_logs = []
    
    for log_file in LOG_DIR.glob("*.log"):
        # Skip server logs
        if log_file.stem == SERVER_HOSTNAME:
            continue
            
        try:
            with open(log_file, 'r') as f:
                # Read all lines first
                lines = f.readlines()
                
                # Filter by time if needed
                filtered_lines = []
                for line in lines:
                    if line.strip():
                        log_time = os.path.getmtime(log_file)
                        if minutes == 0 or log_time >= cutoff_time:
                            filtered_lines.append({
                                'host': log_file.stem,
                                'message': line.strip(),
                                'timestamp': log_time,
                                'severity': detect_severity(line)
                            })
                
                # Take the last N logs (newest first)
                recent_logs = filtered_lines[-last_n:] if last_n > 0 else filtered_lines
                all_logs.extend(recent_logs)
        except Exception as e:
            print(f"Error reading {log_file}: {e}")

    # Sort all logs by timestamp (oldest first)
    return sorted(all_logs, key=lambda x: x['timestamp'])

def stream_logs(last_n: int = 100, minutes: int = 5):
    """Generator that yields log lines with proper filtering"""
    # First send initial batch of recent logs (sorted oldest to newest)
    initial_logs = get_recent_logs(last_n, minutes)
    for log in initial_logs:
        yield f"data: {json.dumps(log)}\n\n"

    # Then continue with live updates
    file_positions = {}
    cutoff_time = time.time() - (minutes * 60) if minutes > 0 else 0
    
    while True:
        for log_file in LOG_DIR.glob("*.log"):
            # Skip server logs
            if log_file.stem == SERVER_HOSTNAME:
                continue
                
            if log_file not in file_positions:
                file_positions[log_file] = 0

            try:
                current_size = os.path.getsize(log_file)
                if current_size > file_positions[log_file]:
                    with open(log_file, 'r') as f:
                        f.seek(file_positions[log_file])
                        new_lines = f.readlines()
                        file_positions[log_file] = f.tell()

                        for line in new_lines:
                            if line.strip():
                                log_time = time.time()
                                if minutes == 0 or log_time >= cutoff_time:
                                    log_data = {
                                        'host': log_file.stem,
                                        'message': line.strip(),
                                        'timestamp': log_time,
                                        'severity': detect_severity(line)
                                    }
                                    yield f"data: {json.dumps(log_data)}\n\n"
            except Exception as e:
                print(f"Error reading {log_file}: {e}")

        time.sleep(0.1)

@app.get("/stream-logs")
async def log_stream(
    last_n: int = Query(100, description="Number of recent logs to return initially"),
    minutes: int = Query(5, description="Max age of logs in minutes (0 for all)")
):
    return StreamingResponse(
        stream_logs(last_n, minutes),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*"
        }
    )

@app.get("/log-stats")
async def log_stats(minutes: int = Query(5, description="Max age of logs in minutes (0 for all)")):
    """Endpoint to get current log statistics, excluding server logs"""
    stats = {
        'total': 0,
        'errors': 0,
        'warnings': 0,
        'hosts': set()
    }
    cutoff_time = time.time() - (minutes * 60) if minutes > 0 else 0

    for log_file in LOG_DIR.glob("*.log"):
        # Skip server logs
        if log_file.stem == SERVER_HOSTNAME:
            continue
            
        try:
            with open(log_file, 'r') as f:
                for line in f:
                    if line.strip():
                        log_time = os.path.getmtime(log_file)
                        if minutes == 0 or log_time >= cutoff_time:
                            stats['total'] += 1
                            severity = detect_severity(line)
                            if severity == 'error':
                                stats['errors'] += 1
                            elif severity == 'warning':
                                stats['warnings'] += 1
                            stats['hosts'].add(log_file.stem)
        except Exception as e:
            print(f"Error processing stats for {log_file}: {e}")

    return {
        'total_logs': stats['total'],
        'error_logs': stats['errors'],
        'warning_logs': stats['warnings'],
        'unique_hosts': len(stats['hosts'])
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
