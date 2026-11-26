import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C79C70] disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.99]",
  {
    variants: {
      variant: {
        default:
          "bg-[#D8B68F] text-[#2B170E] font-bold border border-[#CDBBA8] shadow-2xs hover:bg-[#C79C70] hover:border-[#BFA894]",
        destructive:
          "bg-[#8C5348] text-[#FFFDFC] font-semibold border border-[#7A453B] shadow-2xs hover:bg-[#7A453B]",
        outline:
          "border border-[#CDBBA8] bg-[#FFFDFC] text-[#2B170E] font-medium shadow-2xs hover:bg-[#F2E4D2] hover:text-[#2B170E]",
        secondary:
          "border border-[#CDBBA8] bg-[#F2E4D2] text-[#2B170E] font-medium shadow-2xs hover:bg-[#E2C8A8]",
        ghost:
          "text-[#2B170E] font-medium hover:bg-[#F2E4D2] hover:text-[#2B170E]",
        link:
          "text-[#6E5748] font-medium underline-offset-4 hover:underline hover:text-[#2B170E]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-lg px-8",
        icon: "h-9 w-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
