"use client"

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"

import { cn } from "@/lib/utils"

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return <AccordionPrimitive.Root data-slot="accordion" className={cn(className)} {...props} />
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b border-foreground/10 last:border-b-0", className)}
      {...props}
    />
  )
}

function AccordionTrigger({ className, children, ...props }: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group flex flex-1 items-center gap-3 py-5 text-left text-base font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          className,
        )}
        {...props}
      >
        {children}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionPanel({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-panel"
      className={cn(
        "h-(--accordion-panel-height) overflow-hidden text-sm transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0",
        className,
      )}
      {...props}
    >
      <div className="pb-5">{children}</div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionPanel }
