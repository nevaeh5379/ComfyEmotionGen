import json, uuid, websocket, urllib.request, sys, datetime, pathlib, argparse, struct

SERVER = "127.0.0.1:8188"

def queue_prompt(workflow, client_id):
    body = json.dumps({"prompt": workflow, "client_id": client_id}).encode()
    req = urllib.request.Request(f"http://{SERVER}/prompt", data=body,
                                  headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workflow", nargs="?", help="workflow_api.json path (없으면 수신만)")
    ap.add_argument("--out", default="dumps", help="덤프 폴더")
    ap.add_argument("--save-binary", action="store_true", help="바이너리 프레임도 파일로 저장")
    args = ap.parse_args()

    client_id = str(uuid.uuid4())
    out_dir = pathlib.Path(args.out)
    out_dir.mkdir(exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    jsonl_path = out_dir / f"ws-{stamp}.jsonl"
    bin_dir = out_dir / f"ws-{stamp}-bin"

    ws = websocket.WebSocket()
    ws.connect(f"ws://{SERVER}/ws?clientId={client_id}")
    print(f"[connected] clientId={client_id}", file=sys.stderr)
    print(f"[dump] {jsonl_path}", file=sys.stderr)

    prompt_id = None
    if args.workflow:
        with open(args.workflow, encoding="utf-8") as f:
            workflow = json.load(f)
        
        workflow["1"]["inputs"]["seed"] = 1234
        result = queue_prompt(workflow, client_id)
        prompt_id = result.get("prompt_id")
        print(f"[queued] prompt_id={prompt_id}", file=sys.stderr)


        workflow["1"]["inputs"]["seed"] = 12342
        result2 = queue_prompt(workflow, client_id)
        prompt_id2 = result2.get("prompt_id")
        print(f"[queued again] prompt_id={prompt_id2}", file=sys.stderr)

    frame_idx = 0
    with open(jsonl_path, "w", encoding="utf-8") as f:
        try:
            while True:
                msg = ws.recv()
                ts = datetime.datetime.now().isoformat()
                if isinstance(msg, str):
                    parsed = json.loads(msg)
                    entry = {"ts": ts, "idx": frame_idx, "kind": "text",
                             "type": parsed.get("type"), "msg": parsed}
                    # 터미널: 한 줄 요약
                    print(f"#{frame_idx:04d} [{ts[11:19]}] {parsed.get('type')}")
                    # 디테일은 파일에
                    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
                else:
                    # 바이너리: 앞 8바이트는 보통 event_type(4) + format(4)
                    header = msg[:8] if len(msg) >= 8 else msg
                    event_type = struct.unpack(">I", msg[:4])[0] if len(msg) >= 4 else None
                    img_format = struct.unpack(">I", msg[4:8])[0] if len(msg) >= 8 else None
                    entry = {"ts": ts, "idx": frame_idx, "kind": "binary",
                             "size": len(msg), "header_hex": header.hex(),
                             "event_type": event_type, "format": img_format}
                    print(f"#{frame_idx:04d} [{ts[11:19]}] <binary {len(msg)}B "
                          f"event={event_type} fmt={img_format}>")
                    if args.save_binary:
                        bin_dir.mkdir(exist_ok=True)
                        (bin_dir / f"{frame_idx:04d}.bin").write_bytes(msg)
                        entry["saved"] = str(bin_dir / f"{frame_idx:04d}.bin")
                    f.write(json.dumps(entry) + "\n")
                f.flush()
                frame_idx += 1
        except KeyboardInterrupt:
            print(f"\n[done] {frame_idx} frames captured", file=sys.stderr)
        finally:
            ws.close()

if __name__ == "__main__":
    main()