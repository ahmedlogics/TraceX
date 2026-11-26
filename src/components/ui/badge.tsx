import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-[#C79C70]",
  {
    variants: {
      variant: {
        default: "border-[#CDBBA8] bg-[#E2C8A8] text-[#2B170E]",
        secondary: "border-[#CDBBA8] bg-[#F2E4D2] text-[#2B170E]",
        destructive: "border-[#BFA894] bg-[#E8D7C2] text-[#2B170E]",
        outline: "border-[#CDBBA8] text-[#2B170E]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
