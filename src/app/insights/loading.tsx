import { AppNav } from "@/components/AppNav";
import { LoadingBlock } from "@/components/ui/LoadingBlock";

export default function InsightsLoading() {
  return (
    <>
      <AppNav current="/insights" />
      <LoadingBlock label="Loading insights…" />
    </>
  );
}
