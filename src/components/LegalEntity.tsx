import { icoRegistration } from "@/shared/site";

// Who the customer is actually contracting with.
//
// A UK business trading online must identify itself: legal name, geographic
// address, company registration number and place of registration (Companies Act
// 2006 s.82; Electronic Commerce (EC Directive) Regulations 2002 reg. 6). The
// Terms said only "MarketWar OS, operated at marketwaros.com" — a product name
// and a domain, which identifies nobody and leaves a customer with no way to
// know who they are paying or who to serve notice on.
//
// Driven by environment variables and rendered ONLY when they are set. The
// alternative — a plausible placeholder — would be worse than the gap: an
// invented company number in a contract is a fabrication in the one document
// where fabrication is least defensible.

const NAME = process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME || "";
const NUMBER = process.env.NEXT_PUBLIC_COMPANY_NUMBER || "";
const ADDRESS = process.env.NEXT_PUBLIC_REGISTERED_ADDRESS || "";
const VAT = process.env.NEXT_PUBLIC_VAT_NUMBER || "";

export const legalEntityConfigured = Boolean(NAME && ADDRESS);

/**
 * The data-protection registration, rendered whether or not the trading
 * identity is configured.
 *
 * It sits OUTSIDE the early return below on purpose. The old block was
 * all-or-nothing: with the company name still unset it printed "these details
 * are not yet published" and withheld the one identifier the operator HAS
 * supplied. A fact we hold and do not state is not caution, it is just a
 * smaller version of the same gap.
 */
function IcoLine() {
  const ico = icoRegistration();
  if (!ico) return null;
  return (
    <p className="text-[13px] text-slate-400">
      Registered with the UK Information Commissioner&rsquo;s Office, registration number{" "}
      <strong className="text-slate-200">{ico}</strong>.
    </p>
  );
}

export default function LegalEntity() {
  if (!legalEntityConfigured) {
    // Says what is missing rather than pretending it is not. Visible to the
    // owner on their own site, which is the fastest way for it to get fixed.
    return (
      <>
        <p>
          The operating entity&rsquo;s registered details are not yet published here. UK law requires a
          trading business to state its legal name, registered address and company number, so this
          section is incomplete until those are configured. In the meantime, contracts are with the
          operator of marketwaros.com and questions should go through the contact page.
        </p>
        <IcoLine />
      </>
    );
  }
  return (
    <>
      <p>
      The Service is operated by <strong>{NAME}</strong>
      {NUMBER ? <>, registered in England and Wales, company number {NUMBER}</> : null}
      {ADDRESS ? <>, registered office {ADDRESS}</> : null}
      {VAT ? <>. VAT registration number {VAT}</> : null}. Your contract for the Service is with that entity.
      </p>
      <IcoLine />
    </>
  );
}
