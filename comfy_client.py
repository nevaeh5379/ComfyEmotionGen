import json
import urllib.request
import urllib.parse
import requests
import websocket # pip install websocket-client
import uuid

class ComfyClient:
    def __init__(self, server_address="127.0.0.1:8188"):
        self.server_address = server_address
        self.client_id = str(uuid.uuid4())
        self.ws = None

    def connect(self):
        self.ws = websocket.WebSocket()
        self.ws.connect(f"ws://{self.server_address}/ws?clientId={self.client_id}")

    def upload_image(self, file_path):
        """
        Uploads an image to ComfyUI.
        Returns the filename that ComfyUI saved it as.
        """
        url = f"http://{self.server_address}/upload/image"
        
        with open(file_path, 'rb') as f:
            files = {'image': f}
            # ComfyUI upload endpoint expects 'image' field
            # You can also pass 'subfolder' and 'type' if needed, but defaults are usually fine for temp use
            data = {'overwrite': 'true'} 
            response = requests.post(url, files=files, data=data)
        
        if response.status_code == 200:
            response_data = response.json()
            # Depending on ComfyUI version, it returns 'name' or similar.
            # Typical response: {"name": "filename.png", "subfolder": "", "type": "input"}
            return response_data.get('name')
        else:
            raise Exception(f"Failed to upload image: {response.status_code} - {response.text}")

    def queue_prompt(self, workflow_json):
        """
        Sends the workflow to be executed.
        Returns the prompt_id.
        """
        p = {"prompt": workflow_json, "client_id": self.client_id}
        data = json.dumps(p).encode('utf-8')
        req = urllib.request.Request(f"http://{self.server_address}/prompt", data=data)
        with urllib.request.urlopen(req) as response:
            response_data = json.loads(response.read())
            return response_data['prompt_id']

    def wait_for_result(self, prompt_id, callback=None):
        """
        Listens to the websocket for the execution completion of the specific prompt_id.
        Returns the filename of the generated image(s).
        callback: function(type, data) where type is "progress", "preview", or "status"
        """
        if not self.ws:
            self.connect()

        while True:
            out = self.ws.recv()
            if isinstance(out, str):
                message = json.loads(out)
                msg_type = message.get('type', '')
                data = message.get('data', {})
                
                print(f"DEBUG WS: type={msg_type}, prompt_id in data={data.get('prompt_id')}, our prompt_id={prompt_id}")
                
                if msg_type == 'executing':
                    if data.get('node') is None and data.get('prompt_id') == prompt_id:
                        # Execution finished for this prompt
                        print("DEBUG WS: Execution finished (executing with node=None)")
                        break
                elif msg_type == 'execution_success':
                    # Alternative completion signal (newer ComfyUI versions)
                    if data.get('prompt_id') == prompt_id:
                        print("DEBUG WS: Execution success signal received")
                        break
                elif msg_type == 'execution_error':
                    # Error occurred during execution
                    if data.get('prompt_id') == prompt_id:
                        print(f"DEBUG WS: Execution ERROR: {data}")
                        if callback: 
                            callback("status", {"error": data.get('exception_message', 'Unknown error')})
                        break
                elif msg_type == 'execution_cached':
                    # Workflow was cached - DON'T break here!
                    # Wait for the actual executing with node=None signal
                    print(f"DEBUG WS: Execution cached (continuing to wait for completion signal)")
                    # Don't break - continue waiting for the final execution status
                elif msg_type == 'progress':
                    if callback: callback("progress", data)
                elif msg_type == 'status':
                    # Status updates (queue info, etc.)
                    if callback: callback("status", data)
            elif isinstance(out, bytes):
                # Binary data is usually a preview image
                if callback: callback("preview", out[8:])
        
        # Now fetch history to get the image filename
        history_url = f"http://{self.server_address}/history/{prompt_id}"
        print(f"DEBUG: Fetching history from {history_url}")
        with urllib.request.urlopen(history_url) as response:
            history = json.loads(response.read())
        
        print(f"DEBUG: History keys: {list(history.keys())}")
        
        # Parse history for outputs
        prompt_history = history.get(prompt_id, {})
        print(f"DEBUG: prompt_history keys: {list(prompt_history.keys())}")
        outputs = prompt_history.get('outputs', {})
        print(f"DEBUG: outputs node_ids: {list(outputs.keys())}")
        
        generated_files = []
        for node_id in outputs:
            node_output = outputs[node_id]
            print(f"DEBUG: Node {node_id} output keys: {list(node_output.keys())}")
            if 'images' in node_output:
                for image in node_output['images']:
                    print(f"DEBUG: Found image: {image}")
                    generated_files.append((image.get('filename'), image.get('subfolder', ''), image.get('type', 'output')))
        
        print(f"DEBUG: generated_files = {generated_files}")
        if generated_files:
            return generated_files[0]
        return None

    def download_image(self, filename, subfolder, output_path, image_type='output'):
        """
        Downloads the image from ComfyUI and saves it to the specified output_path.
        """
        data = {'filename': filename, 'subfolder': subfolder, 'type': image_type}
        url_values = urllib.parse.urlencode(data)
        url = f"http://{self.server_address}/view?{url_values}"
        
        with urllib.request.urlopen(url) as response:
            data = response.read()
            with open(output_path, 'wb') as f:
                f.write(data)

    def interrupt(self):
        """
        Interrupts the current execution on ComfyUI.
        """
        url = f"http://{self.server_address}/interrupt"
        try:
            requests.post(url)
        except Exception as e:
            print(f"Failed to interrupt: {e}")

    def get_object_info(self):
        """
        Fetches the object info from ComfyUI (definitions of nodes including available models).
        Returns dict.
        """
        url = f"http://{self.server_address}/object_info"
        try:
            response = requests.get(url)
            if response.status_code == 200:
                return response.json()
        except Exception as e:
            print(f"Failed to fetch object info: {e}")
            return {}
        return {}

    def get_loras(self):
        """
        Fetches the list of available LoRAs from ComfyUI.
        """
        info = self.get_object_info()
        if 'LoraLoader' in info:
            try:
                # Standard ComfyUI structure: node_info['input']['required']['lora_name'][0] is the list
                return info['LoraLoader']['input']['required']['lora_name'][0]
            except Exception as e:
                print(f"Error parsing LoRA list: {e}")
                return []
        return []
            
    def close(self):
        if self.ws:
            self.ws.close()
