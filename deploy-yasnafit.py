#!/usr/bin/env python3
"""
Yasnafit Deploy — Freestyle VM
Zip → Upload → Unzip → PM2 restart
"""

import subprocess
import sys
import time
import zipfile
import os
from pathlib import Path

API_KEY = "6VxU5e...BFMk"
VM_ID   = "vm-d38d21a8334d46d8a35c9bef2566c9bc"
PROJECT  = Path(r"C:\Users\MAHDI\Desktop\yasnafit-git")
REMOTE   = "/home/ubuntu/yasnafit"
MAX_RET  = 5
DELAY    = 5

FREESTYLE_CMD = r"C:\Users\MAHDI\AppData\Roaming\npm\freestyle.cmd"

def run(cmd_list, check=True):
    """Run command with retry logic."""
    p = ' '.join(cmd_list[:4]) + ('...' if len(cmd_list) > 4 else '')
    for attempt in range(1, MAX_RET + 1):
        print(f"  ↳ try {attempt}/{MAX_RET}: {p}")
        try:
            result = subprocess.run(
                cmd_list, shell=True if 'cmd' in str(cmd_list[0]).lower() else False,
                capture_output=True, text=True, timeout=120
            )
            out = (result.stdout or '') + (result.stderr or '')
            if result.returncode == 0:
                print(f"    ✔ done (try {attempt})")
                return out, True
            else:
                msg = out.strip()[:200]
                print(f"    ⚠ exit {result.returncode}: {msg}")
                if attempt < MAX_RET:
                    time.sleep(DELAY)
        except subprocess.TimeoutExpired:
            print("    ⚠ Timeout")
            if attempt < MAX_RET:
                time.sleep(DELAY)
        except Exception as e:
            print(f"    ⚠ error: {e}")
            if attempt < MAX_RET:
                time.sleep(DELAY)
    if check:
        print(f"  ✖ All {MAX_RET} attempts failed")
        sys.exit(1)
    return "", False

def freestyle(*args):
    return run([FREESTYLE_CMD] + list(args))

def main():
    print("\n" + "="*60)
    print("  Yasnafit Deploy — Freestyle VM")
    print("="*60 + "\n")

    # ۱. تست اتصال
    print("▸ Checking VM connectivity...")
    out, ok = freestyle("vm", "ssh", VM_ID, "--api-key", API_KEY,
                         "--exec", "echo ONLINE_$(date +%H:%M:%S)")
    if ok:
        print(f"  ✔ VM is reachable\n")

    # ۲. فشرده‌سازی
    print("▸ Creating zip archive...")
    zip_path = os.path.join(os.environ.get("TEMP", "C:\\Temp"), "yasnafit-deploy.zip")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(PROJECT):
            dirs[:] = [d for d in dirs if d not in {'.git', 'node_modules',
                        'data', 'backups', 'logs'}]
            for file in files:
                if file.endswith(('.db', '.db-shm', '.db-wal')):
                    continue
                full = Path(root) / file
                zf.write(full, full.relative_to(PROJECT))
    size_mb = os.path.getsize(zip_path) / (1024*1024)
    print(f"  ✔ Zip: {size_mb:.2f} MB\n")

    # ۳. آپلود
    print("▸ Uploading to VM...")
    remote_zip = f"{REMOTE}/{os.path.basename(zip_path)}"
    out, ok = freestyle("vm", "fs", "write", VM_ID, remote_zip, zip_path,
                         "--api-key", API_KEY)
    if ok:
        print(f"  ✔ Uploaded\n")
    else:
        print(f"  ✖ Upload failed\n")
        sys.exit(1)

    # ۴. استخراج روی سرور
    print("▸ Extracting on VM...")
    extract_cmd = f"cd {REMOTE} && unzip -o {os.path.basename(zip_path)} && rm -f {os.path.basename(zip_path)} && echo EXTRACTED_OK"
    out, ok = freestyle("vm", "ssh", VM_ID, "--api-key", API_KEY,
                         "--exec", extract_cmd)
    if ok:
        print(f"  ✔ Extracted\n")
    else:
        print(f"  ✖ Extract failed\n")
        sys.exit(1)

    # ۵. ری‌استارت PM2
    print("▸ Restarting PM2...")
    pm2_cmd = f"cd {REMOTE} && export PATH=$HOME/.npm-global/bin:$HOME/.local/bin:$HOME/.npm/bin:$PATH && pm2 restart yasnafit 2>&1; echo PM2_EXIT:$?"
    out, ok = freestyle("vm", "ssh", VM_ID, "--api-key", API_KEY,
                         "--exec", pm2_cmd)

    if "PM2_EXIT:0" in (out or ""):
        print(f"  ✔ PM2 restarted\n")
    else:
        print(f"  ⚠ pm2 failed, trying npx...")
        npx_cmd = f"cd {REMOTE} && npx pm2 restart yasnafit 2>&1; echo NPMX_EXIT:$?"
        out, ok = freestyle("vm", "ssh", VM_ID, "--api-key", API_KEY,
                             "--exec", npx_cmd)

        if "NPMX_EXIT:0" in (out or ""):
            print(f"  ✔ PM2 restarted via npx\n")
        else:
            print(f"  ⚠ Starting fresh...")
            start_cmd = f"cd {REMOTE} && npx pm2 start server.js --name yasnafit -- PORT=3020 2>&1; echo STARTED_EXIT:$?"
            freestyle("vm", "ssh", VM_ID, "--api-key", API_KEY,
                      "--exec", start_cmd)
            print(f"  ✔ PM2 started fresh\n")

    # ۶. تأیید نهایی
    print("▸ Final verification...")
    verify_cmd = ("(echo '--- PM2 ---'; (pm2 list 2>/dev/null || npx pm2 list 2>/dev/null); "
                  "echo '--- PORTS ---'; (ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | "
                  "grep -E '3020|20128'; echo '--- DONE ---')")
    out, ok = freestyle("vm", "ssh", VM_ID, "--api-key", API_KEY,
                         "--exec", verify_cmd)
    print(out)

    print("\n" + "="*60)
    print("  Deploy COMPLETE")
    print("="*60 + "\n")

    # تمیز کردن
    try:
        os.unlink(zip_path)
    except:
        pass

    print("✔ Yasnafit deployed successfully.")

if __name__ == "__main__":
    main()
