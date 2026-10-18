"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface HomeFaqItem {
  question: string;
  answer: string;
}

export function HomeFaq({ items }: { items: HomeFaqItem[] }) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="space-y-4">
      {items.map((faq, index) => {
        const isOpen = openFaq === index;
        return (
          <div
            key={faq.question}
            className="rounded-2xl border border-black-700 bg-black-800/50 backdrop-blur-md overflow-hidden transition-colors"
          >
            <button
              type="button"
              onClick={() => toggleFaq(index)}
              className="flex w-full items-center justify-between p-5 sm:p-6 text-left focus:outline-none"
            >
              <span className="text-16 sm:text-17 font-semibold text-white">
                {faq.question}
              </span>
              <span className="ml-4 shrink-0 rounded-full bg-black-700/80 p-1 text-black-300">
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </span>
            </button>

            {isOpen && (
              <div className="px-5 pb-6 sm:px-6 text-14 leading-relaxed text-black-300 border-t border-black-700/60 pt-4">
                {faq.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
