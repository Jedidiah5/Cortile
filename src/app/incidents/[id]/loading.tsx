import { AppNav } from "@/components/AppNav";
import { LoadingBlock } from "@/components/ui/LoadingBlock";

export default function IncidentLoading() {
  return (
    <>
      <AppNav current="/inbox" />
      <LoadingBlock label="Loading incident…" />
    </>
  );
}
