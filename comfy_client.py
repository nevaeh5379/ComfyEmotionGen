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
        callback: function(type, data) where type is "progress" or "preview"
        """
        if not self.ws:
            self.connect()

        while True:
            out = self.ws.recv()
            if isinstance(out, str):
                message = json.loads(out)
                if message['type'] == 'executing':
                    data = message['data']
                    if data['node'] is None and data['prompt_id'] == prompt_id:
                        # Execution finished for this prompt
                        break
                elif message['type'] == 'progress':
                    data = message['data']
                    if callback: callback("progress", data)
            elif isinstance(out, bytes):
                # Binary data is usually a preview image
                # Offset 8 bytes are usually header (type + data), but standard ComfyUI preview is just JPEG bytes
                # Actually, ComfyUI sends 8 bytes header (uint32 type, uint32 image_type) then image data
                # But simple viewing often works by skipping header if we know it's image
                if callback: callback("preview", out[8:]) # Skip 8 bytes header which ComfyUI sends for binary previews
        
        # Now fetch history to get the image filename
        history_url = f"http://{self.server_address}/history/{prompt_id}"
        with urllib.request.urlopen(history_url) as response:
            history = json.loads(response.read())
            
        # Parse history for outputs
        # Structure: history[prompt_id]['outputs'][node_id]['images'][0]['filename']
        prompt_history = history.get(prompt_id, {})
        outputs = prompt_history.get('outputs', {})
        
        generated_files = []
        for node_id in outputs:
            node_output = outputs[node_id]
            if 'images' in node_output:
                for image in node_output['images']:
                    # Return tuple (filename, subfolder, type)
                    generated_files.append((image.get('filename'), image.get('subfolder', ''), image.get('type', 'output')))
        
        if generated_files:
            return generated_files[0] # Return the first one for simplicity
        return None

    def download_image(self, filename, subfolder, output_path):
        """
        Downloads the image from ComfyUI and saves it to the specified output_path.
        """
        data = {'filename': filename, 'subfolder': subfolder, 'type': 'output'}
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

    def close(self):
        if self.ws:
            self.ws.close()
