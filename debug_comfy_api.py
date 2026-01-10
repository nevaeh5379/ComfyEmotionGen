import requests
import json

SERVER_ADDRESS = "127.0.0.1:8188"

def check_comfy_api():
    url = f"http://{SERVER_ADDRESS}/object_info"
    print(f"Connecting to {url}...")
    try:
        response = requests.get(url)
        if response.status_code == 200:
            print("Successfully connected to ComfyUI API.")
            info = response.json()
            
            # Check for LoraLoader
            if "LoraLoader" in info:
                print("\n[SUCCESS] 'LoraLoader' node found.")
                try:
                    loras = info['LoraLoader']['input']['required']['lora_name'][0]
                    print(f"Found {len(loras)} LoRAs.")
                    print("First 5 LoRAs:", loras[:5])
                except Exception as e:
                    print(f"[ERROR] Failed to parse LoraLoader inputs: {e}")
                    print("LoraLoader input structure:", json.dumps(info['LoraLoader']['input'], indent=2))
            else:
                print("\n[FAILURE] 'LoraLoader' node NOT found.")
                # Search for any node with 'Lora' in the name
                print("Searching for other LoRA-related nodes...")
                lora_nodes = [k for k in info.keys() if 'lora' in k.lower()]
                if lora_nodes:
                    print("Found potentially related nodes:", lora_nodes)
                    for node in lora_nodes:
                        try:
                            inputs = info[node].get('input', {}).get('required', {})
                            if 'lora_name' in inputs:
                                print(f"  - Node '{node}' has 'lora_name' input!")
                        except: pass
                else:
                    print("No LoRA-related nodes found.")
                    
        else:
            print(f"Failed to connect. Status Code: {response.status_code}")
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    check_comfy_api()
