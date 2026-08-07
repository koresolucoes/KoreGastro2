import os
import re

def fix_ts_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = re.sub(
        r"const start = new Date\(startDate\);\s*let endStr = endDate;\s*if \(endDate\.length === 10\) \{\s*endStr = `\$\{endDate\}T23:59:59\.999Z`;\s*\}\s*const end = new Date\(endStr\);",
        r"const [sYear, sMonth, sDay] = startDate.split('-').map(Number);\n    const start = new Date(Date.UTC(sYear, sMonth - 1, sDay, 0, 0, 0, 0));\n    \n    let endStr = endDate;\n    let end;\n    if (endDate.length === 10) {\n        const [eYear, eMonth, eDay] = endDate.split('-').map(Number);\n        end = new Date(Date.UTC(eYear, eMonth - 1, eDay, 23, 59, 59, 999));\n    } else {\n        end = new Date(endDate);\n    }",
        content
    )
    if new_content != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Fixed {path}")

def main():
    fix_ts_file('api/v2/reports.ts')

if __name__ == '__main__':
    main()
