import React, { createContext, useState, useCallback } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export interface ConfirmOptions {
  title?: string
  description?: string
  cancelText?: string
  confirmText?: string
  variant?: "default" | "destructive"
}

export interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export { ConfirmContext }

export const ConfirmProvider = ({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element => {
  const [isOpen, setIsOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions>({})
  const [resolveRef, setResolveRef] = useState<
    ((value: boolean) => void) | null
  >(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts)
    setIsOpen(true)
    return new Promise<boolean>((resolve) => {
      setResolveRef(() => resolve)
    })
  }, [])

  const handleCancel = (): void => {
    setIsOpen(false)
    resolveRef?.(false)
  }

  const handleConfirm = (): void => {
    setIsOpen(false)
    resolveRef?.(true)
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options.title ?? "확인"}</AlertDialogTitle>
            <AlertDialogDescription>
              {options.description ?? "계속하시겠습니까?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              {options.cancelText ?? "취소"}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={options.variant ?? "default"}
              onClick={handleConfirm}
            >
              {options.confirmText ?? "확인"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
