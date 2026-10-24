import { LegalPage } from "@/components/LegalPage";
export const dynamic = "force-dynamic";
export const metadata = { title: "Contact - Family SubSaver" };
export default function Page() {
  return (
    <LegalPage title="Contact">
      {(c) => <p>Write to {c.contact} for support, privacy requests, deletion or payment questions. Operator: {c.operator}.</p>}
    </LegalPage>
  );
}
