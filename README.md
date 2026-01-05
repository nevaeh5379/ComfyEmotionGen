# ComfyEmotionGen

A desktop application to generate character emotion assets using ComfyUI.

## Features
- **Batch Generation:** Generate multiple emotions with specific prompts in one go.
- **Workflow Automation:** Automatically handles Seed, Prompts, and IP-Adapter reference images.
- **Gallery:** Review generated assets and select favorites.

## Prerequisites
1.  **ComfyUI:** Must be running locally at `127.0.0.1:8188`.
2.  **Python 3.10+**

## Setup
1.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

2.  Ensure `workflow.json` is in this folder.

## Usage
1.  Run the application:
    ```bash
    python gui_main.py
    ```
2.  **Settings (Left Panel):**
    -   Enter Character Name.
    -   Select Reference Image (for IP-Adapter).
    -   Set Base Prompt (keep `#emotion#` placeholder).
3.  **Emotions (Right Panel):**
    -   Add rows for each emotion you want (e.g., Name: "Happy", Prompt: "smile, closed eyes").
4.  Click **Generate Assets**.
5.  Go to **Gallery/Review** tab to view results and organize favorites.
