import { AppNav } from "@/components/AppNav";
import { LoadingBlock } from "@/components/ui/LoadingBlock";

export default function ResidentLoading() {
  return (
    <>
      <AppNav current="/resident" />
      <LoadingBlock label="Loading form…" />
    </>
  );
}
