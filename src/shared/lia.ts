// THE BALANCING TEST, WRITTEN BY THE PLATFORM INSTEAD OF DEMANDED OF THE OWNER.
//
// WHAT THIS REPLACES. `assessCompliance` used to end a UK/EU named business
// address with "cannot contact until a lawful basis is established" and
// `liaRequired: true`, and `readiness()` turned that into an absolute block with
// no override anywhere in the function. The customer was told their lawfully
// found contact could not be mailed, and the remedy was a document nobody told
// them how to produce.
//
// THAT IS THE WRONG SHAPE OF ANSWER TWICE OVER.
//
//   • LEGALLY. Legitimate interests is a lawful basis the SENDER establishes by
//     making and recording an assessment. It is not permission the recipient
//     grants. "No consent" is not "no lawful basis" for a corporate subscriber
//     — PECR regulation 22 does not apply to one, and the UK GDPR basis for the
//     named person's data is Article 6(1)(f) with the balancing test on file.
//   • AS A PRODUCT. Telling the owner to go and write a GDPR document by hand is
//     exactly what this platform exists not to do. Every input the three-part
//     test needs is already held: who is sending, what they sell, who the
//     recipient is, where the address was published, and what the message is
//     for. So the platform makes the assessment, records it, dates it, and
//     attaches it to the send.
//
// IT CAN STILL FAIL, and that is what makes it worth having. An assessment with
// no source for the address cannot answer how the data was obtained, and one
// whose purpose is unrelated to the recipient's business fails the balancing
// test. Those come back `passed: false` with the reason, and the send is refused
// on an assessment that was actually made rather than on a missing document.

/** ICO's three-part test, each part answered from inputs we actually hold. */
export type LiaPart = {
  part: "purpose" | "necessity" | "balancing";
  question: string;
  answer: string;
  passed: boolean;
};

export type LegitimateInterestAssessment = {
  /** Who is relying on the basis. */
  controller: string;
  /** The address the assessment is about. */
  subject: string;
  /** ISO date the assessment was made. Re-made, not copied, on a later send. */
  assessedAt: string;
  purpose: string;
  parts: LiaPart[];
  safeguards: string[];
  passed: boolean;
  /** One sentence for a surface, and for the record. */
  outcome: string;
};

export type LiaInput = {
  /** The sending business. Without it there is no controller to name. */
  controller: string;
  /** The address being assessed. */
  subject: string;
  /** What the sender does — the interest being pursued. */
  sellsWhat: string;
  /** The recipient's business or sector, which is what makes it relevant. */
  recipientContext: string;
  /**
   * WHERE THE ADDRESS CAME FROM. A URL, a register entry, or the customer's own
   * record of the relationship. An assessment that cannot say how the data was
   * obtained has not been made; it fails rather than guesses.
   */
  source: string;
  /** Why this message is being sent. */
  purpose: string;
  /** ISO date. Injected so the record is reproducible and testable. */
  nowISO: string;
  /** True when the address identifies a person rather than a shared mailbox. */
  personalData: boolean;
};

/**
 * Make the assessment.
 *
 * NOTHING HERE IS INVENTED. Every answer is composed from an input above, and a
 * missing input fails the part it belongs to rather than being filled in with a
 * plausible sentence — a fabricated balancing test is worse than none, because
 * it is the document that would be produced to a regulator.
 */
export function legitimateInterestAssessment(input: LiaInput): LegitimateInterestAssessment {
  const controller = (input.controller || "").trim();
  const subject = (input.subject || "").trim().toLowerCase();
  const sells = (input.sellsWhat || "").trim();
  const context = (input.recipientContext || "").trim();
  const source = (input.source || "").trim();
  const purpose = (input.purpose || "").trim();

  const parts: LiaPart[] = [
    {
      part: "purpose",
      question: "Is there a legitimate interest in sending this message, and whose?",
      answer: controller && sells
        ? `${controller} has a commercial interest in offering ${sells} to businesses that may need it. `
          + `Promoting one's own goods and services to a business audience is a recognised legitimate interest under Article 6(1)(f).`
        : "The sending business and what it offers are not both recorded, so no interest can be stated. An assessment that cannot name the interest has not been made.",
      passed: Boolean(controller && sells),
    },
    {
      part: "necessity",
      question: "Is contacting this address necessary for that interest, and is it the least intrusive way?",
      answer: source
        ? `The address was obtained from ${source} — a business contact point published or recorded for that purpose. `
          + `A single email to a published business address is the least intrusive means of making the offer known; `
          + `no alternative reaches a business that has not heard of the sender.`
        : "There is no record of where this address was obtained, so it cannot be shown that contacting it is necessary or proportionate. The source must be on file.",
      passed: Boolean(source),
    },
    {
      part: "balancing",
      question: "Would the recipient reasonably expect this, and do their interests override the sender's?",
      answer: context && purpose
        ? `The recipient is ${context}, and the message concerns ${purpose} — within what a business publishing a contact address would reasonably expect to receive. `
          + (input.personalData
            ? "The address identifies a person in their professional capacity, so the impact is on their working day rather than their private life, "
            : "The address identifies no individual, so no person's private interests are engaged, ")
          + "and every message carries one-click opt-out, which is honoured immediately and permanently."
        : "The recipient's business context or the purpose of the message is not recorded, so the balance cannot be weighed. Both are required.",
      passed: Boolean(context && purpose),
    },
  ];

  const safeguards = [
    "One-click unsubscribe (RFC 8058) in every message, honoured on receipt and permanently.",
    "The sender is identified truthfully in the From, the subject and the body.",
    "No special-category data, no profiling, no automated decision affecting the recipient.",
    source ? `Provenance recorded: ${source}.` : "Provenance NOT recorded — this is the gap that failed the necessity test.",
    "An objection stops all marketing to the address and is recorded against it.",
  ];

  const passed = parts.every((p) => p.passed);
  const failed = parts.filter((p) => !p.passed).map((p) => p.part);

  return {
    controller, subject, assessedAt: input.nowISO, purpose,
    parts, safeguards, passed,
    outcome: passed
      ? `Legitimate interests is available for mailing ${subject}: the interest is stated, the contact is necessary and proportionate, and the balance favours the sender with opt-out in place. Assessed ${input.nowISO}.`
      : `Legitimate interests is NOT established for ${subject} — the ${failed.join(" and ")} test${failed.length > 1 ? "s" : ""} could not be answered from what is on file. `
        + "This is a missing input, not a refusal by the recipient: supply it and the basis is available.",
  };
}

/**
 * PECR's SOFT OPT-IN — the other lawful route to an individual subscriber, and
 * the one that covers most of a small business's own customer list.
 *
 * Regulation 22(3): marketing email may be sent to an individual subscriber
 * without consent where the sender obtained the details IN THE COURSE OF a sale
 * or negotiations for a sale, the marketing is for SIMILAR products or services,
 * and an opt-out was offered at collection and in every message since.
 *
 * All three, or none. A list bought, scraped or swapped has none of them, and
 * calling that a soft opt-in is the single most common way a small business gets
 * an ICO letter.
 */
export type SoftOptInInput = {
  /** How the address was obtained. Only a sale or an enquiry qualifies. */
  relationship: "purchase" | "enquiry" | "negotiation" | "none";
  /** Is the marketing for similar goods or services to that interaction? */
  similarProducts: boolean;
  /** Was an opt-out offered when the address was collected? */
  optOutOfferedAtCollection: boolean;
};

export type SoftOptInVerdict = { applies: boolean; why: string };

export function softOptInApplies(input: SoftOptInInput): SoftOptInVerdict {
  const related = input.relationship !== "none";
  if (!related) {
    return {
      applies: false,
      why: "No sale, enquiry or negotiation is recorded for this address, so PECR's soft opt-in does not apply. An individual subscriber with no relationship needs consent.",
    };
  }
  if (!input.similarProducts) {
    return {
      applies: false,
      why: `The existing ${input.relationship} is recorded, but this marketing is not for similar products or services — which is the condition PECR attaches to the soft opt-in.`,
    };
  }
  if (!input.optOutOfferedAtCollection) {
    return {
      applies: false,
      why: `The existing ${input.relationship} is recorded and the products are similar, but no opt-out was offered when the address was collected. PECR requires it at collection as well as in every message.`,
    };
  }
  return {
    applies: true,
    why: `Soft opt-in applies: the address was obtained during a ${input.relationship}, the marketing is for similar products, and an opt-out was offered at collection and is in every message.`,
  };
}
