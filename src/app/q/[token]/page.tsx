import QuotationApprovalClient from "./QuotationApprovalClient";

export default async function QuotationApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <QuotationApprovalClient token={token} />;
}
