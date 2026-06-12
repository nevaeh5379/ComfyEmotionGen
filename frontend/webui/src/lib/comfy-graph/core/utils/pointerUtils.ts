export function isMiddleButtonEvent(e: MouseEvent | PointerEvent): boolean {
  return e.button === 1
}

export function isMiddleButtonHeld(e: MouseEvent | PointerEvent): boolean {
  return (e.buttons & 4) === 4
}
