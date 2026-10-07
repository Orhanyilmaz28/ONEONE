"use client";

import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { PlusIcon } from "./icons";

export function Accordion({ items }: { items: { title: string; content: ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="divide-y divide-line border-line border-y">
      {items.map((item, i) => (
        <div key={item.title}>
          <button
            aria-expanded={open === i}
            className="flex w-full items-center justify-between py-5 text-left font-medium"
            onClick={() => setOpen(open === i ? null : i)}
            type="button"
          >
            {item.title}
            <motion.span animate={{ rotate: open === i ? 45 : 0 }}>
              <PlusIcon />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {open === i ? (
              <motion.div
                animate={{ height: "auto", opacity: 1 }}
                className="overflow-hidden"
                exit={{ height: 0, opacity: 0 }}
                initial={{ height: 0, opacity: 0 }}
              >
                <div className="pb-6 text-muted">{item.content}</div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
