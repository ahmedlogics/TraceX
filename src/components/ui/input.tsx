import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg border border-[#CDBBA8] bg-[#FFFDFC] px-3 py-1 text-sm text-[#2B170E] shadow-2xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[#2B170E] placeholder:text-[#6E5748]/60 focus-visible:outline-none focus-visible:border-[#C79C70] focus-visible:ring-1 focus-visible:ring-[#D8B68F] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
