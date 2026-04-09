import { redirect } from "next/navigation";

export default function Page() {
  redirect("/trade-records?tab=setups");
}
