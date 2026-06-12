import type { CanonicalFieldKey, MasterProfile } from "@jobposted/shared";

function join(values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).filter(Boolean).join(" ");
}

export function valueForKey(profile: MasterProfile, key: CanonicalFieldKey): string | string[] | boolean | null {
  switch (key) {
    case "identity.fullName":
      return join([profile.identity.firstName, profile.identity.lastName]);
    case "identity.firstName":
      return profile.identity.firstName;
    case "identity.lastName":
      return profile.identity.lastName;
    case "identity.preferredName":
      return profile.identity.preferredName ?? profile.identity.firstName;
    case "identity.email":
      return profile.identity.email;
    case "identity.phone":
      return profile.identity.phone;
    case "location.street":
      return profile.location.street ?? null;
    case "location.city":
      return profile.location.city ?? null;
    case "location.state":
      return profile.location.state ?? null;
    case "location.postalCode":
      return profile.location.postalCode ?? null;
    case "location.country":
      return profile.location.country ?? null;
    case "links.portfolio":
      return profile.links.portfolio ?? null;
    case "links.linkedin":
      return profile.links.linkedin ?? null;
    case "links.github":
      return profile.links.github ?? null;
    case "links.website":
      return profile.links.website[0] ?? null;
    case "workAuth.authorizedToWork":
      return profile.workAuth.authorizedToWork;
    case "workAuth.requiresSponsorship":
      return profile.workAuth.requiresSponsorship;
    case "workAuth.country":
      return profile.workAuth.country ?? profile.location.country ?? null;
    case "demographics.gender":
      return profile.demographics?.gender ?? null;
    case "demographics.race":
      return profile.demographics?.race ?? [];
    case "demographics.veteranStatus":
      return profile.demographics?.veteranStatus ?? null;
    case "demographics.disabilityStatus":
      return profile.demographics?.disabilityStatus ?? null;
    case "demographics.hispanicLatino":
      return profile.demographics?.hispanicLatino ?? null;
    case "documents.resume":
      return profile.documents.resumeUrl ?? null;
    case "documents.coverLetter":
      return profile.documents.coverLetterUrl ?? null;
    case "experience":
      return profile.experience
        .map((item) => `${item.title} at ${item.company}\n${item.bullets.join("\n")}`)
        .join("\n\n");
    case "education":
      return profile.education
        .map((item) => join([item.degree ?? undefined, item.field ?? undefined, item.school]))
        .join("\n");
    case "skills":
      return profile.skills.join(", ");
    case "unknown":
      return null;
    default:
      if (key.startsWith("answers.")) {
        const answerKey = key.slice("answers.".length);
        return profile.answers.find((answer) => answer.key === answerKey)?.value ?? null;
      }
      return null;
  }
}
