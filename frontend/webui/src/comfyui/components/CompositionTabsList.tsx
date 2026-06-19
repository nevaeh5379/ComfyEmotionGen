import { TabsList, TabsTrigger } from "@/components/ui/tabs"

interface CompositionTabsListProps {
  className?: string
}

export function CompositionTabsList({ className }: CompositionTabsListProps): React.JSX.Element {
  return (
    <TabsList variant="default" className={className}>
      <TabsTrigger value="ceg">템플릿</TabsTrigger>
      <TabsTrigger value="workflow">워크플로우</TabsTrigger>
    </TabsList>
  )
}
