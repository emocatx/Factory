import { redirect } from "next/navigation";

export default async function Pilar({ params }: { params: Promise<{ pilar: string }> }) {
  const { pilar } = await params;
  redirect(`/p/${pilar}/ordenes`);
}
