import json
import random
import copy

def prepare_workflow(base_json, character_name, base_prompt, emotion_name, emotion_prompt, ref_image_filename, seed=None, 
                     sampler1_name="dpmpp_3m_sde", scheduler1="simple", 
                     sampler2_name="dpmpp_3m_sde", scheduler2="simple", 
                     upscale_factor=1.5,
                     ref_enabled=True, ref_settings=None,
                     width=896, height=1152,
                     bypass_sage_attn=False,
                     ckpt_name=None,
                     ipadapter_model=None,
                     clip_vision_model=None):
    """
    Modifies the workflow JSON based on inputs.
    """
    workflow = copy.deepcopy(base_json)

    # 1. Node 60 (Seed Everywhere): inputs.seed -> Random Int or Fixed
    if seed is None or seed == -1:
        seed = random.randint(1, 100000000000000)
    
    if "60" in workflow:
        workflow["60"]["inputs"]["seed"] = seed

    # 2. Node 61 (PrimitiveString): inputs.value -> emotion_name
    if "61" in workflow:
        workflow["61"]["inputs"]["value"] = emotion_name

    # 3. Node 62 (PrimitiveStringMultiline): inputs.value -> emotion_prompt
    if "62" in workflow:
        workflow["62"]["inputs"]["value"] = emotion_prompt

    # 4. Node 64 (PrimitiveStringMultiline): inputs.value -> base_prompt
    if "64" in workflow:
        workflow["64"]["inputs"]["value"] = base_prompt

    # 5. Reference Node Logic (Node 59:38 - IPAdapterFaceID)
    if ref_enabled and ref_image_filename and "59:38" in workflow:
        # Enable Reference
        # Ensure image is set
        if "65" in workflow:
            workflow["65"]["inputs"]["image"] = ref_image_filename
        
        # Apply settings if provided
        if ref_settings:
            node = workflow["59:38"]["inputs"]
            node["weight"] = ref_settings.get("weight", 1.0)
            node["weight_faceidv2"] = ref_settings.get("weight_faceidv2", 1.0)
            node["weight_type"] = ref_settings.get("weight_type", "linear")
            node["combine_embeds"] = ref_settings.get("combine_embeds", "add")
            node["start_at"] = ref_settings.get("start_at", 0.0)
            node["end_at"] = ref_settings.get("end_at", 1.0)
            node["embeds_scaling"] = ref_settings.get("embeds_scaling", "V only")
            
        # Ensure connection: 59:38 outputs to 59:15 (Sage Attention)
        if "59:15" in workflow:
            workflow["59:15"]["inputs"]["model"] = ["59:38", 0]
            
    else:
        # Disable/Bypass Reference
        # We need to bypass Node 59:38.
        # Node 59:38 inputs 'model' from 59:11 (Checkpoint).
        # Node 59:38 outputs 'model' to 59:15 (Sage Attention).
        # So we connect 59:11 directly to 59:15.
        if "59:15" in workflow:
            workflow["59:15"]["inputs"]["model"] = ["59:11", 0]

    # 6. Sampler 1 (Node 59:13)
    if "59:13" in workflow:
        workflow["59:13"]["inputs"]["sampler_name"] = sampler1_name
        workflow["59:13"]["inputs"]["scheduler"] = scheduler1

    # 7. Sampler 2 (Node 59:19)
    if "59:19" in workflow:
        workflow["59:19"]["inputs"]["sampler_name"] = sampler2_name
        workflow["59:19"]["inputs"]["scheduler"] = scheduler2

    # 8. Base Resolution (Node 59:18 - EmptyLatentImage)
    if "59:18" in workflow:
        workflow["59:18"]["inputs"]["width"] = width
        workflow["59:18"]["inputs"]["height"] = height

    # 9. Upscale (Node 59:56) - ImageScale
    # Calculate target dimensions based on base latent size
    target_width = int(width * upscale_factor)
    target_height = int(height * upscale_factor)
    
    if "59:56" in workflow:
        workflow["59:56"]["inputs"]["width"] = target_width
        workflow["59:56"]["inputs"]["height"] = target_height

    # 10. Output Path Logic (Node 59:28): inputs.string
    if "59:28" in workflow:
        clean_char_name = "".join([c for c in character_name if c.isalnum() or c in (' ', '_', '-')]).strip()
        new_path_string = f"{clean_char_name}/{{{{emotion_name}}}}/result_{{{{emotion_name}}}}"
        workflow["59:28"]["inputs"]["string"] = new_path_string
        
    # 11. Sage Attention Bypass Logic
    if bypass_sage_attn:
        # We need to bypass Node 59:15 (PathchSageAttentionKJ)
        # Node 59:13 (1st Sampler) and 59:19 (2nd Sampler) take input 'model' from 59:15
        
        # Determine the source model for 59:15
        source_model = None
        if "59:15" in workflow:
             source_model = workflow["59:15"]["inputs"]["model"]
             
        if source_model:
            # Re-route samplers to use source_model directly
            if "59:13" in workflow:
                workflow["59:13"]["inputs"]["model"] = source_model
            if "59:19" in workflow:
                workflow["59:19"]["inputs"]["model"] = source_model

    # 12. Checkpoint Logic (Node 59:11 - CheckpointLoaderSimple)
    if ckpt_name and "59:11" in workflow:
        workflow["59:11"]["inputs"]["ckpt_name"] = ckpt_name

    # 13. IPAdapter Model Logic (Node 59:41 - IPAdapterModelLoader)
    if ipadapter_model and "59:41" in workflow:
        workflow["59:41"]["inputs"]["ipadapter_file"] = ipadapter_model

    # 14. CLIP Vision Model Logic (Node 59:40 - CLIPVisionLoader)
    if clip_vision_model and "59:40" in workflow:
        workflow["59:40"]["inputs"]["clip_name"] = clip_vision_model

    return workflow, seed
