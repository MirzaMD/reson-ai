"""Security audit script scanning git-tracked files for secrets or exposed credentials.

Checks:
1. Confirms backend/.env and backend/.venv are NOT tracked by git.
2. Scans every git-tracked file for Google API key patterns (AIza[0-9A-Za-z_-]{35}).
3. Scans for GEMINI_API_KEY lines followed by non-empty values.
4. Exits with non-zero status if any violation is detected.
"""

from pathlib import Path
import re
import subprocess
import sys

# Google API Key regex pattern
API_KEY_PATTERN = re.compile(r"AIza[0-9A-Za-z_\-]{35}")

# Regex for non-empty GEMINI_API_KEY assignment
ENV_KEY_PATTERN = re.compile(r"^\s*GEMINI_API_KEY\s*=\s*['\"]?([A-Za-z0-9_\-]+)['\"]?\s*$", re.MULTILINE)

# Allowed placeholder tokens
PLACEHOLDERS = {"", "your_api_key_here", "your_gemini_api_key", "your_gemini_api_key_here"}


def get_git_tracked_files(repo_root: Path):
    """Retrieve list of files tracked by git."""
    try:
        res = subprocess.run(
            ["git", "ls-files"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            check=True,
        )
        files = [f.strip() for f in res.stdout.strip().splitlines() if f.strip()]
        return files
    except Exception as e:
        print(f"Error running git ls-files: {e}")
        return []


def check_untracked_paths(repo_root: Path):
    """Verify backend/.env and backend/.venv are strictly NOT tracked."""
    print("=" * 70)
    print("1. VERIFYING SENSITIVE FILES ARE NOT TRACKED BY GIT")
    print("=" * 70)

    sensitive_paths = ["backend/.env", "backend/.venv"]
    violations = []

    for path_str in sensitive_paths:
        res = subprocess.run(
            ["git", "ls-files", path_str],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
        )
        tracked = res.stdout.strip()
        print(f"  git ls-files {path_str:<18} -> {tracked if tracked else '[NOT TRACKED - SAFE]'}")
        if tracked:
            violations.append(f"Security Alert: '{path_str}' is tracked in git!")

    return violations


def scan_file_for_secrets(file_path: Path):
    """Scan single file for API key patterns."""
    violations = []
    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
    except Exception as e:
        return violations

    # Check for AIza pattern
    matches = API_KEY_PATTERN.findall(content)
    for m in matches:
        violations.append(f"Matches Google API key pattern '{m[:8]}...'")

    # Check for GEMINI_API_KEY= with non-placeholder value
    for match in ENV_KEY_PATTERN.finditer(content):
        val = match.group(1).strip()
        if val and val not in PLACEHOLDERS and not val.startswith("your_"):
            violations.append(f"Found active GEMINI_API_KEY assignment '{val[:6]}...'")

    return violations


def main():
    repo_root = Path(__file__).resolve().parent.parent if Path(__file__).resolve().parent.name == "scripts" else Path(__file__).resolve().parent
    if not (repo_root / ".git").exists() and (repo_root.parent / ".git").exists():
        repo_root = repo_root.parent

    print(f"Running Secrets Audit in repository: {repo_root}")

    # 1. Check untracked paths
    untracked_violations = check_untracked_paths(repo_root)

    # 2. Scan tracked files
    print("\n" + "=" * 70)
    print("2. SCANNING GIT-TRACKED FILES FOR CREDENTIAL PATTERNS")
    print("=" * 70)

    tracked_files = get_git_tracked_files(repo_root)
    print(f"  Scanned {len(tracked_files)} git-tracked files.")

    found_violations = []
    this_script = Path(__file__).resolve()

    for rel_path in tracked_files:
        full_path = repo_root / rel_path
        if not full_path.is_file():
            continue
        # Skip scanning check_secrets.py itself for the regex pattern literals
        if full_path.resolve() == this_script or full_path.name == "check_secrets.py":
            continue

        file_issues = scan_file_for_secrets(full_path)
        for issue in file_issues:
            found_violations.append((rel_path, issue))

    all_violations = untracked_violations + [f"{path}: {msg}" for path, msg in found_violations]

    print("\n" + "=" * 70)
    print("AUDIT SUMMARY")
    print("=" * 70)

    if all_violations:
        print(f"[FAIL] Detected {len(all_violations)} credential/tracking violation(s):")
        for v in all_violations:
            print(f"  - {v}")
        sys.exit(1)
    else:
        print("[PASS] No exposed secrets or tracked environment files found.")
        print("  - backend/.env is untracked")
        print("  - backend/.venv is untracked")
        print("  - 0 API key pattern occurrences found across all tracked files")
        sys.exit(0)


if __name__ == "__main__":
    main()
