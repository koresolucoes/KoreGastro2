import os
import re

def fix_ts_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'api/rh/ponto.ts' in path:
        new_content = re.sub(
            r"new Date\(data_inicio as string\)\.toISOString\(\)",
            r"new Date((data_inicio as string) + 'T00:00:00').toISOString()",
            content
        )
        new_content = re.sub(
            r"new Date\(data_fim as string \+ 'T23:59:59'\)\.toISOString\(\)",
            r"new Date((data_fim as string) + 'T23:59:59').toISOString()",
            new_content
        )
        if new_content != content:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Fixed {path}")

def main():
    fix_ts_file('api/rh/ponto.ts')

if __name__ == '__main__':
    main()
