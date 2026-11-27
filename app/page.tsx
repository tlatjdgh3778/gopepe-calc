import type { Metadata } from "next";

import { PyramidTerminal } from "@/components/pyramid/pyramid-terminal";

export const metadata: Metadata = {
  title: "피라미딩 계산기",
};

export default function Home() {
  return <PyramidTerminal />;
}
