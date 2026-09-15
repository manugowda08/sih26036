import { Suspense } from "react";
import NewApplicationPage from "./NewApplicationClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading application form...</div>}>
      <NewApplicationPage />
    </Suspense>
  );
}
