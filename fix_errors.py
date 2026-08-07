import os
import re
import glob

def refactor_error_format(content):
    # Regex to find res.status(XYZ).json({ error: ... })
    # We want to replace it with res.status(XYZ).json({ type: "about:blank", title: "...", status: XYZ, detail: "..." })

    # Helper function for replacement
    def replacer(match):
        status_code = match.group(1)
        json_content = match.group(2)
        
        # Try to extract the message
        # Pattern 1: { error: { message: '...' } } or "..." or `...`
        msg_match = re.search(r"message\s*:\s*(['\"`].*?['\"`])(?=\s*}|\s*,)", json_content, flags=re.DOTALL)
        
        # Pattern 2: { error: '...' }
        if not msg_match:
            msg_match = re.search(r"error\s*:\s*(['\"`].*?['\"`])(?=\s*}|\s*,)", json_content, flags=re.DOTALL)
            
        # Pattern 3: error.message
        if not msg_match:
            msg_match = re.search(r"message\s*:\s*([^,{}]+)(?=\s*}|\s*,)", json_content, flags=re.DOTALL)
            
        if not msg_match:
            msg_match = re.search(r"error\s*:\s*([^,{}]+)(?=\s*}|\s*,)", json_content, flags=re.DOTALL)

        if msg_match:
            msg = msg_match.group(1).strip()
            
            # Determine title based on status
            title = "Error"
            if status_code == '400': title = "Bad Request"
            elif status_code == '401': title = "Unauthorized"
            elif status_code == '403': title = "Forbidden"
            elif status_code == '404': title = "Not Found"
            elif status_code == '405': title = "Method Not Allowed"
            elif status_code == '409': title = "Conflict"
            elif status_code == '500': title = "Internal Server Error"
            
            return f'res.status({status_code}).json({{ type: "about:blank", title: "{title}", status: {status_code}, detail: {msg} }})'
        
        return match.group(0) # fallback

    # We need to handle both `res.status` and `response.status`
    new_content = re.sub(r'(?:res|response)\.status\(\s*(\d+)\s*\)\.json\(\s*\{\s*(error\s*:.*?)\}\s*\)', replacer, content, flags=re.DOTALL)
    return new_content

def main():
    api_dir = 'api'
    for root, dirs, files in os.walk(api_dir):
        for file in files:
            if file.endswith('.ts') or file.endswith('.js'):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                new_content = refactor_error_format(content)
                if new_content != content:
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Updated {path}")

if __name__ == '__main__':
    main()
