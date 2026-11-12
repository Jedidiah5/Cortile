import { AppNav } from "@/components/AppNav";
import { LoadingBlock } from "@/components/ui/LoadingBlock";

export default function InboxLoading() {
  return (
    <>
      <AppNav current="/inbox" />
      <LoadingBlock label="Loading inbox…" />
    </>
  );
}
