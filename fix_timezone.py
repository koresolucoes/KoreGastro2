import os
import re

def fix_ts_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix reservation-data.service.ts
    if 'reservation-data.service.ts' in path:
        new_content = re.sub(
            r'const startOfDay = new Date\(date\);\s*startOfDay\.setUTCHours\(0, 0, 0, 0\);\s*const endOfDay = new Date\(date\);\s*endOfDay\.setUTCHours\(23, 59, 59, 999\);',
            r"const [year, month, day] = date.split('-').map(Number);\n    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);\n    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);",
            content
        )
        if new_content != content:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Fixed {path}")

    # Fix api/v2/reservations.ts
    elif 'api/v2/reservations.ts' in path:
        new_content = re.sub(
            r"const startOfDay = new Date\(\(date as string\) \+ 'T00:00:00Z'\);\s*const endOfDay = new Date\(\(date as string\) \+ 'T23:59:59\.999Z'\);",
            r"const [year, month, day] = (date as string).split('-').map(Number);\n    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);\n    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);",
            content
        )
        # Also need to fix dayOfWeek to use local instead of UTC
        new_content = re.sub(
            r"const dayOfWeek = startOfDay\.getUTCDay\(\);",
            r"const dayOfWeek = startOfDay.getDay();",
            new_content
        )
        if new_content != content:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Fixed {path}")

    # Fix api/v2/reports.ts
    elif 'api/v2/reports.ts' in path:
        # Check if it has timezone bug
        pass

def main():
    fix_ts_file('src/services/reservation-data.service.ts')
    fix_ts_file('api/v2/reservations.ts')

if __name__ == '__main__':
    main()
