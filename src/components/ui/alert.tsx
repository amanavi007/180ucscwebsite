import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        warning: "border-status-warn-foreground/30 bg-status-warn text-status-warn-foreground [a]:hover:bg-warning/15",
        primary: "border-link/30 bg-accent text-accent-foreground [a]:hover:bg-accent/80",
      },
    },
    defaultVariants: {
      tone: "warning",
    },
  }
)

function Alert({
  className,
  tone = "warning",
  render,
  ...props
}: useRender.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(alertVariants({ tone }), className),
      },
      props
    ),
    render,
    state: {
      slot: "alert",
      tone,
    },
  })
}

export { Alert, alertVariants }
