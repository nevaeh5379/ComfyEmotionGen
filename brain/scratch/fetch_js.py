import urllib.request

url = "https://raw.githubusercontent.com/yolain/ComfyUI-Easy-Use/main/web_version/v2/easyuse.js"
with urllib.request.urlopen(url) as response:
    content = response.read().decode('utf-8')

with open("/home/jihoon/.gemini/antigravity-cli/brain/7c1b2559-a9d6-484c-85a1-6d98dd8c102c/scratch/easyuse.js", "w") as f:
    f.write(content)

print("Downloaded successfully.")
